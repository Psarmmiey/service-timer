/**
 * The phone control page (FR-22). Self-contained: no external files, so it works on a
 * church Wi-Fi with no internet. Written without template literals in the script so it
 * can live inside this string.
 */
export const PHONE_PAGE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#09090b">
<title>Service Timer</title>
<style>
  :root { color-scheme: dark; --bg:#09090b; --card:#18181b; --line:#2d2d33; --muted:#a1a1aa; --text:#fafafa; --red:#d00000; --amber:#fbbf24; --green:#22c55e; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; background:var(--bg); color:var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; }
  body { padding: max(12px, env(safe-area-inset-top)) 12px max(16px, env(safe-area-inset-bottom)); }
  button, input { font: inherit; color: inherit; }
  button { border:1px solid var(--line); background:var(--card); border-radius:14px; min-height:52px; padding:0 14px; font-weight:600; font-size:16px; cursor:pointer; touch-action: manipulation; }
  button:active { transform: scale(.98); }
  button:disabled { opacity:.35; }
  .primary { background:var(--text); color:var(--bg); border-color:var(--text); }
  .danger { color:#fca5a5; }
  .hidden { display:none !important; }
  header { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  header .plan { font-weight:700; font-size:15px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pill { border-radius:999px; padding:3px 9px; font-size:12px; font-weight:700; background:#27272a; color:#d4d4d8; white-space:nowrap; }
  .pill.running { background:#052e16; color:#86efac; } .pill.paused { background:#451a03; color:#fcd34d; }
  .pill.overrun { background:#450a0a; color:#fca5a5; } .pill.waiting { background:#082f49; color:#7dd3fc; }
  .clock { font-variant-numeric: tabular-nums; font-weight:700; color:var(--muted); }
  .timer { border-radius:20px; background:#0a0a0a; border:1px solid var(--line); padding:14px 14px 16px; text-align:center; }
  .timer.over { background:var(--red); border-color:var(--red); }
  .timer .title { font-weight:700; font-size:17px; color:#e4e4e7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .timer.over .title { color:#fee2e2; letter-spacing:.04em; }
  .digits { font-weight:800; font-variant-numeric: tabular-nums; font-size: clamp(64px, 24vw, 120px); line-height:1; margin:6px 0 4px; letter-spacing:-.02em; }
  .digits.warning { color:var(--amber); } .digits.danger { color:#ff3b3b; } .digits.paused { opacity:.55; }
  .timer .next { color:var(--muted); font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .timer.over .next { color:#fee2e2; }
  .badge { display:inline-block; margin-top:6px; border-radius:8px; padding:3px 10px; font-weight:800; font-size:13px; letter-spacing:.12em; background:var(--amber); color:#0a0a0a; }
  .banner { margin-top:8px; border-radius:12px; background:#111827; border:1px solid #1e3a8a; color:#bfdbfe; padding:10px 12px; font-size:13px; }
  .info { display:flex; justify-content:space-between; color:var(--muted); font-size:13px; margin:8px 2px 12px; }
  .info strong { color:var(--text); }
  .grid { display:grid; gap:8px; }
  .row4 { grid-template-columns: 1.4fr 1fr 1fr 1fr; }
  .row4 button { white-space:nowrap; padding:0 6px; font-size:15px; }
  .row2 { grid-template-columns: 1fr 1fr; }
  .next-btn { width:100%; min-height:76px; font-size:20px; margin-bottom:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
  .next-btn small { font-size:13px; font-weight:500; opacity:.7; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  section { margin-top:14px; }
  h2 { font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 8px 2px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chips button { min-height:44px; font-size:15px; }
  .chips button.on { background:var(--text); color:var(--bg); }
  .custom { display:flex; gap:8px; margin-top:8px; }
  .custom input { flex:1; min-width:0; border:1px solid var(--line); background:var(--card); border-radius:14px; padding:0 14px; min-height:48px; font-size:16px; }
  .toggle { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:14px; margin-top:8px; }
  .status { text-align:center; color:var(--muted); font-size:12px; margin-top:16px; }
  .status.bad { color:#fca5a5; }
  .login { max-width:360px; margin:12vh auto 0; text-align:center; }
  .login h1 { font-size:22px; margin:0 0 6px; }
  .login p { color:var(--muted); margin:0 0 18px; font-size:15px; }
  .login input { width:100%; text-align:center; font-size:40px; letter-spacing:.5em; padding:10px 0 10px .5em; border-radius:16px; border:1px solid var(--line); background:var(--card); font-variant-numeric: tabular-nums; }
  .login button { width:100%; margin-top:12px; }
  .error { color:#fca5a5; min-height:20px; margin-top:10px; font-size:14px; }
  .toast { position:fixed; left:50%; bottom:max(16px, env(safe-area-inset-bottom)); transform:translateX(-50%); background:#27272a; border:1px solid var(--line); padding:10px 14px; border-radius:12px; font-size:14px; opacity:0; transition:opacity .2s; pointer-events:none; }
  .toast.show { opacity:1; }
</style>
</head>
<body>
<div id="login" class="login hidden">
  <h1>Service Timer</h1>
  <p>Enter the 4-digit PIN shown on the timer laptop under Settings, Phone control.</p>
  <form id="login-form">
    <input id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" aria-label="PIN" required>
    <button class="primary" type="submit">Connect</button>
  </form>
  <div class="error" id="login-error" role="alert"></div>
</div>

<main id="app" class="hidden">
  <header>
    <span class="plan" id="plan">Service Timer</span>
    <span class="pill" id="status-pill">Connecting</span>
    <span class="clock" id="clock">--:--</span>
  </header>

  <div class="timer" id="timer" aria-live="polite">
    <div class="title" id="title"></div>
    <div class="digits" id="digits">--:--</div>
    <div class="next" id="next-line"></div>
    <div class="badge hidden" id="paused-badge">PAUSED</div>
  </div>
  <div class="banner hidden" id="banner"></div>
  <div class="info"><span>Planned finish <strong id="planned">--:--</strong></span><span>Projected <strong id="projected">--:--</strong></span></div>

  <div id="live-controls">
    <button class="primary next-btn" id="next-btn" data-cmd="next">Next item <small id="next-btn-sub"></small></button>
    <div class="grid row4">
      <button id="pause-btn">Pause</button>
      <button data-adjust="-60000">−1 min</button>
      <button data-adjust="60000">+1 min</button>
      <button data-cmd="previous" aria-label="Previous item">← Prev</button>
    </div>
  </div>

  <div id="start-controls" class="grid hidden">
    <div class="banner" id="start-note"></div>
    <button class="primary next-btn" id="start-btn">Start now</button>
    <div class="grid row2 hidden" id="late-btns">
      <button data-choice="catchUp">Catch up to the clock</button>
      <button data-choice="fromTop">Start from the top</button>
    </div>
  </div>

  <section>
    <h2>Message to stage</h2>
    <div class="chips" id="chips"></div>
    <form class="custom" id="custom-form">
      <input id="custom" maxlength="120" placeholder="Custom message" aria-label="Custom message">
      <button type="submit" class="primary">Show</button>
    </form>
    <div class="grid row2" style="margin-top:8px">
      <button id="clear-btn">Clear message</button>
      <button id="blackout-btn">Blackout stage</button>
    </div>
    <label class="toggle"><input type="checkbox" id="flash"> Flash the message</label>
  </section>
  <div class="status" id="conn">Connecting…</div>
</main>
<div class="toast" id="toast"></div>

<script>
(function () {
  var PRESETS = ["Please wrap up", "5 minutes", "2 minutes", "Time for altar call"];
  var state = null, source = null, lastStatus = null, lastItem = null;
  var $ = function (id) { return document.getElementById(id); };

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clock(ms) { var d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function stageTime(ms, sign) {
    var over = ms <= 0, total = Math.floor(Math.abs(ms) / 1000);
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    var v = h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
    return over ? (sign === "minus" ? "-" : "+") + v : v;
  }
  function toast(text) { var t = $("toast"); t.textContent = text; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 1600); }

  function showLogin(message) {
    if (source) { source.close(); source = null; }
    $("app").classList.add("hidden"); $("login").classList.remove("hidden");
    $("login-error").textContent = message || ""; $("pin").value = ""; $("pin").focus();
  }

  function command(body, label) {
    return fetch("/api/command", { method: "POST", headers: { "Content-Type": "application/json", "X-Service-Timer": "1" }, body: JSON.stringify(body) })
      .then(function (r) {
        if (r.status === 401) { showLogin("Please sign in again."); return; }
        if (!r.ok) { toast("That didn't work"); return; }
        if (label) toast(label);
      }).catch(function () { toast("Not connected"); });
  }

  function render(s) {
    state = s;
    var live = s.status === "running" || s.status === "overrun" || s.paused;
    var pill = $("status-pill");
    var key = s.paused ? "paused" : s.status;
    pill.className = "pill " + key;
    pill.textContent = { idle: "Not started", waiting: "Waiting", running: "Running", paused: "Paused", overrun: "Time up", finished: "Ended" }[key] || key;
    $("plan").textContent = s.planName;
    $("clock").textContent = clock(s.now);

    var timer = $("timer"), digits = $("digits");
    timer.classList.toggle("over", s.status === "overrun" && !s.blackout);
    digits.className = "digits " + (s.colourBand === "warning" ? "warning" : s.colourBand === "danger" ? "danger" : "") + (s.paused ? " paused" : "");
    if (s.blackout) {
      $("title").textContent = "Stage is blacked out";
      digits.textContent = live ? stageTime(s.timeLeftMs, s.overtimeSign) : clock(s.now);
    } else if (live) {
      $("title").textContent = s.status === "overrun" ? "TIME UP · " + (s.current ? s.current.title.toUpperCase() : "") : (s.current ? s.current.title : "");
      digits.textContent = stageTime(s.timeLeftMs, s.overtimeSign);
    } else if (s.status === "waiting" && s.untilStartMs > 0) {
      $("title").textContent = s.planName + " starts in";
      digits.textContent = stageTime(s.untilStartMs, s.overtimeSign);
    } else {
      $("title").textContent = s.status === "finished" ? "Service ended" : s.planName + " · " + clock(s.plannedStart);
      digits.textContent = clock(s.now);
    }
    $("next-line").textContent = live && s.next ? "Next: " + s.next.title + " (" + s.next.minutes + " min)" : live ? "Final item" : "";
    $("paused-badge").classList.toggle("hidden", !s.paused);
    var banner = $("banner");
    banner.classList.toggle("hidden", !s.banner);
    banner.textContent = s.banner || "";
    $("planned").textContent = clock(s.plannedFinish);
    $("projected").textContent = clock(s.projectedFinish);

    $("live-controls").classList.toggle("hidden", !live);
    $("start-controls").classList.toggle("hidden", live);
    $("next-btn-sub").textContent = s.next ? s.next.title : "Ends the service";
    $("next-btn").firstChild.textContent = s.next ? "Next item " : "Finish service ";
    $("pause-btn").textContent = s.paused ? "Resume" : "Pause";

    if (!live) {
      $("late-btns").classList.toggle("hidden", !s.late);
      $("start-btn").classList.toggle("hidden", s.late);
      $("start-btn").textContent = s.status === "finished" ? "Start again" : "Start now";
      $("start-note").textContent = s.late
        ? "It's " + clock(s.now) + ". The plan started at " + clock(s.plannedStart) + ". How should the timer pick up?"
        : s.status === "waiting" ? "Nothing to do. The timer starts itself at " + clock(s.plannedStart) + "." : "The plan starts at " + clock(s.plannedStart) + ".";
    }

    var msg = s.message ? s.message.text : "";
    Array.prototype.forEach.call(document.querySelectorAll("#chips button"), function (b) { b.classList.toggle("on", b.textContent === msg); });
    $("clear-btn").disabled = !msg;
    $("blackout-btn").textContent = s.blackout ? "Show the timer" : "Blackout stage";
    $("blackout-btn").classList.toggle("primary", s.blackout);

    var itemKey = s.current ? s.current.title : "";
    if (s.status === "overrun" && lastStatus === "running" && itemKey === lastItem && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    lastStatus = s.paused ? "paused" : s.status; lastItem = itemKey;
  }

  function connect() {
    $("login").classList.add("hidden"); $("app").classList.remove("hidden");
    if (source) source.close();
    source = new EventSource("/api/events");
    source.onopen = function () { $("conn").textContent = "Live"; $("conn").className = "status"; };
    source.onmessage = function (e) { try { render(JSON.parse(e.data)); } catch (err) {} };
    source.onerror = function () {
      $("conn").textContent = "Reconnecting…"; $("conn").className = "status bad";
      fetch("/api/session").then(function (r) { return r.json(); }).then(function (j) { if (!j.signedIn) showLogin("Please sign in again."); }).catch(function () {});
    };
  }

  PRESETS.forEach(function (p) {
    var b = document.createElement("button"); b.type = "button"; b.textContent = p;
    b.onclick = function () { command({ type: "message", text: p, flash: $("flash").checked }, "Sent to the stage"); };
    $("chips").appendChild(b);
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("button") : null;
    if (!t || !state) return;
    if (t.dataset.cmd) command({ type: t.dataset.cmd });
    if (t.dataset.adjust) command({ type: "adjust", ms: Number(t.dataset.adjust) });
    if (t.dataset.choice) command({ type: "startChoice", mode: t.dataset.choice });
  });
  $("pause-btn").onclick = function () { if (state) command({ type: state.paused ? "resume" : "pause" }); };
  $("start-btn").onclick = function () { command({ type: "start" }); };
  $("clear-btn").onclick = function () { command({ type: "clearMessage" }, "Message cleared"); };
  $("blackout-btn").onclick = function () { if (state) command({ type: "blackout", on: !state.blackout }); };
  $("custom-form").onsubmit = function (e) {
    e.preventDefault(); var v = $("custom").value.trim();
    if (v) command({ type: "message", text: v, flash: $("flash").checked }, "Sent to the stage");
  };
  $("login-form").onsubmit = function (e) {
    e.preventDefault();
    fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Service-Timer": "1" }, body: JSON.stringify({ pin: $("pin").value }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) { if (res.ok) connect(); else { $("login-error").textContent = res.j.error || "Couldn't sign in"; $("pin").value = ""; } })
      .catch(function () { $("login-error").textContent = "Can't reach the timer laptop."; });
  };
  fetch("/api/session").then(function (r) { return r.json(); }).then(function (j) { if (j.signedIn) connect(); else showLogin(); }).catch(function () { showLogin("Can't reach the timer laptop."); });
})();
</script>
</body>
</html>`;
