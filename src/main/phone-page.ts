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
  /* Colour only for states that need noticing: amber while paused, red while the stage is blacked out. */
  .attention { background:var(--amber); color:#0a0a0a; border-color:var(--amber); font-weight:700; }
  .alert { background:var(--red); color:#fff; border-color:var(--red); font-weight:700; }
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
  .timer.over .title { color:#fee2e2; letter-spacing:.06em; text-transform:uppercase; font-size:14px; }
  .sign { display:inline-block; margin:10px 0 4px; padding:6px 18px 4px; border:3px solid #fff; border-radius:12px; background:#fff; color:var(--red); font-weight:900; font-size:clamp(40px, 13vw, 64px); line-height:1; letter-spacing:.03em; }
  .sign.flash { animation: sign-flash 1.2s steps(1, end) infinite; }
  @keyframes sign-flash { 0% { background:#fff; color:var(--red); } 50% { background:transparent; color:#fff; } }
  @media (prefers-reduced-motion: reduce) { .sign.flash { animation:none; } }
  .overword { font-size:.36em; margin-left:.12em; color:#fecaca; letter-spacing:.04em; }
  .digits { font-weight:800; font-variant-numeric: tabular-nums; font-size: clamp(64px, 24vw, 120px); line-height:1; margin:6px 0 4px; letter-spacing:-.02em; }
  .timer.stale .digits { opacity:.45; }
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
  .login label { display:block; text-align:left; color:var(--muted); font-size:14px; margin:14px 2px 6px; }
  .login input#name { font-size:18px; letter-spacing:normal; text-align:left; padding:12px 14px; }
  .error { color:#fca5a5; min-height:20px; margin-top:10px; font-size:14px; }
  .tabs { display:grid; grid-template-columns:1fr 1fr; gap:4px; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:4px; margin-bottom:12px; }
  .tabs button { min-height:40px; border:0; border-radius:10px; background:transparent; color:var(--muted); font-size:15px; }
  .tabs button[aria-selected="true"] { background:var(--text); color:var(--bg); }
  .mini { display:flex; align-items:center; gap:10px; border:1px solid var(--line); border-radius:14px; padding:8px 12px; margin-bottom:10px; background:#0a0a0a; }
  .mini.over { background:var(--red); border-color:var(--red); }
  .mini .t { flex:1; min-width:0; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mini .d { font-weight:800; font-size:26px; font-variant-numeric:tabular-nums; }
  .undo { display:flex; align-items:center; gap:10px; background:#1e293b; border:1px solid #334155; border-radius:12px; padding:6px 6px 6px 12px; margin-bottom:10px; font-size:14px; }
  .undo span { flex:1; } .undo button { min-height:38px; }
  .note { color:var(--muted); font-size:13px; margin:0 2px 10px; }
  .rows { display:grid; grid-template-columns:minmax(0,1fr); gap:6px; }
  .row { min-width:0; border:1px solid var(--line); background:var(--card); border-radius:14px; padding:10px 12px; }
  .row.current { border-color:var(--text); }
  .row.done { opacity:.55; }
  .row .top { display:flex; align-items:center; gap:10px; }
  .row .time { font-variant-numeric:tabular-nums; color:var(--muted); font-size:13px; width:44px; flex:none; }
  .row .name { flex:1; min-width:0; }
  .row .name b { display:block; font-size:16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .row.skipped .name b { text-decoration:line-through; }
  .row .name small { color:var(--muted); font-size:13px; }
  .row .tag { flex:none; font-size:12px; font-weight:700; border-radius:999px; padding:3px 9px; background:#27272a; color:#d4d4d8; }
  .row .tag.now { background:var(--text); color:var(--bg); } .row .tag.over { background:#450a0a; color:#fca5a5; }
  .row .acts { display:grid; grid-template-columns:44px 44px minmax(0,1fr) minmax(0,1fr) 44px; gap:6px; margin-top:8px; }
  .row .acts button { min-height:42px; font-size:14px; padding:0 4px; white-space:nowrap; }
  .row .acts button.confirming { background:var(--text); color:var(--bg); border-color:var(--text); }
  .editor { margin-top:8px; display:grid; grid-template-columns:minmax(0,1fr); gap:8px; }
  .editor .row2 { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
  .editor .row2 button { padding:0 8px; font-size:15px; }
  .stepper { display:grid; grid-template-columns:56px minmax(0,1fr) 56px; gap:6px; align-items:center; }
  .stepper output { text-align:center; font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; }
  .add { display:grid; gap:8px; margin-top:12px; }
  .add input { border:1px solid var(--line); background:var(--card); border-radius:14px; padding:0 14px; min-height:48px; font-size:16px; }
  .add .two { display:grid; grid-template-columns:1fr 110px; gap:8px; }
  .finish { text-align:center; color:var(--muted); font-size:13px; margin-top:10px; }
  .toast { position:fixed; left:50%; bottom:max(16px, env(safe-area-inset-bottom)); transform:translateX(-50%); background:#27272a; border:1px solid var(--line); padding:10px 14px; border-radius:12px; font-size:14px; opacity:0; transition:opacity .2s; pointer-events:none; }
  .toast.show { opacity:1; }
</style>
</head>
<body>
<div id="login" class="login hidden">
  <h1>Service Timer</h1>
  <p>Enter your name and the 4-digit PIN shown on the timer laptop under Settings, Phone control.</p>
  <form id="login-form">
    <label for="name">Your name (shown on the laptop)</label>
    <input id="name" maxlength="40" autocomplete="name" placeholder="For example, Tolu" required>
    <label for="pin">PIN</label>
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
  <nav class="tabs" role="tablist">
    <button role="tab" id="tab-timer" aria-selected="true">Timer</button>
    <button role="tab" id="tab-order" aria-selected="false">Running order</button>
  </nav>

  <div id="order-view" class="hidden">
    <div class="mini" id="mini"><span class="t" id="mini-title"></span><span class="d" id="mini-digits"></span></div>
    <div class="undo hidden" id="undo-bar"><span>Changed for today.</span><button id="undo-btn" class="primary">Undo</button></div>
    <p class="note" id="order-note"></p>
    <div class="rows" id="rows"></div>
    <form class="add hidden" id="add-form">
      <h2 style="margin:4px 2px 0">Add after the current item</h2>
      <input id="add-title" maxlength="80" placeholder="For example, Testimony" aria-label="New item title">
      <div class="two"><input id="add-minutes" type="number" inputmode="decimal" min="0.5" max="240" step="0.5" value="5" aria-label="Minutes"><button type="submit" class="primary">Add</button></div>
    </form>
    <div class="finish" id="order-finish"></div>
  </div>

  <div id="timer-view">

  <div class="timer" id="timer" aria-live="polite">
    <div class="title" id="title"></div>
    <div class="sign hidden" id="sign">TIME UP</div>
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
  </div>
  <div class="status" id="conn">Connecting…</div>
</main>
<div class="toast" id="toast"></div>

<script>
(function () {
  var PRESETS = ["Please wrap up", "5 minutes", "2 minutes", "Time for altar call"];
  var state = null, source = null, lastStatus = null, lastItem = null;
  var tab = localStorage.getItem("st-tab") || "timer", editing = -1, editMinutes = 0, rowsKey = "", confirming = -1, confirmTimer = 0;
  var $ = function (id) { return document.getElementById(id); };
  /*
   * Keeping time with the laptop: each update carries the laptop's clock. The phone works out
   * the difference between the two clocks (using the quickest recent update, so Wi-Fi delays
   * don't count) and keeps counting between updates. Updates correct it; they don't drive it.
   */
  var latest = null, offsets = [], lastMessageAt = 0, flipTimer = 0;
  function laptopNow() { return Date.now() + (offsets.length ? Math.max.apply(null, offsets) : 0); }
  function project(s) {
    var elapsed = Math.max(0, laptopNow() - s.now);
    var p = Object.assign({}, s, { now: s.now + elapsed });
    var counting = (s.status === "running" || s.status === "overrun") && !s.paused;
    if (counting) {
      p.timeLeftMs = s.timeLeftMs - elapsed;
      if (p.timeLeftMs <= 0) { p.status = "overrun"; p.colourBand = "over"; }
    } else if (s.status === "waiting" && s.untilStartMs > 0) {
      p.untilStartMs = s.untilStartMs - elapsed;
    }
    return p;
  }
  function msToFlip(ms) { return ms > 0 ? (ms % 1000) + 10 : 1000 - (-ms % 1000) + 10; }
  /** Repaint exactly when the seconds on screen change. */
  function paint() {
    if (!latest) return;
    var p = project(latest);
    render(p);
    var stale = Date.now() - lastMessageAt > 2500;
    $("timer").classList.toggle("stale", stale);
    clearTimeout(flipTimer);
    var counting = (p.status === "running" || p.status === "overrun") && !p.paused;
    var wait = counting ? msToFlip(p.timeLeftMs) : p.status === "waiting" && p.untilStartMs > 0 ? msToFlip(p.untilStartMs) : 1000;
    flipTimer = setTimeout(paint, wait);
  }
  function receive(s) {
    offsets.push(s.now - Date.now());
    if (offsets.length > 40) offsets.shift();
    latest = s;
    lastMessageAt = Date.now();
    if ($("conn").className !== "status") showLive();
    paint();
  }
  var myName = "";

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clock(ms) { var d = new Date(ms); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function stageTime(ms) {
    var total = Math.floor(Math.abs(ms) / 1000);
    var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }
  function toast(text) { var t = $("toast"); t.textContent = text; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 1600); }

  function showLogin(message) {
    if (source) { source.close(); source = null; }
    $("app").classList.add("hidden"); $("login").classList.remove("hidden");
    $("login-error").textContent = message || ""; $("pin").value = "";
    $("name").value = $("name").value || localStorage.getItem("st-name") || "";
    ($("name").value ? $("pin") : $("name")).focus();
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
    var over = s.status === "overrun";
    var sign = $("sign");
    sign.classList.toggle("hidden", !over || s.blackout);
    sign.classList.toggle("flash", s.flashTimeUp !== false);
    if (s.blackout) {
      $("title").textContent = "Stage is blacked out";
      digits.textContent = live ? stageTime(s.timeLeftMs) : clock(s.now);
    } else if (over) {
      // Same as the stage: TIME UP sign, then "1:36 OVER" (no plus sign).
      $("title").textContent = s.current ? s.current.title : "";
      digits.innerHTML = "";
      digits.appendChild(document.createTextNode(stageTime(s.timeLeftMs)));
      var word = document.createElement("span"); word.className = "overword"; word.textContent = "OVER";
      digits.appendChild(word);
    } else if (live) {
      $("title").textContent = s.current ? (s.uppercase ? s.current.title.toUpperCase() : s.current.title) : "";
      digits.textContent = stageTime(s.timeLeftMs);
    } else if (s.status === "waiting" && s.untilStartMs > 0) {
      $("title").textContent = s.planName + " starts in";
      digits.textContent = stageTime(s.untilStartMs);
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
    $("pause-btn").classList.toggle("attention", Boolean(s.paused));

    if (!live) {
      $("late-btns").classList.toggle("hidden", !s.late);
      $("start-btn").classList.toggle("hidden", s.late);
      $("start-btn").textContent = s.status === "finished" ? "Start again" : "Start now";
      $("start-note").textContent = s.late
        ? "It's " + clock(s.now) + ". The plan started at " + clock(s.plannedStart) + ". How should the timer pick up?"
        : s.status === "waiting" ? "Nothing to do. The timer starts itself at " + clock(s.plannedStart) + "." : "The plan starts at " + clock(s.plannedStart) + ".";
    }

    var msg = s.message ? s.message.text : "";
    if (s.message && document.activeElement !== $("flash")) $("flash").checked = Boolean(s.message.flash);
    Array.prototype.forEach.call(document.querySelectorAll("#chips button"), function (b) { b.classList.toggle("on", b.textContent === msg); });
    $("clear-btn").disabled = !msg;
    var bo = $("blackout-btn");
    if (bo.dataset.on !== String(Boolean(s.blackout))) {
      bo.dataset.on = String(Boolean(s.blackout));
      bo.textContent = s.blackout ? "Stage blacked out" : "Blackout stage";
      if (s.blackout) { var hint = document.createElement("small"); hint.textContent = "Tap to show the timer"; hint.style.cssText = "display:block;font-weight:500;font-size:13px;opacity:.9"; bo.appendChild(hint); }
    }
    $("blackout-btn").classList.toggle("alert", Boolean(s.blackout));

    renderOrder(s);
    var itemKey = s.current ? s.current.title : "";
    if (s.status === "overrun" && lastStatus === "running" && itemKey === lastItem && navigator.vibrate) navigator.vibrate([200, 100, 200]);
    lastStatus = s.paused ? "paused" : s.status; lastItem = itemKey;
  }

  function showTab(next) {
    tab = next; localStorage.setItem("st-tab", next);
    $("tab-timer").setAttribute("aria-selected", String(next === "timer"));
    $("tab-order").setAttribute("aria-selected", String(next === "order"));
    $("timer-view").classList.toggle("hidden", next !== "timer");
    $("order-view").classList.toggle("hidden", next !== "order");
  }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function btn(text, onClick, cls, label) { var b = el("button", cls || "", text); b.type = "button"; if (label) b.setAttribute("aria-label", label); b.onclick = onClick; return b; }
  function fmtMin(m) { return (Math.round(m * 2) / 2) + " min"; }

  function renderOrder(s) {
    var over = s.status === "overrun";
    $("mini").classList.toggle("over", over);
    $("mini-title").textContent = s.current && (s.live) ? (over ? "TIME UP · " : "") + s.current.title : s.planName;
    $("mini-digits").textContent = s.live ? stageTime(s.timeLeftMs) + (over ? " over" : "") : clock(s.now);
    $("undo-bar").classList.toggle("hidden", !s.undoAvailable);
    $("order-note").textContent = !s.live
      ? "You can move, change or add items once the service is running."
      : s.hasRunChanges ? "Changes are for today only. To keep them, press Save to plan on the laptop." : "Changes here are for today only.";
    $("add-form").classList.toggle("hidden", !s.live);
    $("order-finish").textContent = "Planned finish " + clock(s.plannedFinish) + " · projected " + clock(s.projectedFinish);

    var key = JSON.stringify([s.live, s.status, editing, editMinutes, confirming, s.rows.map(function (r) { return [r.title, r.minutes, r.status, r.skipped, r.actualStart, r.scheduledStart]; })]);
    if (key === rowsKey) return;
    rowsKey = key;
    var list = $("rows"); list.innerHTML = "";
    s.rows.forEach(function (r) {
      var upcoming = s.live && r.status === "upcoming";
      var row = el("div", "row" + (r.status === "current" ? " current" : "") + (r.status === "done" ? " done" : "") + (r.skipped ? " skipped" : ""));
      var top = el("div", "top");
      top.appendChild(el("span", "time", clock(r.actualStart || r.scheduledStart)));
      var name = el("div", "name"); name.appendChild(el("b", "", r.title)); name.appendChild(el("small", "", fmtMin(r.minutes)));
      top.appendChild(name);
      if (r.status === "current" && s.live) top.appendChild(el("span", "tag " + (over ? "over" : "now"), over ? "Time up" : s.paused ? "Paused" : "Now"));
      else if (r.skipped) top.appendChild(el("span", "tag", "Skipped"));
      else if (r.status === "done") top.appendChild(el("span", "tag", "Done"));
      row.appendChild(top);
      if (upcoming) {
        var acts = el("div", "acts");
        acts.appendChild(btn("↑", function () { command({ type: "moveUp", index: r.index }); }, "", "Move " + r.title + " up"));
        acts.appendChild(btn("↓", function () { command({ type: "moveDown", index: r.index }); }, "", "Move " + r.title + " down"));
        acts.appendChild(btn("Do next", function () { command({ type: "doNext", index: r.index }, r.title + " is next"); }, "", "Do " + r.title + " next"));
        // Start now jumps the stage straight away, so it takes a second tap to confirm.
        var start = btn(confirming === r.index ? "Tap again" : "Start now", function () {
          if (confirming === r.index) {
            confirming = -1; clearTimeout(confirmTimer);
            command({ type: "startNow", index: r.index }, r.title + " started");
            return;
          }
          confirming = r.index; rowsKey = ""; renderOrder(state);
          clearTimeout(confirmTimer);
          confirmTimer = setTimeout(function () { confirming = -1; rowsKey = ""; if (state) renderOrder(state); }, 4000);
        }, confirming === r.index ? "confirming" : "", "Start " + r.title + " now");
        acts.appendChild(start);
        acts.appendChild(btn(editing === r.index ? "×" : "✎", function () {
          editing = editing === r.index ? -1 : r.index; editMinutes = r.minutes; rowsKey = ""; renderOrder(state);
        }, "", (editing === r.index ? "Close editing " : "Edit ") + r.title));
        row.appendChild(acts);
        if (editing === r.index) {
          var ed = el("div", "editor");
          var step = el("div", "stepper");
          var out = el("output", "", fmtMin(editMinutes));
          step.appendChild(btn("−", function () { editMinutes = Math.max(0.5, editMinutes - 1); out.textContent = fmtMin(editMinutes); }, "", "One minute less"));
          step.appendChild(out);
          step.appendChild(btn("+", function () { editMinutes = Math.min(600, editMinutes + 1); out.textContent = fmtMin(editMinutes); }, "", "One minute more"));
          ed.appendChild(step);
          var two = el("div", "grid row2");
          two.appendChild(btn("Remove from today", function () { editing = -1; command({ type: "removeUpcoming", index: r.index }, "Removed for today"); }, "danger"));
          two.appendChild(btn("Save minutes", function () { editing = -1; command({ type: "setRunItemMinutes", index: r.index, minutes: editMinutes }, "Changed for today"); }, "primary"));
          ed.appendChild(two);
          row.appendChild(ed);
        }
      }
      list.appendChild(row);
    });
  }

  // The laptop sends two updates a second. Silence means the connection died quietly
  // (Wi-Fi sleep, phone locked): reconnect instead of showing a frozen timer.
  setInterval(function () {
    if (!source || !lastMessageAt) return;
    var quiet = Date.now() - lastMessageAt;
    if (quiet > 2500) { $("conn").textContent = "Reconnecting…"; $("conn").className = "status bad"; }
    if (quiet > 5000) connect();
  }, 1000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && source && Date.now() - lastMessageAt > 1500) connect();
  });

  function showLive() { $("conn").textContent = "Live" + (myName ? " · signed in as " + myName : ""); $("conn").className = "status"; }

  function connect() {
    $("login").classList.add("hidden"); $("app").classList.remove("hidden");
    if (source) source.close();
    lastMessageAt = Date.now();
    source = new EventSource("/api/events");
    source.onopen = showLive;
    source.addEventListener("signed-out", function (e) {
      var reason = ""; try { reason = JSON.parse(e.data).reason; } catch (err) {}
      showLogin(reason === "disconnected" ? "The timer laptop disconnected this phone." : reason === "pin-changed" ? "The PIN was changed on the timer laptop. Enter the new one." : "Please sign in again.");
    });
    source.onmessage = function (e) { try { receive(JSON.parse(e.data)); } catch (err) {} };
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
  $("tab-timer").onclick = function () { showTab("timer"); };
  $("tab-order").onclick = function () { showTab("order"); };
  showTab(tab);
  $("undo-btn").onclick = function () { command({ type: "undoReorder" }, "Undone"); };
  $("add-form").onsubmit = function (e) {
    e.preventDefault();
    var title = $("add-title").value.trim(), minutes = Number($("add-minutes").value);
    if (!title || !(minutes >= 0.5)) { toast("Add a title and minutes"); return; }
    command({ type: "insertAfterCurrent", item: { id: "phone-" + Date.now(), title: title, minutes: minutes } }, title + " added");
    $("add-title").value = "";
  };
  $("pause-btn").onclick = function () { if (state) command({ type: state.paused ? "resume" : "pause" }); };
  $("start-btn").onclick = function () { command({ type: "start" }); };
  $("flash").onchange = function () {
    if (state && state.message) command({ type: "setMessageFlash", flash: $("flash").checked }, $("flash").checked ? "Message flashing" : "Message steady");
  };
  $("clear-btn").onclick = function () { command({ type: "clearMessage" }, "Message cleared"); };
  $("blackout-btn").onclick = function () { if (state) command({ type: "blackout", on: !state.blackout }); };
  $("custom-form").onsubmit = function (e) {
    e.preventDefault(); var v = $("custom").value.trim();
    if (v) command({ type: "message", text: v, flash: $("flash").checked }, "Sent to the stage");
  };
  $("login-form").onsubmit = function (e) {
    e.preventDefault();
    var name = $("name").value.trim();
    if (!name) { $("login-error").textContent = "Add your name so the laptop can see who is connected."; $("name").focus(); return; }
    fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Service-Timer": "1" }, body: JSON.stringify({ pin: $("pin").value, name: name }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { myName = name; localStorage.setItem("st-name", name); connect(); }
        else { $("login-error").textContent = res.j.error || "Couldn't sign in"; $("pin").value = ""; }
      })
      .catch(function () { $("login-error").textContent = "Can't reach the timer laptop."; });
  };
  fetch("/api/session").then(function (r) { return r.json(); }).then(function (j) { if (j.signedIn) { myName = j.name || ""; connect(); } else showLogin(); }).catch(function () { showLogin("Can't reach the timer laptop."); });
})();
</script>
</body>
</html>`;
