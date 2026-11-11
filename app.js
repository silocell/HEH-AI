/* Launchpad AI: a chat in the style of Claude. Free AIs with a daily quota,
   Claude for pence (Priority lets gpt-oss pick Haiku, Sonnet or Opus).
   Edit a sent message, try an answer again, attach text files, get files
   back as cards, memory you can see and delete. The server function
   (hwchat) does the safety check and takes out personal information. */
(function () {
  "use strict";
  var URL_ = "https://hehs-live.duckdns.org", KEY_ = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkyODMyMjkwLCJleHAiOjIxMDgxOTIyOTB9.7gFhQa5RBwVtiOPLO7Qf2-aVEbkd5xgpLiN1J06Gybo";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var html = document.documentElement, mob = matchMedia("(max-width:860px)");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var sb = null, user = null, thread = null, info = null, choice = "auto", busy = false, choices = [];
  var msgs = [], threads = [], attach = [], fileStore = [], pvFile = null;
  var ICON = { auto: "✨", fast: "⚡", maths: "🧠", writing: "✍️", code: "💻", gptoss: "🔷", qwen: "🟣", command: "🟢", mistral: "🟠", glm: "🔵", llama: "🦙", openrouter: "🔀", priority: "⭐", haiku: "🪶", sonnet: "🎼", opus: "🎻" };
  var GROUPS = [["auto", ""], ["helper", "Helpers (free)"], ["model", "Pick an AI (free)"], ["claude", "Claude (uses your pence)"]];
  var TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|css|js|mjs|ts|tsx|jsx|py|java|c|h|cpp|hpp|cs|go|rs|rb|php|lua|swift|kt|sql|xml|svg|yaml|yml|toml|ini|cfg|log|sh|bat|ps1|tex|srt|vtt|gd|sb3\.json)$/i;
  var FILE_MAX = 200000, FILES_CHARS = 40000;
  try { choice = localStorage.getItem("hl.ai.pick") || "auto"; } catch (e) {}
  try {
    sb = window.supabase.createClient(URL_, KEY_, { auth: { persistSession: true, autoRefreshToken: true, storage: (window.HEHAuth && window.HEHAuth.storage) || undefined } });
  } catch (e) { sb = null; }

  function toast(t) { var d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }
  function copy(t) {
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast("Copied."); }, function () {
      var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Copied."); } catch (e) {} ta.remove(); });
  }
  function kb(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
  function ext(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toLowerCase() : "txt"; }
  var MIME = { html: "text/html", htm: "text/html", svg: "image/svg+xml", md: "text/markdown", csv: "text/csv", json: "application/json", js: "text/javascript", css: "text/css", py: "text/x-python", xml: "application/xml" };
  function download(name, text) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: (MIME[ext(name)] || "text/plain") + ";charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* theme, shared with every Launchpad site */
  (function () {
    var btn = $("themeBtn");
    function cur() { return html.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
    function show() { btn.textContent = cur() === "dark" ? "☀️" : "🌙"; btn.title = cur() === "dark" ? "Light mode" : "Dark mode"; }
    btn.onclick = function () {
      var t = cur() === "dark" ? "light" : "dark"; html.setAttribute("data-theme", t);
      try { document.cookie = "hl_theme=" + t + "; domain=.civilinitiatives.org; path=/; max-age=34560000; samesite=lax"; } catch (e) {}
      try { localStorage.setItem("hl.theme", JSON.stringify(t)); } catch (e) {}
      show();
    };
    show();
  })();

  /* sidebar open and shut */
  function side(open) {
    if (mob.matches) { html.classList.toggle("sideopen", open); return; }
    html.classList.toggle("noside", !open); try { localStorage.setItem("hl.ai.side", open ? "1" : "0"); } catch (e) {}
  }
  $("sideOpen").onclick = function () { side(true); };
  $("sideClose").onclick = function () { side(false); };

  /* ---------- Markdown, escaped first; ```file:name blocks become file cards ---------- */
  function inline(s) {
    return s.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; })
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function mdText(p) {
    var out = "", lines = esc(p).split("\n"), list = null, para = [], i = 0;
    function fp() { if (para.length) { out += "<p>" + para.map(inline).join("<br>") + "</p>"; para = []; } }
    function fl() { if (list) { out += "<" + list.t + ">" + list.items.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</" + list.t + ">"; list = null; } }
    for (; i < lines.length; i++) {
      var l = lines[i], m;
      if (!l.trim()) { fp(); fl(); continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].indexOf("-") >= 0) {
        fp(); fl(); var cells = function (r) { return r.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return inline(c.trim()); }); };
        var head = cells(l), body = []; i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
        i--; out += "<table><thead><tr>" + head.map(function (c) { return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" +
          body.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table>"; continue;
      }
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) { fp(); fl(); var lv = Math.min(4, m[1].length + 1); out += "<h" + lv + ">" + inline(m[2]) + "</h" + lv + ">"; continue; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) { fp(); fl(); out += "<hr>"; continue; }
      if ((m = l.match(/^&gt;\s?(.*)/))) { fp(); fl(); out += "<blockquote>" + inline(m[1]) + "</blockquote>"; continue; }
      if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { fp(); if (!list || list.t !== "ul") { fl(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
      if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { fp(); if (!list || list.t !== "ol") { fl(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
      if (list && /^\s{2,}\S/.test(l)) { list.items[list.items.length - 1] += " " + l.trim(); continue; }
      fl(); para.push(l);
    }
    fp(); fl(); return out;
  }
  // splits text into prose and fenced blocks; an unclosed block (while typing) counts too
  function blocks(t) {
    var out = [], re = /^(`{3,})([^\n`]*)\n?/m, rest = String(t || "");
    while (rest.length) {
      var m = re.exec(rest);
      if (!m) { out.push({ t: "text", s: rest }); break; }
      if (m.index) out.push({ t: "text", s: rest.slice(0, m.index) });
      rest = rest.slice(m.index + m[0].length);
      var end = new RegExp("^`{" + m[1].length + ",}[ \\t]*$", "m").exec(rest), code = end ? rest.slice(0, end.index) : rest;
      out.push({ t: "code", info: m[2].trim(), s: code.replace(/\n$/, ""), open: !end });
      rest = end ? rest.slice(end.index + end[0].length).replace(/^\n/, "") : "";
    }
    return out;
  }
  function md(t, live) {
    return blocks(t).map(function (b) {
      if (b.t === "text") return mdText(b.s);
      var f = /^file:\s*(.+)$/i.exec(b.info);
      if (f) {
        var name = f[1].trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "file.txt", id = fileStore.push({ name: name, text: b.s }) - 1;
        return '<div class="fcard"><span class="fi">' + esc(ext(name).slice(0, 4)) + '</span><span class="fn"><b>' + esc(name) + "</b><small>" +
          (live && b.open ? "Writing…" : kb(new Blob([b.s]).size) + " · " + b.s.split("\n").length + " lines") + "</small></span>" +
          (live && b.open ? "" : '<button class="ib" type="button" data-open="' + id + '">Open</button><button class="ib" type="button" data-down="' + id + '">Download</button>') + "</div>";
      }
      var cid = fileStore.push({ name: "code." + (b.info || "txt"), text: b.s }) - 1;
      return '<div class="code"><header><span>' + esc(b.info || "code") + '</span><button class="ib" type="button" data-copy="' + cid + '">Copy</button></header><pre><code>' + esc(b.s) + "</code></pre></div>";
    }).join("");
  }

  /* ---------- the conversation ---------- */
  var log = $("log"), scroller = $("scroll");
  function atBottom() { return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80; }
  function down(force) { if (force || atBottom()) scroller.scrollTop = scroller.scrollHeight; }
  function hour() { var h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }
  function hello() {
    $("main").classList.add("empty");
    log.innerHTML = '<div class="hello"><h1><span class="mark" aria-hidden="true">✦</span>' + hour() + "</h1><p>" + freeLine() + "</p></div>";
    var ideas = document.createElement("div"); ideas.className = "ideas"; ideas.id = "ideas";
    ideas.innerHTML = ["Write a paragraph about the water cycle", "Make me revision notes on cells", "Help me fix my Python code", "Quiz me on French verbs", "Make a simple web page game"].map(function (q) {
      return '<button type="button" data-q="' + esc(q) + '">' + esc(q) + "</button>"; }).join("");
    var old = $("ideas"); if (old) old.remove();
    $("dock").insertBefore(ideas, $("dock").querySelector(".fine"));
  }
  function unhello() { $("main").classList.remove("empty"); var i = $("ideas"); if (i) i.remove(); var h = log.querySelector(".hello"); if (h) h.remove(); }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-q]"); if (b) { $("text").value = b.dataset.q; grow(); send(); } });

  function chipsHtml(files, removable) {
    return (files || []).map(function (f, i) {
      return removable ? '<span class="chip">📄 <span>' + esc(f.name) + "</span><small>" + kb(f.size || f.text.length) + '</small><button type="button" data-unatt="' + i + '" aria-label="Remove ' + esc(f.name) + '">✕</button></span>'
        : '<button type="button" class="chip" data-attview="' + (fileStore.push({ name: f.name, text: f.text }) - 1) + '">📄 <span>' + esc(f.name) + "</span></button>";
    }).join("");
  }
  function byLine(m) { return (m.model || "") + (m.pence ? " · " + m.pence + "p" : ""); }
  function render() {
    fileStore = []; unhello(); log.textContent = "";
    if (!msgs.length) { hello(); return; }
    var lastAi = -1; msgs.forEach(function (m, i) { if (m.role === "ai") lastAi = i; });
    msgs.forEach(function (m, i) { log.appendChild(turn(m, i, i === lastAi)); });
  }
  function turn(m, i, last) {
    var d = document.createElement("div"); d.className = "turn" + (last ? " last" : ""); d.dataset.i = i;
    if (m.role === "note") { d.className = "note"; d.innerHTML = m.html || esc(m.body); return d; }
    if (m.role === "user") {
      d.classList.add("u");
      d.innerHTML = (m.files && m.files.length ? '<div class="chips">' + chipsHtml(m.files) + "</div>" : "") +
        (m.body ? '<div class="bub">' + esc(m.body) + "</div>" : "") +
        '<div class="acts">' + (m.id ? '<button class="ib" type="button" data-edit="' + i + '" title="Edit and send again">✎ Edit</button>' : "") +
        '<button class="ib" type="button" data-copytext="' + i + '">Copy</button></div>';
      return d;
    }
    d.classList.add("a"); if (m.err) d.classList.add("err");
    d.innerHTML = '<span class="mark" aria-hidden="true">✦</span><div><div class="body">' + (m.typing ? "" : m.err ? esc(m.body) : md(m.body)) + "</div>" +
      (m.remembered && m.remembered.length ? '<button type="button" class="memo" data-mem="1">🧠 Memory updated: ' + esc(m.remembered.join("; ")) + "</button>" : "") +
      '<div class="acts">' + (m.err ? "" : '<button class="ib" type="button" data-copytext="' + i + '">Copy</button>') +
      (last && userBefore(i) >= 0 ? '<button class="ib" type="button" data-retry="' + i + '" title="Ask again with ' + esc(labelOf(choice)) + '">↻ Retry</button>' : "") +
      (m.model ? '<span class="by">' + esc(byLine(m)) + "</span>" : "") + "</div></div>";
    return d;
  }
  function userBefore(i) { for (var j = i - 1; j >= 0; j--) if (msgs[j].role === "user") return msgs[j].id ? j : -1; return -1; }
  function labelOf(id) { var c = choices.filter(function (x) { return x.id === id; })[0]; return c ? c.label : "Auto"; }

  log.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.dataset.copy != null) copy(fileStore[+t.dataset.copy].text);
    else if (t.dataset.copytext != null) copy(msgs[+t.dataset.copytext].body);
    else if (t.dataset.open != null) openPanel(fileStore[+t.dataset.open]);
    else if (t.dataset.attview != null) openPanel(fileStore[+t.dataset.attview]);
    else if (t.dataset.down != null) { var f = fileStore[+t.dataset.down]; download(f.name, f.text); }
    else if (t.dataset.edit != null) editAt(+t.dataset.edit);
    else if (t.dataset.retry != null) { var j = userBefore(+t.dataset.retry); if (j >= 0) ask(msgs[j].body, msgs[j].files || [], msgs[j].id, j); }
    else if (t.dataset.mem) openMemory();
    else if (t.dataset.usehaiku) { choice = "haiku"; saveChoice(); drawModel(); toast("Switched to Claude Haiku."); }
  });

  function editAt(i) {
    if (busy) return;
    var m = msgs[i], node = log.querySelector('.turn[data-i="' + i + '"]'); if (!node) return;
    var box = document.createElement("div"); box.className = "edit";
    box.innerHTML = '<textarea aria-label="Edit your message"></textarea><div><button class="btn" type="button" data-x>Cancel</button><button class="btn go" type="button" data-s>Send</button></div>';
    var ta = box.querySelector("textarea"); ta.value = m.body;
    node.querySelector(".bub") ? node.querySelector(".bub").replaceWith(box) : node.prepend(box);
    node.querySelector(".acts").hidden = true;
    var fit = function () { ta.style.height = "auto"; ta.style.height = Math.min(320, ta.scrollHeight) + "px"; }; fit(); ta.oninput = fit;
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    box.querySelector("[data-x]").onclick = render;
    var go = function () { var t = ta.value.trim(); if (!t && !(m.files && m.files.length)) return; ask(t, m.files || [], m.id, i); };
    box.querySelector("[data-s]").onclick = go;
    ta.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } if (e.key === "Escape") render(); };
  }

  /* the answer appears word by word, like it's being written */
  function reveal(el, text, done) {
    var words = text.split(/(\s+)/), n = 0, step = Math.max(2, Math.ceil(words.length / 90));
    if (reduce || words.length < 6) { el.innerHTML = md(text); done(); return; }
    (function tick() {
      n = Math.min(words.length, n + step);
      el.innerHTML = md(words.slice(0, n).join(""), n < words.length); down();
      if (n < words.length) setTimeout(tick, 22); else done();
    })();
  }

  function thinkingText() {
    if (choice === "priority") return "Choosing Haiku, Sonnet or Opus";
    if (choice === "auto") return "Picking the best AI";
    return labelOf(choice) + " is thinking";
  }

  /* send a message: a new one, an edited one (cut = its id) or a retry */
  function ask(text, files, cut, at) {
    if (busy || !user) return;
    busy = true; setSend();
    if (cut) msgs = msgs.slice(0, at);
    msgs.push({ role: "user", body: text, files: files, pending: true });
    render();
    var wait = document.createElement("div"); wait.className = "turn a";
    wait.innerHTML = '<span class="mark" aria-hidden="true">✦</span><div class="think"><i></i><span>' + esc(thinkingText()) + "…</span></div>";
    log.appendChild(wait); down(true);
    var payload = { action: "send", thread: thread, text: text, model: choice, files: files.map(function (f) { return { name: f.name, text: f.text }; }) };
    if (cut) payload.cut = cut;
    sb.functions.invoke("hwchat", { body: payload }).then(function (r) {
      if (r.error && !r.data) return (r.error.context && r.error.context.json ? r.error.context.json() : Promise.resolve(null)).then(function (x) { return x || { error: r.error.message || "Something went wrong." }; }, function () { return { error: "Something went wrong." }; });
      return r.data;
    }).then(function (d) {
      wait.remove();
      if (d && d.thread && d.thread !== thread) { thread = d.thread; history.replaceState(null, "", "?c=" + encodeURIComponent(thread)); }
      var u = msgs[msgs.length - 1];
      if (!d || d.error) {
        if (cut) { reloadAfterError((d && d.error) || "Something went wrong - try again."); return; }
        msgs.pop(); render();
        msgs.push({ role: "ai", err: true, body: (d && d.error) || "Something went wrong - try again." });
        if (d && d.outOfFree) msgs.push({ role: "note", html: 'Out of free messages for today. <button type="button" data-usehaiku="1">Use Claude Haiku' + (info ? " (" + info.haiku_pence + "p)" : "") + "</button>" });
        render(); $("text").value = text; grow(); setSend(); return;
      }
      u.id = d.user_id; u.pending = false;
      if (d.removed && d.removed.length) msgs.push({ role: "note", body: "🔒 I took out " + d.removed.join(", ") + " before sending - please don't share personal information." });
      if (d.compacted) msgs.push({ role: "note", body: "This chat is getting long, so older messages were summarised to keep it going." });
      var a = { role: "ai", id: d.ai_id, body: d.reply, model: d.by, pence: d.pence, remembered: d.remembered, typing: true };
      msgs.push(a); render();
      var body = log.querySelector(".turn.a.last .body");
      var finish = function () { delete a.typing; render(); };
      if (body) reveal(body, d.reply, finish); else finish();
    }).catch(function () { wait.remove(); msgs.pop(); render(); msgs.push({ role: "ai", err: true, body: "Couldn't reach the server - check your internet and try again." }); render(); $("text").value = text; })
      .then(function () { busy = false; setSend(); loadInfo(); listThreads(); if (!mob.matches) $("text").focus(); });
  }
  function reloadAfterError(why) {
    openThread(thread, function () { msgs.push({ role: "ai", err: true, body: why }); render(); });
  }

  function send() {
    var t = $("text").value.trim(); if ((!t && !attach.length) || busy || !user) return;
    var files = attach.slice(); attach = []; drawAtt();
    $("text").value = ""; grow();
    ask(t, files, null, 0);
  }
  $("form").onsubmit = function (e) { e.preventDefault(); send(); };
  function setSend() { $("sendBtn").disabled = busy || (!$("text").value.trim() && !attach.length); }
  function grow() { var ta = $("text"); ta.style.height = "auto"; ta.style.height = Math.min(240, ta.scrollHeight) + "px"; setSend(); }
  $("text").addEventListener("input", grow);
  $("text").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });

  /* ---------- attaching files (text and code; read here, sent as text) ---------- */
  function addFiles(list) {
    Array.prototype.forEach.call(list, function (f) {
      if (attach.length >= 5) { toast("Up to 5 files at a time."); return; }
      if (!TEXT_EXT.test(f.name) && !/^text\//.test(f.type)) { toast(f.name + ": only text and code files for now - copy the text in instead."); return; }
      if (f.size > FILE_MAX) { toast(f.name + " is too big (up to " + kb(FILE_MAX) + ")."); return; }
      f.text().then(function (t) {
        if (/\u0000/.test(t.slice(0, 2000))) { toast(f.name + " isn't a text file."); return; }
        var used = attach.reduce(function (n, a) { return n + a.text.length; }, 0);
        if (used >= FILES_CHARS) { toast("That's as much as one message can take."); return; }
        if (used + t.length > FILES_CHARS) { t = t.slice(0, FILES_CHARS - used); toast(f.name + " was cut short to fit."); }
        attach.push({ name: f.name, text: t, size: f.size }); drawAtt();
      });
    });
  }
  function drawAtt() { var a = $("att"); a.hidden = !attach.length; a.innerHTML = chipsHtml(attach, true); setSend(); }
  $("att").addEventListener("click", function (e) { var b = e.target.closest("[data-unatt]"); if (b) { attach.splice(+b.dataset.unatt, 1); drawAtt(); } });
  $("attBtn").onclick = function () { $("fileIn").click(); };
  $("fileIn").onchange = function () { addFiles(this.files); this.value = ""; };
  var form = $("form");
  ["dragenter", "dragover"].forEach(function (ev) { form.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) { e.preventDefault(); form.classList.add("drag"); } }); });
  ["dragleave", "drop"].forEach(function (ev) { form.addEventListener(ev, function () { form.classList.remove("drag"); }); });
  form.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  $("text").addEventListener("paste", function (e) { var f = e.clipboardData && e.clipboardData.files; if (f && f.length) { e.preventDefault(); addFiles(f); } });

  /* ---------- the file panel (preview, code, copy, download) ---------- */
  function openPanel(f) {
    pvFile = f; $("panel").hidden = false; $("pvName").textContent = f.name;
    var e = ext(f.name), canView = /^(html?|svg|md|markdown|csv)$/.test(e);
    $("pvSeg").hidden = !canView; showPv(canView ? "view" : "code");
  }
  function showPv(v) {
    var f = pvFile, e = ext(f.name), pv = $("pv"); pv.textContent = "";
    Array.prototype.forEach.call($("pvSeg").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === v)); });
    if (v === "code") { var pre = document.createElement("pre"); pre.textContent = f.text; pv.appendChild(pre); return; }
    if (/^html?$/.test(e)) { var fr = document.createElement("iframe"); fr.setAttribute("sandbox", "allow-scripts allow-modals"); fr.setAttribute("title", f.name); fr.srcdoc = f.text; pv.appendChild(fr); return; }
    if (e === "svg") { var img = document.createElement("img"); img.alt = f.name; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(f.text); pv.appendChild(img); return; }
    var div = document.createElement("div"); div.className = "body";
    if (e === "csv") {
      var rows = f.text.trim().split(/\r?\n/).slice(0, 500).map(function (r) { return "| " + r.split(",").join(" | ") + " |"; });
      if (rows.length) rows.splice(1, 0, "|" + rows[0].split("|").slice(1, -1).map(function () { return " --- "; }).join("|") + "|");
      div.innerHTML = mdText(rows.join("\n"));
    } else div.innerHTML = md(f.text);
    pv.appendChild(div);
  }
  $("pvSeg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) showPv(b.dataset.v); });
  $("pvClose").onclick = function () { $("panel").hidden = true; $("pv").textContent = ""; };
  $("pvCopy").onclick = function () { copy(pvFile.text); };
  $("pvDown").onclick = function () { download(pvFile.name, pvFile.text); };

  /* ---------- picking the AI, inside the composer ---------- */
  function priceOf(id) {
    if (!info) return "";
    if (id === "priority") return info.haiku_pence + "–" + (info.opus_pence != null ? info.opus_pence : info.sonnet_pence) + "p";
    var p = info[id + "_pence"]; return p == null ? "" : p + "p";
  }
  function saveChoice() { try { localStorage.setItem("hl.ai.pick", choice); } catch (e) {} }
  function drawModel() {
    var c = choices.filter(function (x) { return x.id === choice; })[0] || choices[0]; if (!c) return;
    $("modelBtn").innerHTML = (ICON[c.id] || "🤖") + " " + esc(c.label) + (c.free ? "" : " <small>" + esc(priceOf(c.id)) + "</small>") + " ▾";
    $("modelBtn").title = c.sub;
  }
  function drawMenu() {
    var m = $("menu"), out = "";
    GROUPS.forEach(function (g) {
      var list = choices.filter(function (c) { return (c.group || (c.free ? (c.id === "auto" ? "auto" : "helper") : "claude")) === g[0]; });
      if (!list.length) return;
      if (g[1]) out += "<h3>" + esc(g[1]) + "</h3>";
      out += list.map(function (c) {
        return '<button type="button" class="opt" role="menuitemradio" aria-checked="' + (c.id === choice) + '" data-pick="' + esc(c.id) + '"><span class="ic">' + (ICON[c.id] || "🤖") + "</span><b>" + esc(c.label) + "</b>" +
          (c.free ? "<span></span>" : "<em>" + esc(priceOf(c.id)) + "</em>") + "<small>" + esc(c.sub) + "</small></button>";
      }).join("");
    });
    if (info && !info.unlimited) out += '<h3 style="margin-top:10px">' + Math.max(0, info.free_per_day - info.free_used) + " free messages left today · " + Number(info.pence).toLocaleString("en-GB") + "p to spend</h3>";
    m.innerHTML = out;
  }
  function menu(open) {
    var m = $("menu"); if (open == null) open = m.hidden;
    if (open) { drawMenu(); m.hidden = false; $("modelBtn").setAttribute("aria-expanded", "true"); var cur = m.querySelector('[aria-checked="true"]'); (cur || m.querySelector(".opt")).focus(); }
    else { m.hidden = true; $("modelBtn").setAttribute("aria-expanded", "false"); }
  }
  $("modelBtn").onclick = function () { menu(); };
  $("menu").addEventListener("click", function (e) {
    var b = e.target.closest("[data-pick]"); if (!b) return;
    choice = b.dataset.pick; saveChoice(); drawModel(); menu(false); $("text").focus(); render();
  });
  $("menu").addEventListener("keydown", function (e) {
    var opts = Array.prototype.slice.call($("menu").querySelectorAll(".opt")), i = opts.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); (opts[i + 1] || opts[0]).focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); (opts[i - 1] || opts[opts.length - 1]).focus(); }
    if (e.key === "Escape") { menu(false); $("modelBtn").focus(); }
  });
  document.addEventListener("click", function (e) { if (!$("menu").hidden && !e.target.closest("#menu,#modelBtn")) menu(false); });

  /* ---------- free quota ---------- */
  function freeLine() {
    if (!info) return "Ask anything: questions, ideas, coding, stories or homework.";
    if (info.unlimited) return "Unlimited free messages on your account.";
    var left = Math.max(0, info.free_per_day - info.free_used);
    return left + " of " + info.free_per_day + " free messages left today. Claude uses your Launchpad pence.";
  }
  function meter() {
    var q = $("quota"); if (!info) { q.hidden = true; return; }
    q.hidden = false;
    if (info.unlimited) { q.className = "quota"; q.style.setProperty("--p", 1); $("quotaText").textContent = "Unlimited"; }
    else {
      var left = Math.max(0, info.free_per_day - info.free_used), p = info.free_per_day ? left / info.free_per_day : 0;
      q.className = "quota" + (left === 0 ? " out" : p < 0.2 ? " low" : ""); q.style.setProperty("--p", p);
      $("quotaText").innerHTML = "<b>" + left + "</b><span class=\"lbl\"> free left</span>";
    }
    q.title = (info.unlimited ? "Unlimited free messages" : "Free messages left today (tops up at midnight)") + " · " + Number(info.pence).toLocaleString("en-GB") + "p for Claude";
    var h = log.querySelector(".hello p"); if (h) h.textContent = freeLine();
    $("sideFoot").textContent = "Only you can see your chats · " + Number(info.pence).toLocaleString("en-GB") + "p";
    $("memState").textContent = info.memory_on == null ? "" : info.memory_on ? "on" : "off";
    $("memBtn").hidden = info.memory_on == null;   // needs command 17 on the server
    drawModel();
  }
  function loadInfo() { return sb.rpc("hw_info").then(function (r) { if (!r.error && r.data) { info = r.data; meter(); } }); }

  /* ---------- memory ---------- */
  function openMemory() {
    if (mob.matches) side(false);
    $("memOn").checked = !!(info && info.memory_on); $("facts").innerHTML = '<li><span style="color:var(--faint)">Loading…</span></li>';
    $("memDlg").showModal(); drawFacts();
  }
  function drawFacts() {
    sb.from("hw_memory").select("id,fact").order("id").then(function (r) {
      var rows = r.data || [];
      $("facts").innerHTML = rows.map(function (f) { return '<li><span>' + esc(f.fact) + '</span><button class="ib" type="button" data-forget="' + f.id + '" aria-label="Delete this note">🗑</button></li>'; }).join("") ||
        '<li><span style="color:var(--faint)">' + ($("memOn").checked ? "Nothing yet. Notes appear here as you chat." : "Memory is off.") + "</span></li>";
      $("memForget").hidden = !rows.length;
    });
  }
  $("memBtn").onclick = openMemory;
  $("memDone").onclick = function () { $("memDlg").close(); };
  $("memOn").onchange = function () {
    var on = this.checked;
    sb.rpc("hw_memory_set", { on_: on }).then(function (r) {
      if (r.error) { toast("Couldn't change memory just now."); $("memOn").checked = !on; return; }
      if (info) info.memory_on = on; meter(); drawFacts(); toast(on ? "Memory is on." : "Memory is off, and everything it kept is deleted.");
    });
  };
  $("facts").addEventListener("click", function (e) { var b = e.target.closest("[data-forget]"); if (b) sb.from("hw_memory").delete().eq("id", +b.dataset.forget).then(drawFacts); });
  $("memForget").onclick = function () {
    var b = this; if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Delete every note?"; setTimeout(function () { delete b.dataset.armed; b.textContent = "Forget everything"; }, 3000); return; }
    sb.from("hw_memory").delete().gt("id", 0).then(function () { delete b.dataset.armed; b.textContent = "Forget everything"; drawFacts(); toast("Forgotten."); });
  };

  /* ---------- the list of chats ---------- */
  function listThreads() {
    return sb.from("hw_threads").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(200).then(function (r) { threads = r.data || []; drawThreads(); });
  }
  function drawThreads() {
    var q = $("find").value.trim().toLowerCase(), now = new Date(), day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var buckets = [["Today", []], ["Yesterday", []], ["Previous 7 days", []], ["Older", []]];
    threads.filter(function (t) { return !q || t.title.toLowerCase().indexOf(q) >= 0; }).forEach(function (t) {
      var at = new Date(t.updated_at).getTime();
      buckets[at >= day ? 0 : at >= day - 864e5 ? 1 : at >= day - 7 * 864e5 ? 2 : 3][1].push(t);
    });
    var out = buckets.filter(function (b) { return b[1].length; }).map(function (b) {
      return '<div class="grp">' + b[0] + "</div>" + b[1].map(function (t) {
        return '<div class="th" data-id="' + esc(t.id) + '"' + (t.id === thread ? ' aria-current="true"' : "") + '><a href="?c=' + esc(t.id) + '" title="' + esc(t.title) + '">' + esc(t.title) + '</a><button class="ib" type="button" data-ren="' + esc(t.id) + '" aria-label="Rename" title="Rename">✎</button><button class="ib" type="button" data-del="' + esc(t.id) + '" aria-label="Delete" title="Delete">🗑</button></div>';
      }).join("");
    }).join("");
    $("threads").innerHTML = out || '<p class="grp" style="font-weight:400">' + (q ? "No chats match." : "No chats yet.") + "</p>";
    var cur = threads.filter(function (t) { return t.id === thread; })[0];
    $("title").hidden = !cur; if (cur) $("title").textContent = cur.title;
  }
  $("find").addEventListener("input", drawThreads);
  function rename(id, node) {
    var t = threads.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var inp = document.createElement("input"); inp.value = t.title; inp.maxLength = 80; inp.setAttribute("aria-label", "Chat name");
    node.replaceWith(inp); inp.focus(); inp.select();
    var done = false, finish = function (save) {
      if (done) return; done = true; var v = inp.value.trim();
      if (save && v && v !== t.title) { t.title = v; sb.rpc("hw_rename", { tid: id, t: v }).then(function () {}); }
      drawThreads();
    };
    inp.onkeydown = function (e) { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
    inp.onblur = function () { finish(true); };
  }
  $("threads").addEventListener("click", function (e) {
    var del = e.target.closest("[data-del]"), ren = e.target.closest("[data-ren]");
    if (ren) { rename(ren.dataset.ren, ren.closest(".th").querySelector("a")); return; }
    if (del) {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Delete?"; setTimeout(function () { if (del.isConnected) { delete del.dataset.armed; del.textContent = "🗑"; } }, 3000); return; }
      sb.from("hw_threads").delete().eq("id", del.dataset.del).then(function () { if (del.dataset.del === thread) newChat(); listThreads(); toast("Chat deleted."); });
      return;
    }
    var a = e.target.closest("a"); if (!a) return;
    e.preventDefault(); openThread(a.closest(".th").dataset.id); if (mob.matches) side(false);
  });
  $("title").onclick = function () { var b = this; if (!thread) return;
    var inp = document.createElement("input"); inp.className = "title"; inp.style.border = "1px solid var(--a1)"; inp.value = b.textContent; b.hidden = true; b.after(inp); inp.focus(); inp.select();
    var done = false, fin = function (s) { if (done) return; done = true; var v = inp.value.trim(); inp.remove(); b.hidden = false;
      if (s && v) { b.textContent = v; var t = threads.filter(function (x) { return x.id === thread; })[0]; if (t) t.title = v; drawThreads(); sb.rpc("hw_rename", { tid: thread, t: v }).then(function () {}); } };
    inp.onkeydown = function (e) { if (e.key === "Enter") fin(true); if (e.key === "Escape") fin(false); }; inp.onblur = function () { fin(true); };
  };

  function openThread(id, then) {
    thread = id; history.replaceState(null, "", "?c=" + encodeURIComponent(id)); drawThreads();
    unhello(); log.innerHTML = '<p class="note">Loading…</p>';
    sb.from("hw_messages").select("id,role,body,model,pence,files").eq("thread_id", id).order("id").limit(500).then(function (r) {
      msgs = (r.data || []).map(function (m) { return { id: m.id, role: m.role, body: m.body, model: m.role === "ai" ? m.model : "", pence: m.pence, files: m.files }; });
      render(); down(true); if (then) then();
    });
  }
  function newChat() { thread = null; msgs = []; history.replaceState(null, "", location.pathname); $("panel").hidden = true; hello(); drawThreads(); $("text").focus(); }
  $("newBtn").onclick = function () { newChat(); if (mob.matches) side(false); };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "O" || e.key === "o")) { e.preventDefault(); newChat(); }
    if (e.key === "Escape" && !$("panel").hidden && !$("memDlg").open) $("panel").hidden = true;
  });

  function gate(h) { $("main").innerHTML = '<div class="gate"><div class="mark">✦</div>' + h + "</div>"; $("side").style.display = "none"; }
  if (!sb) { gate("<h2>Launchpad AI</h2><p>Couldn't load. Check your internet and refresh.</p>"); return; }
  if (mob.matches) html.classList.remove("noside");
  sb.auth.getSession().then(function (s) {
    user = s.data && s.data.session && s.data.session.user;
    if (!user) { gate('<h2>Launchpad AI</h2><p>A free AI chat with a daily free quota. Sign in on the Launchpad to start.</p><a class="btn go" href="https://civilinitiatives.org/">Sign in on the Launchpad</a>'); return; }
    sb.rpc("my_features").then(function (f) {
      if (f.data && f.data.hwchat === false) { gate("<h2>Launchpad AI</h2><p>Launchpad AI is switched off for your account just now.</p>"); return; }
      sb.functions.invoke("hwchat", { body: { action: "models" } }).then(function (r) {
        choices = (r.data && r.data.choices) || [];
        if (!choices.length) { gate("<h2>Launchpad AI</h2><p>Launchpad AI needs the latest Launchpad update on the server.</p>"); return; }
        if (!choices.some(function (c) { return c.id === choice; })) choice = "auto";
        drawModel(); loadInfo();
        var c = new URLSearchParams(location.search).get("c");
        listThreads(); if (c) openThread(c); else hello();
        $("text").focus();
      });
    });
  });
})();
