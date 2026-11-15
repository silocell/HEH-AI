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
  var sb = null, user = null, thread = null, info = null, choice = "auto", busy = false, choices = [], allModels = [], allQuery = "";
  var msgs = [], threads = [], attach = [], fileStore = [], pvFile = null;
  var ICON = { inhouse: "✦", hwlai: "🔎", kimi: "🌙", gemma: "💎", nemotron: "🟩", deepseek: "🐋", minimax: "🧩", auto: "✨", fast: "⚡", maths: "🧠", writing: "✍️", code: "💻", gptoss: "🔷", qwen: "🟣", command: "🟢", mistral: "🟠", glm: "🔵", llama: "🦙", openrouter: "🔀", priority: "⭐", haiku: "🪶", sonnet: "🎼", opus: "🎻" };
  var GROUPS = [["auto", ""], ["inhouse", ""], ["helper", "Helpers (free)"], ["model", "Pick an AI (free)"], ["claude", "Claude (uses your pence)"]];
  var TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|css|js|mjs|ts|tsx|jsx|py|java|c|h|cpp|hpp|cs|go|rs|rb|php|lua|swift|kt|sql|xml|svg|yaml|yml|toml|ini|cfg|log|sh|bat|ps1|tex|srt|vtt|gd|sb3\.json)$/i;
  var FILE_MAX = 200000, FILES_CHARS = 40000;
  /* Launchpad AI (our own gpt-oss-120b) is the default; "hl.ai.pick2" so everyone starts on it once */
  try { choice = localStorage.getItem("hl.ai.pick2") || "inhouse"; } catch (e) { choice = "inhouse"; }
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
  function byLine(m) { return (m.model || "") + (m.pence ? " · " + m.pence + "p" : "") + (m.stopped ? (m.model ? " · " : "") + "Stopped" : ""); }
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
    d.innerHTML = '<span class="mark" aria-hidden="true">✦</span><div><div class="body">' + (m.typing ? "" : m.err ? esc(m.body) : cites(md(m.body), m.sources)) + "</div>" +
      (m.sources && m.sources.length && !m.typing ? sourcesHtml(m.sources) : "") +
      (m.action && !m.typing ? actionHtml(m.action, i) : "") +
      (m.remembered && m.remembered.length ? '<button type="button" class="memo" data-mem="1">🧠 Memory updated: ' + esc(m.remembered.join("; ")) + "</button>" : "") +
      '<div class="acts">' + (m.err ? "" : '<button class="ib" type="button" data-copytext="' + i + '">Copy</button>') +
      (last && userBefore(i) >= 0 ? '<button class="ib" type="button" data-retry="' + i + '" title="Ask again with ' + esc(labelOf(choice)) + '">↻ Retry</button>' : "") +
      (m.model || m.stopped ? '<span class="by">' + esc(byLine(m)) + "</span>" : "") + "</div></div>";
    return d;
  }
  /* web search answers: [2] becomes a link to source 2 (not inside code), and the sources are listed underneath */
  function srcUrl(u) { try { var x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : ""; } catch (e) { return ""; } }
  function cites(html, src) {
    if (!src || !src.length) return html;
    return html.split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/).map(function (part, k) {
      if (k % 2) return part;
      return part.replace(/\[(\d{1,2})\]/g, function (all, n) {
        var s = src[+n - 1], u = s && srcUrl(s.url); if (!u) return all;
        return '<a class="cite" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow" title="' + esc(s.title + " - " + s.site) + '">' + n + "</a>";
      });
    }).join("");
  }
  function sourcesHtml(src) {
    return '<div class="srcs" aria-label="Sources">' + src.map(function (s) { var u = srcUrl(s.url); if (!u) return "";
      return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer nofollow" title="' + esc(s.title) + '"><b>' + (+s.n) + "</b><span>" + esc(s.title) + "</span><small>" + esc(s.site) + "</small></a>"; }).join("") + "</div>";
  }
  /* ---- Launchpad actions: a card for what the AI has ready; nothing is made until "Do it" ---- */
  var APPS = { Write: { icon: "✍️", path: "write", kind: "doc" }, Notebook: { icon: "📓", path: "notebook", kind: "note" }, Present: { icon: "🎞️", path: "present", kind: "deck" }, Grid: { icon: "📊", path: "grid", kind: "sheet" } };
  var OPEN = { Write: "https://suite.civilinitiatives.org/write/", Notebook: "https://suite.civilinitiatives.org/notebook/", Present: "https://suite.civilinitiatives.org/present/", Grid: "https://suite.civilinitiatives.org/grid/",
    Files: "https://files.civilinitiatives.org/", Games: "https://civilinitiatives.org/games/", "Level Up": "https://civilinitiatives.org/levelup/", "Launchpad AI": "https://ai.civilinitiatives.org/", Suite: "https://suite.civilinitiatives.org/" };
  var made = {};   // what was made in this visit: message index -> file link
  function actionHtml(a, i) {
    if (a.tool === "open_app") { var l = OPEN[a.app]; return l ? '<div class="actcard"><div class="ab"><a class="btn" href="' + esc(l) + '" target="_blank" rel="noopener">Open ' + esc(a.app) + " ↗</a></div></div>" : ""; }
    var ap = APPS[a.app]; if (!ap) return "";
    var what = a.tool === "make_slides" ? (a.slides || []).length + " slides" : a.tool === "make_spreadsheet" ? (a.rows || []).length + " rows" : a.tool === "make_notes" ? "a notebook" : "a document";
    var prev = a.tool === "make_slides" ? (a.slides || []).map(function (s, k) { return (k + 1) + ". " + s.title; }).join("\n")
      : a.tool === "make_spreadsheet" ? (a.rows || []).slice(0, 4).map(function (r) { return r.join(" | "); }).join("\n") : String(a.text || "").slice(0, 400);
    var done = made[i];
    return '<div class="actcard" data-acti="' + i + '"><div class="ah"><span class="ai" aria-hidden="true">' + ap.icon + "</span><span><b>" + esc(a.title || "Untitled") + "</b><small>" + esc(a.app) + " · " + esc(what) + "</small></span></div>" +
      (prev ? '<p class="ap">' + esc(prev) + "</p>" : "") +
      '<div class="ab">' + (done ? '<a class="btn" href="' + esc(done) + '" target="_blank" rel="noopener">Open in ' + esc(a.app) + ' ↗</a><span class="am">Made ✓</span>'
        : '<button type="button" class="go" data-doit="' + i + '">Do it</button><span class="am">Makes it in your ' + esc(a.app) + "</span>") + "</div></div>";
  }
  function plainMd(t) {   // Markdown to tidy HTML for a document (the Suite cleans it again when it opens)
    var out = [], list = null;
    var inl = function (x) { return esc(x).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>"); };
    String(t || "").replace(/\r/g, "").split("\n").forEach(function (ln) {
      var h = /^(#{1,4})\s+(.*)$/.exec(ln), ul = /^\s*[-*•]\s+(.*)$/.exec(ln), ol = /^\s*\d+[.)]\s+(.*)$/.exec(ln);
      if ((ul && list !== "ul") || (ol && list !== "ol") || (!ul && !ol && list)) { if (list) out.push("</" + list + ">"); list = null; }
      if (ul || ol) { if (!list) { list = ul ? "ul" : "ol"; out.push("<" + list + ">"); } out.push("<li>" + inl((ul || ol)[1]) + "</li>"); return; }
      if (h) { var n = Math.min(4, h[1].length); out.push("<h" + n + ">" + inl(h[2]) + "</h" + n + ">"); return; }
      if (ln.trim()) out.push("<p>" + inl(ln) + "</p>");
    });
    if (list) out.push("</" + list + ">");
    return out.join("") || "<p></p>";
  }
  function bodyFor(a) {
    var id = function () { return Math.random().toString(36).slice(2, 10); }, now = new Date().toISOString();
    if (a.tool === "make_document") return { html: plainMd(a.text) };
    if (a.tool === "make_notes") return { sections: [{ id: id(), name: "Notes", color: "#7c3aed", pages: [{ id: id(), title: a.page_title || a.title || "Notes", html: plainMd(a.text), ink: [], created: now, updated: now }] }], look: { pc: "", rl: "" } };
    if (a.tool === "make_slides") {
      var box = function (x, y, w, h, size, role, html, extra) { var e = { id: id(), type: "text", x: x, y: y, w: w, h: h, size: size, role: role, html: html, align: "left" }; for (var k in extra || {}) e[k] = extra[k]; return e; };
      var slides = [{ id: id(), layout: "title", trans: "fade", notes: "", els: [box(80, 160, 800, 120, 58, "title", esc(a.title || "My presentation"), { align: "center" }), box(120, 295, 720, 70, 26, "body", "", { align: "center", ph: "Click to add a subtitle" })] }];
      (a.slides || []).forEach(function (s) {
        slides.push({ id: id(), layout: "content", trans: "fade", notes: "", els: [box(60, 36, 840, 84, 40, "title", esc(s.title || "")), box(60, 135, 840, 370, 26, "body", (s.points || []).length ? "<ul>" + s.points.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>" : "")] });
      });
      return { theme: "aurora", slides: slides };
    }
    if (a.tool === "make_spreadsheet") {
      var cells = {}, col = function (c) { return String.fromCharCode(65 + c); };
      (a.rows || []).slice(0, 200).forEach(function (r, ri) { r.slice(0, 26).forEach(function (v, ci) { if (v !== "" && v != null) cells[col(ci) + (ri + 1)] = { v: String(v) }; }); });
      return { sheets: [{ name: "Sheet1", cells: cells, w: {}, rows: Math.max(100, (a.rows || []).length + 20), cols: 26 }], active: 0 };
    }
    return null;
  }
  log.addEventListener("click", function (e) {
    var b = e.target.closest("[data-doit]"); if (!b) return;
    var i = +b.dataset.doit, m = msgs[i], a = m && m.action, ap = a && APPS[a.app]; if (!ap) return;
    var card = b.closest(".actcard"), note = card.querySelector(".am");
    b.disabled = true; b.textContent = "Making it…";
    var fid = window.crypto && crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); });
    sb.from("office_files").insert({ id: fid, kind: ap.kind, title: String(a.title || "Untitled").slice(0, 120), body: bodyFor(a) }).then(function (r) {
      if (r.error) { b.disabled = false; b.textContent = "Try again"; note.classList.add("bad"); note.textContent = /storage|full|400 files/i.test(r.error.message) ? r.error.message : "Couldn't make it just now - try again."; return; }
      made[i] = "https://suite.civilinitiatives.org/" + ap.path + "/?id=" + encodeURIComponent(fid);
      card.outerHTML = actionHtml(a, i);
    });
  });
  function userBefore(i) { for (var j = i - 1; j >= 0; j--) if (msgs[j].role === "user") return msgs[j].id ? j : -1; return -1; }
  function findChoice(id) { return choices.filter(function (x) { return x.id === id; })[0] || allModels.filter(function (x) { return x.id === id; })[0]; }
  function labelOf(id) { var c = findChoice(id); return c ? c.label : "Auto"; }

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
    else if (t.dataset.usage) { usage(true); loadInfo(); }
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
    if (choice === "hwlai") return "HWLAI is getting ready to search";
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
    wait.innerHTML = '<span class="mark" aria-hidden="true">✦</span><div><div class="think"><i></i><span>' + esc(thinkingText()) + '…</span></div><p class="slow" hidden></p></div>';
    log.appendChild(wait); down(true);
    stopper = window.AbortController ? new AbortController() : null; setSend();
    /* a warning if it's slow, so nobody thinks it's broken */
    var slowEl = wait.querySelector(".slow"), said = function (t) { if (slowEl) { slowEl.textContent = t; slowEl.hidden = false; down(); } };
    var timers = [
      setTimeout(function () { said("Still working. Hard questions can take a minute or two."); }, 20000),
      setTimeout(function () { said("This is taking longer than usual. Press ■ to stop, or keep waiting (it can take up to 30 minutes)."); }, 75000)];
    var quiet = function () { timers.forEach(clearTimeout); timers = []; };
    function onEvent(o) {
      if (o.thread && o.thread !== thread) { thread = o.thread; history.replaceState(null, "", "?c=" + encodeURIComponent(thread)); }
      if (liveBody) return;
      var st = wait.querySelector(".think span");
      if (o.s === "thinking" && st) st.textContent = (choice === "auto" || choice === "priority" ? "Thinking it through" : labelOf(choice) + " is thinking it through") + "…";
      if (o.s === "next") said("That AI was busy or slow, so another one is answering instead.");
      if (o.s === "searching" && st) st.textContent = "Searching the web…";
      if (o.s === "tool" && st) st.textContent = o.say || "Working…";
      if (o.s === "reading" && st) st.textContent = "Reading " + o.n + " page" + (o.n === 1 ? "" : "s") + "…";
      if (o.sources) { liveSources = o.sources; if (st) st.textContent = "Writing an answer from " + o.sources.length + " source" + (o.sources.length === 1 ? "" : "s") + "…"; }
    }
    var payload = { action: "send", thread: thread, text: text, model: choice, files: files.map(function (f) { return { name: f.name, text: f.text }; }) };
    if (cut) payload.cut = cut;
    if (conn.web && choice !== "hwlai") payload.search = true;
    var tl = CONNS.filter(function (c) { return conn[c.id]; }).map(function (c) { return c.id; });
    if (tl.length && !connIsClaude()) payload.tools = tl;
    var liveSources = null;
    /* the answer streams in: words show as the AI writes them */
    var live = "", liveBody = null, liveTimer = 0;
    function onDelta(t) {
      live += t;
      if (!liveBody) {
        quiet();
        wait.innerHTML = '<span class="mark" aria-hidden="true">✦</span><div><div class="body"></div></div>';
        liveBody = wait.querySelector(".body");
      }
      if (!liveTimer) liveTimer = setTimeout(function () { liveTimer = 0; liveBody.innerHTML = md(live, true); down(); }, 60);
    }
    callStream(payload, onDelta, onEvent, stopper && stopper.signal).then(function (d) {
      if (liveTimer) { clearTimeout(liveTimer); liveTimer = 0; }
      quiet(); wait.remove();
      if (d && d.thread && d.thread !== thread) { thread = d.thread; history.replaceState(null, "", "?c=" + encodeURIComponent(thread)); }
      var u = msgs[msgs.length - 1];
      if (d && d.stoppedHere) {   // you pressed Stop: keep what it wrote
        u.pending = false;
        var part = live.trim() ? { role: "ai", body: live, model: "", stopped: true } : null;
        if (part) msgs.push(part); else msgs.push({ role: "note", body: "Stopped before it answered, so that message didn't count." });
        render(); syncIds(thread, u, part); return;
      }
      if (!d || d.error) {
        if (cut) { reloadAfterError((d && d.error) || "Something went wrong - try again."); return; }
        msgs.pop(); render();
        msgs.push({ role: "ai", err: true, body: (d && d.error) || "Something went wrong - try again." });
        if (d && d.inhouse && info) { info.inhouse = Object.assign({}, info.inhouse || {}, d.inhouse); meter(); }
        if (d && d.hwlai && info) { info.hwlai = Object.assign({}, info.hwlai || {}, d.hwlai); meter(); }
        if (d && d.outOfInhouse) msgs.push({ role: "note", html: '<button type="button" data-usage="1">See your in-house AI usage</button>' });
        if (d && d.outOfFree) msgs.push({ role: "note", html: 'Out of free messages for today. <button type="button" data-usehaiku="1">Use Claude Haiku' + (info ? " (" + info.haiku_pence + "p)" : "") + "</button>" });
        render(); $("text").value = text; grow(); setSend(); return;
      }
      u.id = d.user_id; u.pending = false;
      if (d.inhouse && info) { info.inhouse = Object.assign({}, info.inhouse || {}, d.inhouse); meter(); }
      if (d.hwlai && info) { info.hwlai = Object.assign({}, info.hwlai || {}, d.hwlai); meter(); }
      if (d.removed && d.removed.length) msgs.push({ role: "note", body: "🔒 I took out " + d.removed.join(", ") + " before sending - please don't share personal information." });
      if (d.compacted) msgs.push({ role: "note", body: "This chat is getting long, so older messages were summarised to keep it going." });
      var a = { role: "ai", id: d.ai_id, body: d.reply, model: d.by, pence: d.pence, remembered: d.remembered, sources: d.sources || null, action: d.action || null, typing: true };
      msgs.push(a);
      if (d.note) msgs.push({ role: "note", html: esc(d.note) + ' <button type="button" data-usage="1">See usage</button>' });
      if (d.cut) msgs.push({ role: "note", body: "⚠ This answer may have been cut short. Say “carry on” to get the rest." });
      render();
      var body = log.querySelector(".turn.a.last .body");
      var finish = function () { delete a.typing; render(); };
      if (body && !liveBody) reveal(body, d.reply, finish); else finish();   // already written in live: no need to type it again
    }).catch(function () { quiet(); wait.remove(); msgs.pop(); render(); msgs.push({ role: "ai", err: true, body: "Couldn't reach the server - check your internet and try again." }); render(); $("text").value = text; })
      .then(function () { busy = false; stopper = null; setSend(); loadInfo(); listThreads(); if (!mob.matches) $("text").focus(); });
  }
  /* send to the chat function and read the answer as it streams; an older server just sends one reply */
  function callStream(payload, onDelta, onEvent, signal) {
    payload.stream = true;
    var stoppedHere = function (e) { if (signal && signal.aborted) return { stoppedHere: true }; throw e; };
    return sb.auth.getSession().then(function (s) {
      var tok = s.data && s.data.session && s.data.session.access_token;
      return fetch(URL_ + "/functions/v1/hwchat", { method: "POST", headers: { Authorization: "Bearer " + tok, apikey: KEY_, "content-type": "application/json" }, body: JSON.stringify(payload), signal: signal || undefined });
    }).then(function (r) {
      var ct = r.headers.get("content-type") || "";
      if (ct.indexOf("text/event-stream") < 0 || !r.body || !window.TextDecoder) return r.json().catch(function () { return { error: "Something went wrong - try again." }; });
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = "", done = null;
      function pump() {
        return reader.read().then(function (x) {
          if (x.done) return done || { error: "The answer stopped early - try again." };
          buf += dec.decode(x.value, { stream: true });
          var i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            var ev = buf.slice(0, i); buf = buf.slice(i + 2);
            ev.split("\n").forEach(function (line) {
              if (line.indexOf("data:") !== 0) return;
              try { var o = JSON.parse(line.slice(5)); if (o.t) onDelta(o.t); else if (o.done) done = o; else if (onEvent) onEvent(o); } catch (e) {}
            });
          }
          return pump();
        });
      }
      return pump();
    }).catch(stoppedHere);
  }
  /* after Stop the server saves the message a moment later: pick up the saved ids
     (so Edit and Retry work) without reloading the chat */
  function syncIds(tid, u, a) {
    if (!tid) return;
    var tries = 0;
    (function look() {
      sb.from("hw_messages").select("id,role,model").eq("thread_id", tid).order("id", { ascending: false }).limit(2).then(function (r) {
        if (thread !== tid) return;
        var rows = r.data || [], lu = rows.filter(function (x) { return x.role === "user"; })[0], la = rows.filter(function (x) { return x.role === "ai"; })[0];
        if (lu && (!a || (la && la.id > lu.id))) { u.id = lu.id; if (a && la) { a.id = la.id; a.model = la.model || ""; } if (!busy) render(); listThreads(); return; }
        if (++tries < 6) setTimeout(look, 1500);
      });
    })();
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
  var stopper = null;
  $("form").onsubmit = function (e) { e.preventDefault(); if (busy) { if (stopper) stopper.abort(); return; } send(); };
  /* while an answer is coming the button is Stop (■), like Claude's */
  function setSend() {
    var b = $("sendBtn"), stop = busy && !!stopper;
    b.classList.toggle("stop", stop); b.textContent = stop ? "■" : "↑";
    b.setAttribute("aria-label", stop ? "Stop" : "Send"); b.title = stop ? "Stop" : "";
    b.disabled = stop ? false : busy || (!$("text").value.trim() && !attach.length);
  }
  function grow() { var ta = $("text"); ta.style.height = "auto"; ta.style.height = Math.min(240, ta.scrollHeight) + "px"; setSend(); }
  $("text").addEventListener("input", grow);
  /* "@kimi ..." sends one message to that AI: suggest names while typing the @ word */
  var atBox = null, atSel = 0;
  function atList() {
    var ta = $("text"), m = /^@([\w.\-]*)$/.exec(ta.value.slice(0, ta.selectionStart));
    if (!m) return null;
    var q = m[1].toLowerCase();
    return choices.filter(function (c) { return c.id !== "auto" && (!q || c.id.indexOf(q) === 0 || c.label.toLowerCase().replace(/[^a-z0-9]/g, "").indexOf(q.replace(/[^a-z0-9]/g, "")) === 0); }).slice(0, 8);
  }
  function atShow() {
    var list = atList();
    if (!list || !list.length) { if (atBox) { atBox.remove(); atBox = null; } return; }
    if (!atBox) { atBox = document.createElement("div"); atBox.className = "atbox"; atBox.setAttribute("role", "listbox"); $("form").appendChild(atBox); }
    atSel = Math.min(atSel, list.length - 1);
    atBox.innerHTML = '<p>Send this message to…</p>' + list.map(function (c, i) {
      return '<button type="button" role="option" aria-selected="' + (i === atSel) + '" data-at="' + esc(c.id) + '"><span>' + (ICON[c.id] || "🤖") + "</span><b>@" + esc(c.id) + "</b><small>" + esc(c.label) + (c.free ? "" : " · " + esc(priceOf(c.id))) + "</small></button>";
    }).join("");
  }
  function atPick(id) {
    var ta = $("text"); ta.value = "@" + id + " " + ta.value.replace(/^@[\w.\-]*\s*/, ""); ta.focus(); ta.setSelectionRange(id.length + 2, id.length + 2);
    if (atBox) { atBox.remove(); atBox = null; } grow();
  }
  $("text").addEventListener("input", function () { atSel = 0; atShow(); });
  $("text").addEventListener("keydown", function (e) {
    if (!atBox) return;
    var opts = atBox.querySelectorAll("[data-at]");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); atSel = (atSel + (e.key === "ArrowDown" ? 1 : opts.length - 1)) % opts.length; atShow(); }
    else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); atPick(opts[atSel].dataset.at); }
    else if (e.key === "Escape") { atBox.remove(); atBox = null; }
  }, true);
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-at]"); if (b) { atPick(b.dataset.at); return; } if (atBox && !e.target.closest(".atbox,#text")) { atBox.remove(); atBox = null; } });
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
  function saveChoice() { try { localStorage.setItem("hl.ai.pick2", choice); } catch (e) {} }
  /* 🔌 Connectors: what Launchpad AI can use. HWLAI web search works with any AI; the others
     are tools for the free AIs (Claude is paid per message, so it doesn't use them). */
  var CONNS = [
    { id: "web", icon: "🔎", name: "HWLAI web search", sub: "Search the web first and answer with sources. Uses HWLAI's allowance.", on: false },
    { id: "revision", icon: "📚", name: "Revision sites", sub: "Look things up on revision sites only (BBC Bitesize, Corbettmaths, Seneca…). Uses HWLAI's allowance.", on: false },
    { id: "make", icon: "✨", name: "Make things", sub: "Get Write documents, notes, slides and spreadsheets ready - you press Do it to make them.", on: true },
    { id: "files", icon: "📁", name: "Your files", sub: "Look at and read your own Suite files when you ask about them.", on: true },
    { id: "levelup", icon: "📈", name: "Level Up", sub: "See your Level Up progress.", on: true },
    { id: "links", icon: "🔗", name: "Read links", sub: "Read a web page when you paste its link.", on: true },
    { id: "calc", icon: "🧮", name: "Calculator", sub: "Work out sums exactly instead of guessing.", on: true }
  ];
  var conn = {}; CONNS.forEach(function (c) { conn[c.id] = c.on; });
  try { var savedConn = JSON.parse(localStorage.getItem("hl.ai.conn") || "null"); if (savedConn) Object.keys(conn).forEach(function (k) { if (typeof savedConn[k] === "boolean") conn[k] = savedConn[k]; }); else if (localStorage.getItem("hl.ai.connweb") === "1") conn.web = true; } catch (e) {}
  var connWeb = conn.web;
  function connIsClaude() { var c = findChoice(choice); return !!(c && c.group === "claude"); }
  function drawConn() {
    var b = $("connBtn"), box = $("connList"); if (!b || !box) return;
    var hw = choice === "hwlai", claude = connIsClaude();
    box.innerHTML = CONNS.map(function (c) {
      var always = hw && c.id === "web", off = claude && c.id !== "web";
      return '<label class="csw"><span class="ci" aria-hidden="true">' + c.icon + '</span><span class="ct"><b>' + esc(c.name) + "</b><small>" + esc(always ? "HWLAI always searches the web." : c.sub) + '</small></span><input type="checkbox" role="switch" data-conn="' + c.id + '"' + (conn[c.id] || always ? " checked" : "") + (always || off ? " disabled" : "") + "></label>";
    }).join("");
    $("connFine").textContent = claude ? "Claude only uses HWLAI web search - pick a free AI for the other connectors." : "Making something always needs you to press Do it.";
    connWeb = conn.web;
    var n = CONNS.filter(function (c) { return conn[c.id]; }).length;
    b.classList.toggle("on", !!conn.web && !hw); b.querySelector(".connon").hidden = !(conn.web && !hw);
    b.title = "Connectors (" + n + " on)";
  }
  function connMenu(open) {
    var m = $("connMenu"); if (!m) return;
    if (open) { menu(false); drawConn(); m.style.maxHeight = Math.max(180, Math.min(520, $("form").getBoundingClientRect().top - 16)) + "px"; }   // stays on screen above the message box
    m.hidden = !open; $("connBtn").setAttribute("aria-expanded", open ? "true" : "false");
  }
  if ($("connBtn")) {
    $("connBtn").onclick = function (e) { e.stopPropagation(); connMenu($("connMenu").hidden); };
    $("connList").addEventListener("change", function (e) {
      var k = e.target.dataset && e.target.dataset.conn; if (!k) return;
      conn[k] = e.target.checked; try { localStorage.setItem("hl.ai.conn", JSON.stringify(conn)); } catch (er) {} drawConn();
      var again = $("connList").querySelector('[data-conn="' + k + '"]'); if (again) again.focus();
    });
    document.addEventListener("click", function (e) { if (!$("connMenu").hidden && !e.target.closest("#connMenu,#connBtn")) connMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("connMenu").hidden) { connMenu(false); $("connBtn").focus(); } });
  }

  function drawModel() {
    var c = findChoice(choice) || choices[0]; if (!c) return;
    var exact = /^m:/.test(c.id);
    $("modelBtn").innerHTML = (exact ? "🎯" : (ICON[c.id] || "🤖")) + " " + esc(c.label) + (c.free === false ? " <small>" + esc(priceOf(c.id)) + "</small>" : "") + " ▾";
    $("modelBtn").title = exact ? c.label + " on " + c.by : c.sub;
    if (typeof drawConn === "function") drawConn();
  }
  function drawMenu() {
    var m = $("menu"), out = "";
    GROUPS.forEach(function (g) {
      var list = choices.filter(function (c) { return (c.group || (c.free ? (c.id === "auto" ? "auto" : "helper") : "claude")) === g[0]; });
      if (!list.length) return;
      if (g[1]) out += "<h3>" + esc(g[1]) + "</h3>";
      out += list.map(function (c) {
        return '<button type="button" class="opt" role="menuitemradio" aria-checked="' + (c.id === choice) + '" data-pick="' + esc(c.id) + '"><span class="ic">' + (ICON[c.id] || "🤖") + "</span><b>" + esc(c.label) + "</b>" +
          (c.free ? (allow(c.id) && !allow(c.id).unlimited ? "<em class=\"ih\">" + Math.round((allow(c.id).session_used / (allow(c.id).session_limit || 1)) * 100) + "% used</em>" : "<span></span>") : "<em>" + esc(priceOf(c.id)) + "</em>") + "<small>" + esc(c.sub) + "</small></button>";
      }).join("");
    });
    if (allModels.length) {
      out += '<h3>All models (free)</h3><input class="msearch" id="mSearch" type="search" placeholder="Search ' + allModels.length + ' models" aria-label="Search all models" value="' + esc(allQuery) + '"><div id="mAll">' + allHtml() + "</div>";
    }
    if (info && !info.unlimited) out += '<h3 style="margin-top:10px">' + Math.max(0, info.free_per_day - info.free_used) + " free messages left today · " + Number(info.pence).toLocaleString("en-GB") + "p to spend</h3>";
    m.innerHTML = out;
  }
  /* every chat model the services offer, searchable; shows 40 at a time */
  function allHtml() {
    var q = allQuery.trim().toLowerCase(), list = allModels.filter(function (m) { return !q || (m.label + " " + m.by + " " + m.id).toLowerCase().indexOf(q) >= 0; });
    var shown = list.slice(0, 40).map(function (m) {
      return '<button type="button" class="opt" role="menuitemradio" aria-checked="' + (m.id === choice) + '" data-pick="' + esc(m.id) + '"><span class="ic">🎯</span><b>' + esc(m.label) + "</b><span></span><small>" + esc(m.by) + "</small></button>";
    }).join("");
    return shown + (list.length > 40 ? '<p class="mmore">' + (list.length - 40) + " more - search to narrow it down</p>" : "") + (list.length ? "" : '<p class="mmore">No models match.</p>');
  }
  function menu(open) {
    var m = $("menu"); if (open == null) open = m.hidden;
    if (open) {
      if ($("connMenu") && !$("connMenu").hidden) { $("connMenu").hidden = true; $("connBtn").setAttribute("aria-expanded", "false"); }
      /* never taller than the room above the message box, so the top choices stay on screen */
      var room = $("form").getBoundingClientRect().top - 16;
      m.style.maxHeight = Math.max(200, Math.min(480, room)) + "px";
      drawMenu(); m.hidden = false; $("modelBtn").setAttribute("aria-expanded", "true"); var cur = m.querySelector('[aria-checked="true"]'); (cur || m.querySelector(".opt")).focus(); }
    else { m.hidden = true; $("modelBtn").setAttribute("aria-expanded", "false"); }
  }
  $("modelBtn").onclick = function () { menu(); };
  $("menu").addEventListener("click", function (e) {
    var b = e.target.closest("[data-pick]"); if (!b) return;
    choice = b.dataset.pick; saveChoice(); drawModel(); meter(); menu(false); $("text").focus(); render();
  });
  $("menu").addEventListener("input", function (e) {
    if (e.target.id !== "mSearch") return;
    allQuery = e.target.value; $("mAll").innerHTML = allHtml();
  });
  $("menu").addEventListener("keydown", function (e) {
    if (e.target.id === "mSearch" && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); var first = $("mAll").querySelector(".opt"); if (first) first.focus(); return; }
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
  /* Launchpad AI and HWLAI each have their own allowance (a session and a week) */
  function allow(id) { return info && (id === "inhouse" ? info.inhouse : id === "hwlai" ? info.hwlai : null); }
  function meter() {
    var q = $("quota"); if (!info) { q.hidden = true; return; }
    q.hidden = false;
    var ih = allow(choice);
    if (ih && !ih.unlimited) {
      var sp = ih.session_limit ? Math.min(1, ih.session_used / ih.session_limit) : 0, wp = ih.week_limit ? Math.min(1, ih.week_used / ih.week_limit) : 0, worst = Math.max(sp, wp);
      q.className = "quota" + (worst >= 1 ? " out" : worst > 0.8 ? " low" : ""); q.style.setProperty("--p", 1 - worst);
      $("quotaText").innerHTML = "<b>" + Math.round(sp * 100) + "%</b><span class=\"lbl\"> of session used</span>";
    } else if (info.unlimited) { q.className = "quota"; q.style.setProperty("--p", 1); $("quotaText").textContent = "Unlimited"; }
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
  /* ---------- usage, like Claude's: a 5-hour session and a week that resets on Monday ---------- */
  function clock(t, withDay) {
    var d = new Date(t), now = new Date(), opts = { hour: "numeric", minute: "2-digit", hour12: true };
    var time = d.toLocaleTimeString("en-GB", opts).replace(/\s?(am|pm)$/i, function (m) { return " " + m.trim().toUpperCase(); });
    if (!withDay && d.toDateString() === now.toDateString()) return time;
    return d.toLocaleDateString("en-GB", { weekday: "long" }) + " " + time;
  }
  function pace(ih) {
    if (ih.unlimited) return "Unlimited on your account.";
    var start = new Date(ih.week_starts).getTime(), end = new Date(ih.week_resets).getTime(), now = Date.now();
    var gone = Math.max(0.01, Math.min(1, (now - start) / (end - start))), used = ih.week_limit ? ih.week_used / ih.week_limit : 0;
    var day = new Date(end).toLocaleDateString("en-GB", { weekday: "long" });
    if (used >= 1) return "You've used this week's allowance. It's back " + clock(ih.week_resets, true) + ". Other AIs still work meanwhile.";
    if (used <= gone + 0.05) return "On track. You should reach " + day + "'s reset with room to spare.";
    var runOut = start + (end - start) * (gone / used);
    if (runOut >= end) return "A little ahead of pace, but you should still reach " + day + "'s reset.";
    return "At this pace you'll run out around " + new Date(runOut).toLocaleDateString("en-GB", { weekday: "long" }) + " " + (new Date(runOut).getHours() < 12 ? "morning" : new Date(runOut).getHours() < 17 ? "afternoon" : "evening") + ", before " + day + "'s reset.";
  }
  function bar(label, sub, used, limit) {
    var p = limit ? Math.min(100, Math.round(used / limit * 100)) : 0;
    return '<div class="ubar"><div class="uhead"><b>' + label + '</b><span>' + p + '% used</span></div><div class="utrack" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '" aria-label="' + esc(label) + '"><i style="width:' + p + '%"' + (p >= 100 ? ' class="full"' : p > 80 ? ' class="hi"' : "") + '></i></div><small>' + sub + "</small></div>";
  }
  function usageHtml() {
    if (!info) return "<p>Loading…</p>";
    var out = "<h2>Usage</h2>";
    [["inhouse", "✦ Launchpad AI", "message"], ["hwlai", "🔎 HWLAI", "search"]].forEach(function (k) {
      var ih = allow(k[0]); if (!ih || !choices.some(function (c) { return c.id === k[0]; })) return;
      out += "<h3>" + k[1] + "</h3>";
      if (ih.unlimited) { out += '<p class="upace">Unlimited on your account.</p>'; return; }
      out += '<p class="upace">' + esc(pace(ih)) + "</p>";
      out += bar("Current session", ih.session_resets ? "Resets at " + esc(clock(ih.session_resets)) : "Starts with your next " + k[2] + " and lasts " + ih.session_hours + " hours", ih.session_used, ih.session_limit);
      out += bar("This week", "Resets " + esc(clock(ih.week_resets, true)), ih.week_used, ih.week_limit);
    });
    out += "<h3>Free AIs</h3>";
    if (info.unlimited) out += '<p class="upace">Unlimited on your account.</p>';
    else {
      var midnight = new Date(); midnight.setHours(24, 0, 0, 0);
      out += bar("Today", "Tops up at midnight · " + Math.max(0, info.free_per_day - info.free_used) + " of " + info.free_per_day + " left", info.free_used, info.free_per_day);
    }
    out += '<h3>Claude</h3><p class="upace">' + Number(info.pence).toLocaleString("en-GB") + "p to spend. Earn more in Level Up.</p>";
    return out;
  }
  function usage(open) {
    var u = $("usage"); if (open == null) open = u.hidden;
    if (open) { u.innerHTML = usageHtml(); u.hidden = false; $("quota").setAttribute("aria-expanded", "true"); }
    else { u.hidden = true; $("quota").setAttribute("aria-expanded", "false"); }
  }
  $("quota").addEventListener("click", function () { usage(); if (!$("usage").hidden) loadInfo(); });
  document.addEventListener("click", function (e) { if (!$("usage").hidden && !e.target.closest("#usage,#quota")) usage(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("usage").hidden) usage(false); });

  function loadInfo() { return sb.rpc("hw_info").then(function (r) { if (!r.error && r.data) { info = r.data; meter(); if (!$("usage").hidden) $("usage").innerHTML = usageHtml(); } }); }

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
    var q = function (cols) { return sb.from("hw_messages").select(cols).eq("thread_id", id).order("id").limit(500); };
    q("id,role,body,model,pence,files,stopped,sources,action").then(function (r) { return r.error ? q("id,role,body,model,pence,files,stopped,sources") : r; }).then(function (r) { return r.error ? q("id,role,body,model,pence,files") : r; }).then(function (r) {
      msgs = (r.data || []).map(function (m) { return { id: m.id, role: m.role, body: m.body, model: m.role === "ai" ? m.model : "", pence: m.pence, files: m.files, stopped: !!m.stopped, sources: Array.isArray(m.sources) ? m.sources : null, action: m.action && typeof m.action === "object" ? m.action : null }; });
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
        choices = (r.data && r.data.choices) || []; allModels = (r.data && r.data.all) || [];
        if (!choices.length) { gate("<h2>Launchpad AI</h2><p>Launchpad AI needs the latest Launchpad update on the server.</p>"); return; }
        if (!findChoice(choice)) choice = findChoice("inhouse") ? "inhouse" : "auto";
        drawModel(); loadInfo();
        var c = new URLSearchParams(location.search).get("c");
        var hp = new URLSearchParams(location.hash.slice(1)), ask = (hp.get("ask") || "").slice(0, 4000), pick = hp.get("ai");
        if (ask) {
          history.replaceState(null, "", location.pathname);
          if (pick && findChoice(pick)) { choice = pick; drawModel(); meter(); }   // just for this chat: your usual pick stays
          listThreads(); hello(); $("text").value = ask; grow(); send(); return;
        }
        listThreads(); if (c) openThread(c); else hello();
        $("text").focus();
      });
    });
  });
})();
