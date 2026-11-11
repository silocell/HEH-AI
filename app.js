/* Launchpad AI: a free AI chat with a daily free quota. "Auto" picks the best
   free AI for each message; Claude costs pence. The server function (hwchat)
   does the safety check and takes out personal information first. */
(function () {
  "use strict";
  var URL_ = "https://hehs-live.duckdns.org", KEY_ = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkyODMyMjkwLCJleHAiOjIxMDgxOTIyOTB9.7gFhQa5RBwVtiOPLO7Qf2-aVEbkd5xgpLiN1J06Gybo";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var sb = null, user = null, thread = null, info = null, choice = "auto", busy = false, choices = [];
  var ICON = { auto: "✨", fast: "⚡", maths: "🧠", writing: "✍️", code: "💻", haiku: "🪶", sonnet: "🎼" };
  try { choice = localStorage.getItem("hl.ai.pick") || localStorage.getItem("hl.chat.ai") || "auto"; } catch (e) {}
  try {
    sb = window.supabase.createClient(URL_, KEY_, { auth: { persistSession: true, autoRefreshToken: true, storage: (window.HEHAuth && window.HEHAuth.storage) || undefined } });
  } catch (e) { sb = null; }

  function toast(t) { var d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2200); }

  /* theme, shared with every Launchpad site */
  (function () {
    var btn = $("themeBtn");
    function cur() { return document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }
    function show() { btn.textContent = cur() === "dark" ? "☀️" : "🌙"; }
    btn.onclick = function () {
      var t = cur() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", t);
      try { document.cookie = "hl_theme=" + t + "; domain=.civilinitiatives.org; path=/; max-age=34560000; samesite=lax"; } catch (e) {}
      try { localStorage.setItem("hl.theme", JSON.stringify(t)); } catch (e) {}
      show();
    };
    show();
  })();

  /* a little safe Markdown: everything is escaped first */
  function md(t) {
    var parts = String(t || "").split(/```/), out = "";
    parts.forEach(function (p, i) {
      if (i % 2) { out += "<pre><code>" + esc(p.replace(/^[a-z0-9+-]*\n/i, "")) + "</code></pre>"; return; }
      var lines = esc(p).split("\n"), list = null, para = [];
      function flushP() { if (para.length) { out += "<p>" + para.join("<br>") + "</p>"; para = []; } }
      function flushL() { if (list) { out += "<" + list.t + ">" + list.items.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</" + list.t + ">"; list = null; } }
      lines.forEach(function (l) {
        var inl = function (s) { return s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>"); };
        var m;
        if (!l.trim()) { flushP(); flushL(); return; }
        if ((m = l.match(/^#{1,4}\s+(.*)/))) { flushP(); flushL(); out += "<h4>" + inl(m[1]) + "</h4>"; return; }
        if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { flushP(); if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; } list.items.push(inl(m[1])); return; }
        if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { flushP(); if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [] }; } list.items.push(inl(m[1])); return; }
        flushL(); para.push(inl(l));
      });
      flushP(); flushL();
    });
    return out;
  }

  function bubble(role, text, by) {
    var log = $("log"), h = log.querySelector(".hello"); if (h) h.remove();
    var d = document.createElement("div");
    if (role === "note") { d.className = "note"; d.textContent = text; }
    else if (role === "user") { d.className = "msg me"; d.textContent = text; }
    else { d.className = "msg ai"; d.innerHTML = md(text) + (by ? '<small class="by">' + esc(by) + "</small>" : ""); }
    log.appendChild(d); log.scrollTop = log.scrollHeight; return d;
  }
  function freeLine() {
    if (!info) return "A daily free quota of messages, on the house.";
    if (info.unlimited) return "<b>Unlimited free messages</b> on your account.";
    var left = Math.max(0, info.free_per_day - info.free_used);
    return "<b>" + left + " of " + info.free_per_day + " free messages</b> left today - it tops up every midnight. Claude Haiku (" + info.haiku_pence + "p) and Sonnet (" + info.sonnet_pence + "p) use your Launchpad pence.";
  }
  function hello() {
    $("log").innerHTML = '<div class="hello"><div class="logo">✦</div><h2>What can I help with?</h2>' +
      "<p>Ask anything - questions, ideas, coding, stories, games or homework. Auto picks the best free AI for each message.</p>" +
      '<div class="freecard" id="freeCard">🎁 ' + freeLine() + "</div>" +
      '<div class="ideas">' + ["Give me a fun fact about space", "Help me plan a short story", "How do I make a game in Scratch?", "Explain how vaccines work", "Quiz me on capital cities"].map(function (q) {
        return '<button type="button" data-q="' + esc(q) + '">' + esc(q) + "</button>"; }).join("") + "</div></div>";
  }
  $("log").addEventListener("click", function (e) { var b = e.target.closest("[data-q]"); if (b) { $("text").value = b.dataset.q; send(); } });

  function meter() {
    var q = $("quota"); if (!info) { q.hidden = true; return; }
    q.hidden = false;
    if (info.unlimited) { q.className = "quota"; q.style.setProperty("--p", 1); $("quotaText").innerHTML = "Free: unlimited"; }
    else {
      var left = Math.max(0, info.free_per_day - info.free_used), p = info.free_per_day ? left / info.free_per_day : 0;
      q.className = "quota" + (left === 0 ? " out" : p < 0.2 ? " low" : ""); q.style.setProperty("--p", p);
      $("quotaText").innerHTML = "<b>" + left + "</b><span class=\"lbl\"> free left today</span>";
    }
    q.title = (info.unlimited ? "Unlimited free messages" : "Free messages left today (tops up at midnight)") + " · " + Number(info.pence).toLocaleString("en-GB") + "p for Claude";
    var fc = $("freeCard"); if (fc) fc.innerHTML = "🎁 " + freeLine();
    $("sideFoot").textContent = "Only you can see your chats · " + Number(info.pence).toLocaleString("en-GB") + "p for Claude";
  }
  function loadInfo() { return sb.rpc("hw_info").then(function (r) { if (!r.error && r.data) { info = r.data; meter(); drawPicks(); } }); }

  function drawPicks() {
    var box = $("picks"); box.textContent = ""; var sepDone = false;
    choices.forEach(function (c) {
      if (!c.free && !sepDone) { var s = document.createElement("span"); s.className = "sep"; box.appendChild(s); sepDone = true; }
      var b = document.createElement("button"); b.type = "button"; b.className = "pick" + (c.free ? "" : " paid"); b.title = c.sub;
      var price = c.free ? "" : info ? (c.id === "haiku" ? info.haiku_pence : info.sonnet_pence) + "p" : "";
      b.innerHTML = (ICON[c.id] || "🤖") + " " + esc(c.label) + (c.free ? "" : " <small>" + esc(price) + "</small>");
      b.setAttribute("aria-pressed", String(c.id === choice));
      b.onclick = function () { choice = c.id; try { localStorage.setItem("hl.ai.pick", choice); } catch (e) {} drawPicks(); $("text").focus(); };
      box.appendChild(b);
    });
  }

  function listThreads() {
    return sb.from("hw_threads").select("id,title,updated_at").order("updated_at", { ascending: false }).limit(100).then(function (r) {
      var ul = $("threads"), rows = r.data || [];
      ul.innerHTML = rows.map(function (t) {
        var d = new Date(t.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        return '<li data-id="' + esc(t.id) + '"' + (t.id === thread ? ' aria-current="true"' : "") + '><a href="?c=' + esc(t.id) + '">' + esc(t.title) + "<small>" + d + '</small></a><button type="button" data-del="' + esc(t.id) + '" aria-label="Delete this chat" title="Delete">🗑</button></li>';
      }).join("") || '<li style="padding:8px 12px;color:var(--soft);font-size:.86rem">No chats yet.</li>';
    });
  }
  $("threads").addEventListener("click", function (e) {
    var del = e.target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Delete?"; setTimeout(function () { if (del.isConnected) { delete del.dataset.armed; del.textContent = "🗑"; } }, 3000); return; }
      sb.from("hw_threads").delete().eq("id", del.dataset.del).then(function () { if (del.dataset.del === thread) newChat(); listThreads(); toast("Chat deleted."); });
      return;
    }
    var a = e.target.closest("a"); if (!a) return;
    e.preventDefault(); openThread(a.closest("li").dataset.id); $("side").classList.remove("open");
  });

  function openThread(id) {
    thread = id; history.replaceState(null, "", "?c=" + encodeURIComponent(id));
    $("log").innerHTML = '<p class="note">Loading…</p>';
    sb.from("hw_messages").select("role,body,model,pence").eq("thread_id", id).order("id").limit(400).then(function (r) {
      $("log").textContent = "";
      if (r.error || !r.data || !r.data.length) { hello(); return; }
      r.data.forEach(function (m) { bubble(m.role === "user" ? "user" : m.role === "note" ? "note" : "ai", m.body, m.role === "ai" ? (m.model || "") + (m.pence ? " · " + m.pence + "p" : "") : ""); });
      listThreads();
    });
  }
  function newChat() { thread = null; history.replaceState(null, "", location.pathname); hello(); listThreads(); $("text").focus(); }
  $("newBtn").onclick = function () { newChat(); $("side").classList.remove("open"); };
  $("chatsBtn").onclick = function () { $("side").classList.toggle("open"); };
  document.querySelector(".brand").onclick = function (e) { if (user) { e.preventDefault(); newChat(); } };

  function send() {
    var t = $("text").value.trim(); if (!t || busy || !user) return;
    busy = true; $("sendBtn").disabled = true; $("text").value = ""; grow();
    bubble("user", t);
    var wait = bubble("ai", ""); wait.classList.add("wait"); wait.textContent = choice === "auto" ? "Picking the best AI" : "Thinking";
    sb.functions.invoke("hwchat", { body: { action: "send", thread: thread, text: t, model: choice } }).then(function (r) {
      var d = r.data;
      if (r.error && !d) return (r.error.context && r.error.context.json ? r.error.context.json() : Promise.resolve(null)).then(function (x) { return x || { error: r.error.message || "Something went wrong." }; }, function () { return { error: "Something went wrong." }; });
      return d;
    }).then(function (d) {
      wait.remove();
      if (d && d.thread && d.thread !== thread) { thread = d.thread; history.replaceState(null, "", "?c=" + encodeURIComponent(thread)); }
      if (!d || d.error) { bubble("note", (d && d.error) || "Something went wrong - try again."); if (d && d.outOfFree) { choice = "haiku"; drawPicks(); } return; }
      if (d.removed && d.removed.length) bubble("note", "🔒 I took out " + d.removed.join(", ") + " before sending - please don't share personal information.");
      bubble("ai", d.reply, (d.by || "") + (d.pence ? " · " + d.pence + "p" : ""));
    }).catch(function () { wait.remove(); bubble("note", "Couldn't reach the server - check your internet and try again."); })
      .then(function () { busy = false; $("sendBtn").disabled = false; loadInfo(); listThreads(); $("text").focus(); });
  }
  $("form").onsubmit = function (e) { e.preventDefault(); send(); };
  function grow() { var ta = $("text"); ta.style.height = "auto"; ta.style.height = Math.min(200, ta.scrollHeight) + "px"; }
  $("text").addEventListener("input", grow);
  $("text").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  document.addEventListener("keydown", function (e) { if (e.ctrlKey && e.shiftKey && (e.key === "O" || e.key === "o")) { e.preventDefault(); newChat(); } });

  function gate(html) { $("main").innerHTML = '<div class="gate">' + html + "</div>"; $("side").style.display = "none"; }
  if (!sb) { gate("<h2>✦ Launchpad AI</h2><p>Couldn't load. Check your internet and refresh.</p>"); return; }
  sb.auth.getSession().then(function (s) {
    user = s.data && s.data.session && s.data.session.user;
    if (!user) { gate('<h2>✦ Launchpad AI</h2><p>A free AI chat with a daily free quota. Sign in on the Launchpad to start.</p><a class="newb" href="https://civilinitiatives.org/">Sign in on the Launchpad</a>'); return; }
    sb.rpc("my_features").then(function (f) {
      if (f.data && f.data.hwchat === false) { gate("<h2>✦ Launchpad AI</h2><p>Launchpad AI is switched off for your account just now.</p>"); return; }
      sb.functions.invoke("hwchat", { body: { action: "models" } }).then(function (r) {
        choices = (r.data && r.data.choices) || [];
        if (!choices.length) { gate("<h2>✦ Launchpad AI</h2><p>Launchpad AI needs the latest Launchpad update on the server (command 10).</p>"); return; }
        if (!choices.some(function (c) { return c.id === choice; })) choice = "auto";
        drawPicks(); loadInfo();
        var c = new URLSearchParams(location.search).get("c");
        listThreads(); if (c) openThread(c); else hello();
        $("text").focus();
      });
    });
  });
})();
