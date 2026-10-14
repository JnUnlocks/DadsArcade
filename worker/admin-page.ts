/**
 * The `/admin` dashboard: a single self-contained HTML response with its own
 * inline CSS and JS. Deliberately not part of the Vite-built SPA -- it has no
 * bundle, isn't in `dist/`, registers no service worker, and never appears in
 * any build manifest. It is served straight out of the Worker (see the
 * `/admin` branch in `worker/index.ts`), gated by nothing at the page level;
 * every request it makes to `/api/admin/*` carries the token typed into the
 * login form, and the server rejects those without a valid one.
 *
 * Layout is phone-first, in six tabs. Overview is the at-a-glance screen:
 * one sentence about yesterday, today's numbers, the week's, then devices per
 * day split into new and returning (what a share on socials should move).
 * It also says how many feedback notes arrived this week, since those want
 * acting on. Games, Players and Geo are the deep dives, Feedback is the notes
 * themselves, and Ops holds capacity and the raw lists.
 *
 * NOTE: this whole page is one template literal. Inside it, avoid backticks,
 * dollar-brace and backslashes, and write the inline JS with plain string
 * concatenation.
 */

export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Dad's Arcade — Admin</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b0f1a; --card: #121826; --line: #232b40; --text: #e6e8ee; --dim: #93a0b4;
    --ok: #3ecf8e; --warn: #f5b942; --bad: #ff6b6b; --accent: #4c8dff; --btn: #1c6ef2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; background: var(--bg); color: var(--text);
    font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 16px; padding-bottom: 48px; max-width: 900px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); margin: 28px 0 8px; }
  p.hint, .hint { color: var(--dim); font-size: 13px; margin: 4px 0 12px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
  label { display: block; font-size: 13px; color: var(--dim); margin-bottom: 6px; }
  input[type="password"] {
    width: 100%; padding: 10px 12px; background: var(--bg); border: 1px solid #2c3550;
    border-radius: 8px; color: var(--text); font-size: 16px;
  }
  button {
    margin-top: 12px; padding: 10px 16px; background: var(--btn); color: #fff; border: none;
    border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  button.secondary { background: var(--line); }
  button.small { margin: 0; padding: 4px 10px; font-size: 12px; background: var(--line); }
  button.small.on { background: rgba(76,141,255,.25); color: #bcd3ff; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .error { color: var(--bad); font-size: 13px; margin-top: 10px; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #1c2333; white-space: nowrap; }
  th { background: #141a2b; color: var(--dim); font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom: none; }
  tr.dim td { opacity: .55; }
  td.msg { white-space: normal; min-width: 200px; }
  .muted { color: var(--dim); }
  #dashboard { display: none; }
  #status { color: var(--dim); font-size: 12px; margin-left: auto; }

  .top { position: sticky; top: 0; z-index: 2; background: var(--bg); margin: -16px -16px 0; padding: 12px 16px 10px; border-bottom: 1px solid var(--line); }
  .top button { margin: 0; }
  .tabs { display: flex; gap: 6px; margin-top: 10px; overflow-x: auto; }
  .tabs button { padding: 7px 12px; font-size: 13px; background: transparent; color: var(--dim); border: 1px solid var(--line); white-space: nowrap; }
  .tabs button.on { background: rgba(76,141,255,.2); color: #dbe7ff; border-color: var(--accent); }
  .tabs .badge { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 999px; background: var(--warn); color: #1a1300; font-size: 11px; font-weight: 700; }
  .callout { display: flex; align-items: center; gap: 10px; width: 100%; margin: 10px 0 0; padding: 12px 14px; text-align: left;
    background: var(--card); border: 1px solid var(--line); border-radius: 10px; color: var(--dim); font-size: 14px; font-weight: 400; }
  .callout.hot { border-color: var(--warn); background: rgba(245,185,66,.1); color: var(--text); }
  .callout b { font-size: 20px; font-variant-numeric: tabular-nums; }
  .callout .go { margin-left: auto; color: var(--accent); font-weight: 600; white-space: nowrap; }
  .scope { color: var(--dim); font-size: 12px; margin-top: 8px; }
  .scope button { margin: 0 0 0 6px; padding: 0; background: none; color: var(--accent); font-size: 12px; font-weight: 600; }
  .tab { display: none; }
  .tab.on { display: block; }
  .headline { font-size: 16px; line-height: 1.45; margin-top: 16px; }
  .headline b { font-variant-numeric: tabular-nums; }
  .legend { display: flex; gap: 14px; font-size: 12px; color: var(--dim); margin-top: 6px; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; }
  .hbar { height: 8px; min-width: 80px; background: #1c2333; border-radius: 4px; overflow: hidden; }
  .hbar div { height: 100%; background: var(--accent); border-radius: 4px; }
  .usgrid { display: grid; grid-template-columns: repeat(11, 1fr); gap: 3px; max-width: 520px; }
  .usgrid div { aspect-ratio: 1; border-radius: 4px; background: #1c2333; color: var(--dim); font-size: 10px; line-height: 1.1;
    display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .usgrid div.hit { color: #fff; font-weight: 600; }

  .tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  @media (min-width: 640px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
  .tile .v { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tile .v.word { font-size: 17px; line-height: 36px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tile .l { font-size: 12px; color: var(--dim); }
  .tile .s { font-size: 12px; color: var(--dim); margin-top: 2px; }
  .tile .sp { margin-top: 6px; height: 28px; }
  .delta { font-size: 12px; font-weight: 600; }
  .delta.up { color: var(--ok); }
  .delta.down { color: var(--bad); }
  .delta.flat { color: var(--dim); }
  svg.spark { display: block; }
  .chart { width: 100%; }
  .chart svg { display: block; width: 100%; }

  .meter { margin: 10px 0 14px; }
  .meter .top { display: flex; justify-content: space-between; font-size: 13px; }
  .meter .bar { height: 10px; background: #1c2333; border-radius: 6px; overflow: hidden; margin-top: 6px; }
  .meter .fill { height: 100%; border-radius: 6px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pill.ok { background: rgba(62,207,142,.15); color: var(--ok); }
  .pill.warn { background: rgba(245,185,66,.15); color: var(--warn); }
  .pill.bad { background: rgba(255,107,107,.15); color: var(--bad); }
  .pill.quiet { background: #1c2333; color: var(--dim); }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: #1c2333; border-radius: 999px; padding: 4px 6px 4px 10px; font-size: 12px; margin: 4px 6px 0 0; }
  .chip button { margin: 0; padding: 0 6px; background: transparent; color: var(--dim); font-size: 14px; line-height: 1; }
  .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); margin: 0; cursor: pointer; }
  .switch input { width: 18px; height: 18px; }
</style>
</head>
<body>

<div id="login">
  <h1>Dad's Arcade — Admin</h1>
  <p class="hint">Not linked anywhere in the app. Bookmark this page.</p>
  <div class="card">
    <label for="token">Admin token</label>
    <input id="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" />
    <button id="unlock">Unlock</button>
    <div id="loginError" class="error" hidden></div>
  </div>
</div>

<div id="dashboard">
  <div class="top">
    <div class="row">
      <h1 style="margin-bottom:0">Dad's Arcade — Admin</h1>
      <span id="status"></span>
      <button id="refresh" class="small">Refresh</button>
      <button id="logout" class="small">Log out</button>
    </div>
    <div class="tabs" id="tabs">
      <button data-tab="overview">Overview</button>
      <button data-tab="games">Games</button>
      <button data-tab="players">Players</button>
      <button data-tab="geo">Geo</button>
      <button data-tab="feedback">Feedback<span class="badge" id="fbBadge" hidden></span></button>
      <button data-tab="ops">Ops</button>
    </div>
    <div class="scope" id="scope"></div>
  </div>

  <section class="tab" id="tab-overview">
    <div class="card headline" id="headline"></div>
    <button class="callout" id="fbCallout" data-goto="feedback"></button>

    <h2>Today so far</h2>
    <div class="tiles" id="tilesToday"></div>
    <p class="hint" id="todayHint" style="margin:6px 0 0"></p>

    <h2>Last 7 days</h2>
    <div class="tiles" id="tilesWeek"></div>

    <h2>Devices per day — new vs returning</h2>
    <div class="card">
      <div class="chart" id="devChart"></div>
      <div class="legend"><span><i style="background:var(--ok)"></i>New that day</span><span><i style="background:var(--accent)"></i>Seen before</span></div>
      <div class="hint" id="devHint" style="margin:8px 0 0"></div>
    </div>

    <h2>Day by day — last 14 days</h2>
    <div class="table-wrap"><table id="daysTable"><thead><tr>
      <th>Day</th><th class="num">Devices</th><th class="num">New</th><th class="num">Plays</th><th class="num">Runs</th><th>Most played</th>
    </tr></thead><tbody></tbody></table></div>

    <h2>Saved runs per day — last 30 days</h2>
    <div class="card">
      <div class="chart" id="runsChart"></div>
      <div class="hint" id="runsHint" style="margin-bottom:0"></div>
    </div>
  </section>

  <section class="tab" id="tab-games">
    <h2>Plays per day</h2>
    <div class="card">
      <div class="chart" id="playsChart"></div>
      <div class="hint" id="playsHint" style="margin-bottom:0"></div>
    </div>

    <h2>Games</h2>
    <p class="hint">Plays = games started. Runs = scores saved. Finish = runs ÷ plays, last 7 days. Trend = saved runs per day, last 14 days. Players = distinct initials; devices is usually higher because Safari and the home-screen app count separately.</p>
    <div class="table-wrap"><table id="gamesTable"><thead><tr>
      <th>Game</th><th>Trend 14d</th><th class="num">Plays 7d</th><th class="num">Today</th><th class="num">Devices 7d</th>
      <th class="num">Runs 7d</th><th class="num">Finish</th><th class="num">Runs all</th>
      <th class="num">Players</th><th class="num">Devices all</th>
    </tr></thead><tbody></tbody></table></div>

    <h2>Daily boards</h2>
    <div id="dailyEmpty" class="muted" style="display:none">No daily board scores yet.</div>
    <div class="table-wrap" id="dailyWrap"><table id="dailyTable"><thead><tr>
      <th>Board</th><th class="num">Runs</th><th class="num">Devices</th><th class="num">Games</th><th>Last played</th>
    </tr></thead><tbody></tbody></table></div>
  </section>

  <section class="tab" id="tab-players">
    <h2>Players</h2>
    <div class="tiles" id="tilesPlayers"></div>

    <h2>Who is counted</h2>
    <div class="card" id="filter"></div>

    <h2>Everyone</h2>
    <p class="hint">One row per set of initials. Last seen and active days come from saved runs in the last 90 days. Tap Mine on your own initials to leave them out of the numbers.</p>
    <div class="table-wrap"><table id="playersTable"><thead><tr>
      <th>Player</th><th>Status</th><th>Last seen</th><th class="num">Days (30d)</th>
      <th class="num">Runs 7d</th><th class="num">Runs all</th><th class="num">Games</th><th class="num">Devices</th>
    </tr></thead><tbody></tbody></table></div>

    <h2>Recent scores (50)</h2>
    <div class="table-wrap"><table id="scoresTable"><thead><tr>
      <th>When</th><th>Game</th><th>Initials</th><th class="num">Score</th><th>Board</th><th></th>
    </tr></thead><tbody></tbody></table></div>
  </section>

  <section class="tab" id="tab-geo">
    <h2>Where plays come from — last 30 days</h2>
    <p class="hint" id="geoHint"></p>
    <div id="geoBody">
      <div class="tiles" id="tilesGeo"></div>

      <h2>Countries</h2>
      <div class="table-wrap"><table id="countriesTable"><thead><tr>
        <th>Country</th><th></th><th class="num">Devices 30d</th><th class="num">7d</th><th class="num">Today</th><th class="num">Plays 30d</th>
      </tr></thead><tbody></tbody></table></div>

      <div id="usWrap">
        <h2>United States — devices by state, 30 days</h2>
        <div class="card"><div class="usgrid" id="usGrid"></div></div>
      </div>

      <h2>States and regions</h2>
      <div class="table-wrap"><table id="regionsTable"><thead><tr>
        <th>Region</th><th>Country</th><th></th><th class="num">Devices 30d</th><th class="num">7d</th><th class="num">Plays 30d</th>
      </tr></thead><tbody></tbody></table></div>
    </div>
  </section>

  <section class="tab" id="tab-feedback">
    <h2>Feedback</h2>
    <p class="hint" id="fbHint"></p>
    <div class="table-wrap"><table id="feedbackTable"><thead><tr>
      <th>When</th><th>Initials</th><th>Note</th><th>Version</th><th>Screen</th>
    </tr></thead><tbody></tbody></table></div>
  </section>

  <section class="tab" id="tab-ops">
    <h2>Capacity — free plan, today (resets 00:00 UTC)</h2>
    <div class="card" id="capacity"></div>

    <h2>App versions in use — last 7 days</h2>
    <div class="table-wrap"><table id="versionsTable"><thead><tr>
      <th>Version</th><th class="num">Devices</th>
    </tr></thead><tbody></tbody></table></div>

    <h2>Refused scores — last 7 days</h2>
    <p class="hint">A few rate_limited is normal. A pile of implausible_score or invalid_* means someone is poking the API.</p>
    <div class="table-wrap"><table id="rejectTable"><thead><tr>
      <th>Reason</th><th class="num">Count</th>
    </tr></thead><tbody></tbody></table></div>
  </section>
</div>

<script>
(function () {
  "use strict";
  var STORAGE_KEY = "dads-arcade-admin-token";
  var INCLUDE_KEY = "dads-arcade-admin-include-mine";
  var DAY = 86400000;
  var ACCENT = "#4c8dff", GOOD = "#3ecf8e", DIM = "#93a0b4", LINE = "#232b40";

  var loginEl = document.getElementById("login");
  var dashboardEl = document.getElementById("dashboard");
  var tokenInput = document.getElementById("token");
  var loginError = document.getElementById("loginError");
  var statusEl = document.getElementById("status");
  var lastData = null;

  // ---- small helpers ----
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtTime(ms) { return ms ? new Date(ms).toLocaleString() : "—"; }
  function fmtNum(n) { return n == null ? "—" : Number(n).toLocaleString(); }
  function td(text) { return "<td>" + esc(text) + "</td>"; }
  function tdn(n) { return "<td class='num'>" + esc(fmtNum(n)) + "</td>"; }
  function emptyRow(cols, text) { return "<tr><td colspan='" + cols + "' class='muted'>" + esc(text) + "</td></tr>"; }
  function tbody(id, html) { document.querySelector("#" + id + " tbody").innerHTML = html; }
  function sum(arr) { return arr.reduce(function (t, v) { return t + (v || 0); }, 0); }
  function ago(ms, now) {
    if (!ms) return "—";
    var m = Math.max(0, Math.round((now - ms) / 60000));
    if (m < 60) return m + "m ago";
    var h = Math.round(m / 60);
    if (h < 48) return h + "h ago";
    return Math.round(h / 24) + "d ago";
  }
  function shortDay(iso) {
    var d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function dayList(today, n) {
    var end = Date.parse(today + "T00:00:00Z"), out = [];
    for (var i = n - 1; i >= 0; i--) out.push(new Date(end - i * DAY).toISOString().slice(0, 10));
    return out;
  }
  function level(pct) { return pct >= 80 ? "bad" : pct >= 50 ? "warn" : "ok"; }
  var COLORS = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" };

  function api(method, path, body) {
    var opts = { method: method, headers: { "X-Admin-Token": localStorage.getItem(STORAGE_KEY) || "" } };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(path, opts);
  }

  // ---- trend lines ----
  // values: numbers, or null for "no data" (breaks the line).
  function spark(vals, w, h, color) {
    var n = vals.length;
    if (!n) return "";
    var max = 0;
    vals.forEach(function (v) { if (v != null && v > max) max = v; });
    if (max === 0) max = 1;
    var pad = 2.5, step = n > 1 ? (w - pad * 2) / (n - 1) : 0;
    var segs = [], cur = [];
    vals.forEach(function (v, i) {
      if (v == null) { if (cur.length) segs.push(cur); cur = []; return; }
      cur.push([pad + i * step, h - pad - (v / max) * (h - pad * 2)]);
    });
    if (cur.length) segs.push(cur);
    var out = segs.map(function (s) {
      if (s.length === 1) return "<circle cx='" + s[0][0].toFixed(1) + "' cy='" + s[0][1].toFixed(1) + "' r='2' fill='" + color + "'/>";
      return "<polyline fill='none' stroke='" + color + "' stroke-width='1.7' stroke-linejoin='round' stroke-linecap='round' points='" +
        s.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + "'/>";
    }).join("");
    var lastSeg = segs[segs.length - 1];
    if (lastSeg) {
      var p = lastSeg[lastSeg.length - 1];
      out += "<circle cx='" + p[0].toFixed(1) + "' cy='" + p[1].toFixed(1) + "' r='2.4' fill='" + color + "'/>";
    }
    return "<svg class='spark' width='" + w + "' height='" + h + "' viewBox='0 0 " + w + " " + h + "' aria-hidden='true'>" + out + "</svg>";
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var pow = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var f = v / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }

  // A full-width line chart with a soft fill. Drawn at the container's real
  // pixel width so the text stays readable on a phone and on a desktop.
  function lineChart(elId, days, vals, color, unit) {
    var el = document.getElementById(elId);
    var w = Math.max(240, el.clientWidth || 320), h = 130;
    var L = 30, R = 8, T = 8, B = 20, iw = w - L - R, ih = h - T - B;
    var known = vals.filter(function (v) { return v != null; });
    var max = niceMax(known.length ? Math.max.apply(null, known) : 0);
    var n = days.length, step = n > 1 ? iw / (n - 1) : 0;
    function X(i) { return L + i * step; }
    function Y(v) { return T + ih - (v / max) * ih; }
    var s = "<svg viewBox='0 0 " + w + " " + h + "' width='" + w + "' height='" + h + "' role='img' aria-label='" + esc(unit) + " per day'>";
    [0, 0.5, 1].forEach(function (f) {
      var y = T + ih - f * ih;
      s += "<line x1='" + L + "' x2='" + (w - R) + "' y1='" + y + "' y2='" + y + "' stroke='" + LINE + "' stroke-width='1'/>";
      s += "<text x='" + (L - 5) + "' y='" + (y + 3.5) + "' text-anchor='end' font-size='10' fill='" + DIM + "'>" + fmtNum(Math.round(max * f)) + "</text>";
    });
    var segs = [], cur = [];
    vals.forEach(function (v, i) {
      if (v == null) { if (cur.length) segs.push(cur); cur = []; return; }
      cur.push([X(i), Y(v), v, days[i]]);
    });
    if (cur.length) segs.push(cur);
    segs.forEach(function (seg) {
      if (seg.length > 1) {
        var pts = seg.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
        s += "<polygon points='" + seg[0][0].toFixed(1) + "," + (T + ih) + " " + pts + " " + seg[seg.length - 1][0].toFixed(1) + "," + (T + ih) + "' fill='" + color + "' fill-opacity='0.16'/>";
        s += "<polyline fill='none' stroke='" + color + "' stroke-width='2' stroke-linejoin='round' stroke-linecap='round' points='" + pts + "'/>";
      }
      seg.forEach(function (p) {
        s += "<circle cx='" + p[0].toFixed(1) + "' cy='" + p[1].toFixed(1) + "' r='" + (seg.length > 12 ? 2 : 3) + "' fill='" + color + "'><title>" +
          esc(shortDay(p[3]) + ": " + fmtNum(p[2]) + " " + unit) + "</title></circle>";
      });
    });
    [0, Math.floor((n - 1) / 2), n - 1].forEach(function (i, k) {
      s += "<text x='" + X(i) + "' y='" + (h - 5) + "' text-anchor='" + (k === 0 ? "start" : k === 2 ? "end" : "middle") +
        "' font-size='10' fill='" + DIM + "'>" + esc(shortDay(days[i])) + "</text>";
    });
    el.innerHTML = s + "</svg>";
  }

  // Stacked bars, one per day: "seen before" at the bottom, "new" on top.
  // null in either series means "not counted yet" and leaves a gap.
  function barChart(elId, days, newVals, oldVals) {
    var el = document.getElementById(elId);
    var w = Math.max(240, el.clientWidth || 320), h = 150;
    var L = 30, R = 8, T = 8, B = 20, iw = w - L - R, ih = h - T - B;
    var top = 0;
    days.forEach(function (x, i) { if (newVals[i] != null) top = Math.max(top, newVals[i] + oldVals[i]); });
    var max = niceMax(top), n = days.length, slot = iw / n, bw = Math.max(2, slot * 0.7);
    var s = "<svg viewBox='0 0 " + w + " " + h + "' width='" + w + "' height='" + h + "' role='img' aria-label='Devices per day, new and returning'>";
    [0, 0.5, 1].forEach(function (f) {
      var y = T + ih - f * ih;
      s += "<line x1='" + L + "' x2='" + (w - R) + "' y1='" + y + "' y2='" + y + "' stroke='" + LINE + "' stroke-width='1'/>";
      s += "<text x='" + (L - 5) + "' y='" + (y + 3.5) + "' text-anchor='end' font-size='10' fill='" + DIM + "'>" + fmtNum(Math.round(max * f)) + "</text>";
    });
    days.forEach(function (x, i) {
      if (newVals[i] == null) return;
      var bx = L + i * slot + (slot - bw) / 2;
      var ho = (oldVals[i] / max) * ih, hn = (newVals[i] / max) * ih;
      s += "<g><title>" + esc(shortDay(x) + ": " + fmtNum(newVals[i] + oldVals[i]) + " devices, " + fmtNum(newVals[i]) + " new") + "</title>";
      // A full-height invisible bar so the tooltip works on empty days too.
      s += "<rect x='" + bx.toFixed(1) + "' y='" + T + "' width='" + bw.toFixed(1) + "' height='" + ih + "' fill='transparent'/>";
      if (ho > 0) s += "<rect x='" + bx.toFixed(1) + "' y='" + (T + ih - ho).toFixed(1) + "' width='" + bw.toFixed(1) + "' height='" + ho.toFixed(1) + "' fill='" + ACCENT + "'/>";
      if (hn > 0) s += "<rect x='" + bx.toFixed(1) + "' y='" + (T + ih - ho - hn).toFixed(1) + "' width='" + bw.toFixed(1) + "' height='" + hn.toFixed(1) + "' fill='" + GOOD + "'/>";
      s += "</g>";
    });
    [0, Math.floor((n - 1) / 2), n - 1].forEach(function (i) {
      s += "<text x='" + (L + i * slot + slot / 2).toFixed(1) + "' y='" + (h - 5) + "' text-anchor='middle' font-size='10' fill='" + DIM + "'>" + esc(shortDay(days[i])) + "</text>";
    });
    el.innerHTML = s + "</svg>";
  }

  // The last 7 days of a daily series against the 7 before.
  function weekDelta(series) {
    return { cur: sum(series.slice(-7)), prev: sum(series.slice(-14, -7)) };
  }
  function deltaHtml(d) {
    if (d.prev === 0) return "<span class='delta flat'>" + (d.cur === 0 ? "no change" : "new activity") + "</span>";
    var pct = Math.round(((d.cur - d.prev) / d.prev) * 100);
    var cls = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    return "<span class='delta " + cls + "'>" + (pct > 0 ? "▲ " : pct < 0 ? "▼ " : "") + Math.abs(pct) + "% vs prior 7d</span>";
  }

  function tile(label, value, sub, extra) {
    return "<div class='tile'><div class='v'>" + esc(typeof value === "string" ? value : fmtNum(value)) + "</div><div class='l'>" + esc(label) +
      "</div>" + (sub ? "<div class='s'>" + sub + "</div>" : "") + (extra ? "<div class='sp'>" + extra + "</div>" : "") + "</div>";
  }
  function plainTile(label, value, sub) {
    // A name (a country, a state) rather than a number: smaller, so it fits.
    var cls = typeof value === "string" && value.length > 6 ? "v word" : "v";
    return "<div class='tile'><div class='" + cls + "'>" + esc(typeof value === "string" ? value : fmtNum(value)) + "</div><div class='l'>" + esc(label) +
      "</div>" + (sub ? "<div class='s'>" + esc(sub) + "</div>" : "") + "</div>";
  }

  // ---- sections ----
  function renderFilter(d) {
    var el = document.getElementById("filter");
    var items = d.mine.items || [];
    var html = "<div class='row'>" +
      "<label class='switch'><input type='checkbox' id='includeMine'" + (d.includeMine ? " checked" : "") + "> Include my devices</label>" +
      "<button class='small' id='markBrowser' style='margin-left:auto'>Mark this browser as mine</button></div>";
    html += "<div class='hint' style='margin:8px 0 0'>" + (d.includeMine
      ? "Showing everyone, including " + fmtNum(d.mine.devices) + " device(s) marked as mine."
      : (d.mine.devices
        ? "Real players only. " + fmtNum(d.mine.devices) + " device(s) marked as mine are left out of every count."
        : "Nothing marked yet, so your own testing is mixed into every number. Mark this browser, or tap Mine on your initials in the Players table.")) + "</div>";
    if (items.length) {
      html += "<div>" + items.map(function (m) {
        var name = m.kind === "initials" ? "Initials " + m.value : (m.label || "device " + m.value.slice(0, 6));
        return "<span class='chip'>" + esc(name) +
          "<button data-unmine='" + esc(m.kind) + "' data-value='" + esc(m.value) + "' aria-label='Remove'>×</button></span>";
      }).join("") + "</div>";
    }
    el.innerHTML = html;
  }

  // Every daily series the page draws, lined up on the same 30 days. Play
  // tracking started later than scores did, so anything from play_days is
  // null before its first day rather than a misleading zero.
  function buildSeries(d) {
    var days30 = dayList(d.today, 30);
    var since = d.trackingSince;
    function tracked(x) { return !!since && x >= since; }
    var byDay = {};
    (d.runsByDay || []).forEach(function (r) { byDay[r.day] = r; });
    var playsMap = {};
    (d.playsByDay || []).forEach(function (r) { playsMap[r.day] = r; });
    var newMap = {};
    (d.newByDay || []).forEach(function (r) { newMap[r.day] = r.devices; });
    var topGame = {};
    (d.playsByGameDay || []).forEach(function (r) {
      if (!topGame[r.day] || r.plays > topGame[r.day].plays) topGame[r.day] = r;
    });
    var trackedDays = since ? Math.round((Date.parse(d.today + "T00:00:00Z") - Date.parse(since + "T00:00:00Z")) / DAY) + 1 : 0;
    return {
      days30: days30, since: since, trackedDays: trackedDays, topGame: topGame,
      runs: days30.map(function (x) { return byDay[x] ? byDay[x].runs : 0; }),
      plays: days30.map(function (x) { return tracked(x) ? (playsMap[x] ? playsMap[x].plays : 0) : null; }),
      devices: days30.map(function (x) { return tracked(x) ? (playsMap[x] ? playsMap[x].devices : 0) : null; }),
      fresh: days30.map(function (x) { return tracked(x) ? (newMap[x] || 0) : null; })
    };
  }

  // Yesterday and a typical day (the mean of the 7 days before today), for
  // putting today's partial numbers in context.
  function contextText(series) {
    var y = series[series.length - 2];
    if (y == null) return "";
    var prior = series.slice(-8, -1).filter(function (v) { return v != null; });
    return "yesterday " + fmtNum(y) + (prior.length ? " · typical " + fmtNum(Math.round(sum(prior) / prior.length)) : "");
  }

  function renderScope(d) {
    var n = d.mine.devices;
    var text = d.includeMine
      ? "Counting everyone, including your " + fmtNum(n) + " device" + (n === 1 ? "" : "s") + "."
      : (n ? "Real players only: " + fmtNum(n) + " of your own device" + (n === 1 ? "" : "s") + " left out."
           : "Your own testing is mixed into these numbers.");
    document.getElementById("scope").innerHTML = esc(text) + " Days are UTC.<button data-goto='players'>Change</button>";
  }

  function renderHeadline(d, s) {
    var el = document.getElementById("headline");
    var n = s.days30.length, yDay = s.days30[n - 2];
    var dev = s.devices[n - 2];
    if (dev == null) {
      el.textContent = s.since ? "Play counts started " + shortDay(s.since) + ". Tomorrow there will be a full day to describe here."
        : "No plays recorded yet.";
      return;
    }
    var html = "Yesterday (" + esc(shortDay(yDay)) + "): <b>" + fmtNum(dev) + "</b> device" + (dev === 1 ? "" : "s") +
      ", <b>" + fmtNum(s.fresh[n - 2]) + "</b> new, <b>" + fmtNum(s.plays[n - 2]) + "</b> plays";
    // Against the 7 days before it, so a push shows up as a multiple.
    var prior = s.devices.slice(-9, -2).filter(function (v) { return v != null; });
    var typical = prior.length >= 3 ? sum(prior) / prior.length : 0;
    if (typical > 0) {
      var ratio = dev / typical;
      html += ratio >= 1.5 ? " — about <b>" + (ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)) + "×</b> a typical day"
        : ratio <= 0.67 ? " — quieter than a typical day (" + fmtNum(Math.round(typical)) + ")"
        : " — about a typical day";
    }
    html += ".";
    var best = -1, bestI = -1;
    s.devices.forEach(function (v, i) { if (v != null && i < n - 1 && v > best) { best = v; bestI = i; } });
    if (bestI === n - 2 && s.trackedDays > 3) html += " That is the busiest day since counting began " + esc(shortDay(s.since)) + ".";
    else if (bestI >= 0 && best > 0) html += " Busiest day so far: " + esc(shortDay(s.days30[bestI])) + " with " + fmtNum(best) + " devices, " + fmtNum(s.fresh[bestI]) + " of them new.";
    el.innerHTML = html;
  }

  function renderTiles(d, s) {
    var t = d.totals || {}, r = d.retention || {};
    var n = s.days30.length;
    var freshToday = s.fresh[n - 1];

    document.getElementById("tilesToday").innerHTML =
      plainTile("Devices playing", t.devicesToday, contextText(s.devices)) +
      plainTile("New devices", freshToday == null ? "—" : freshToday, contextText(s.fresh)) +
      plainTile("Plays", t.playsToday, contextText(s.plays)) +
      plainTile("Runs saved", t.runsToday, contextText(s.runs));
    var reset = new Date(Date.parse(d.today + "T00:00:00Z") + DAY);
    document.getElementById("todayHint").textContent = "Today is the UTC day; it rolls over at " +
      reset.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) + " your time.";

    var fresh7 = sum(s.fresh.slice(-7));
    var runDelta = weekDelta(s.runs);
    var span = Math.min(14, s.trackedDays);
    document.getElementById("tilesWeek").innerHTML =
      tile("Active devices", t.devices7d,
        esc(fmtNum(fresh7) + " new · " + fmtNum(Math.max(0, (t.devices7d || 0) - fresh7)) + " seen before"),
        s.trackedDays >= 3 ? spark(s.devices.slice(-span), 120, 28, ACCENT) : "") +
      tile("Plays", t.plays7d,
        s.trackedDays >= 14 ? deltaHtml(weekDelta(s.plays.map(function (v) { return v || 0; }))) : esc("counting since " + (s.since ? shortDay(s.since) : "—")),
        s.trackedDays >= 3 ? spark(s.plays.slice(-span), 120, 28, GOOD) : "") +
      tile("Saved runs", runDelta.cur, deltaHtml(runDelta), spark(s.runs.slice(-14), 120, 28, ACCENT)) +
      plainTile("Came back (30d)", r.active30d ? Math.round((r.returning30d / r.active30d) * 100) + "%" : "—",
        fmtNum(r.returning30d) + " of " + fmtNum(r.active30d) + " devices played on 2+ days");

    var weekAgo = d.generatedAt - 7 * DAY;
    var activePlayers = (d.players || []).filter(function (p) { return p.lastRun && p.lastRun >= weekAgo; }).length;
    var installed = 0, browser = 0;
    (d.installSplit || []).forEach(function (row) { if (row.installed) installed = row.devices; else browser = row.devices; });
    var instTotal = installed + browser;
    document.getElementById("tilesPlayers").innerHTML =
      plainTile("Players active · 7 days", activePlayers, "saved a run this week") +
      plainTile("Players (initials)", t.playersAllTime, "all-time") +
      plainTile("Devices", t.devicesAllTime, "all-time, with a saved run") +
      plainTile("Home-screen app (7d)", instTotal ? Math.round((installed / instTotal) * 100) + "%" : "—",
        fmtNum(installed) + " installed · " + fmtNum(browser) + " in a browser");
  }

  function renderDays(d, s) {
    var n = s.days30.length, html = "";
    for (var i = n - 1; i >= Math.max(0, n - 14); i--) {
      if (s.devices[i] == null) continue;
      var day = s.days30[i], tg = s.topGame[day];
      var label = new Date(day + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
      html += "<tr>" + td(label + (i === n - 1 ? " (so far)" : "")) + tdn(s.devices[i]) + tdn(s.fresh[i]) + tdn(s.plays[i]) + tdn(s.runs[i]) +
        td(tg ? tg.gameId + " · " + fmtNum(tg.plays) : "—") + "</tr>";
    }
    tbody("daysTable", html || emptyRow(6, "No plays recorded yet."));
  }

  // Charts are drawn at their container's pixel width, so only the visible
  // tab's charts are drawn; switching tabs draws the rest.
  function renderCharts(d, s) {
    var span = Math.max(7, Math.min(30, s.trackedDays));
    if (currentTab() === "overview") {
      var fresh = s.fresh.slice(-span);
      barChart("devChart", s.days30.slice(-span), fresh,
        s.devices.slice(-span).map(function (v, i) { return v == null ? null : Math.max(0, v - (fresh[i] || 0)); }));
      document.getElementById("devHint").textContent = !s.since ? "No plays recorded yet."
        : "A device is new on the first day it ever starts a game. Counting began " + shortDay(s.since) +
          ", so everyone seen that day shows as new. Safari and the home-screen app count as separate devices.";

      lineChart("runsChart", s.days30, s.runs, ACCENT, "runs");
      var best = 0, bestDay = "";
      s.runs.forEach(function (v, i) { if (v > best) { best = v; bestDay = s.days30[i]; } });
      var rd = weekDelta(s.runs);
      document.getElementById("runsHint").textContent = best
        ? "Busiest day: " + fmtNum(best) + " runs on " + shortDay(bestDay) + ". Last 7 days: " + fmtNum(rd.cur) + " runs; the 7 before: " + fmtNum(rd.prev) + "."
        : "No saved runs in the last 30 days.";
    }
    if (currentTab() === "games") {
      lineChart("playsChart", s.days30.slice(-span), s.plays.slice(-span), GOOD, "plays");
      document.getElementById("playsHint").textContent = !s.since
        ? "No plays recorded yet. Play counts start with v0.12.6; phones pick it up the next time the app opens."
        : "Games started, counted since " + shortDay(s.since) + " (" + s.trackedDays + " day" + (s.trackedDays === 1 ? "" : "s") +
          "). Phones on older versions don't report plays, so early days run low.";
    }
  }

  // ---- geo ----
  // The usual square-per-state map: column:row on an 11 x 8 grid.
  var US_GRID = "AK:0:0,ME:10:0,VT:9:1,NH:10:1,WA:0:2,ID:1:2,MT:2:2,ND:3:2,MN:4:2,IL:5:2,WI:6:2,MI:7:2,NY:8:2,RI:9:2,MA:10:2," +
    "OR:0:3,NV:1:3,WY:2:3,SD:3:3,IA:4:3,IN:5:3,OH:6:3,PA:7:3,NJ:8:3,CT:9:3,CA:0:4,UT:1:4,CO:2:4,NE:3:4,MO:4:4,KY:5:4,WV:6:4,VA:7:4,MD:8:4,DE:9:4," +
    "AZ:1:5,NM:2:5,KS:3:5,AR:4:5,TN:5:5,NC:6:5,SC:7:5,DC:8:5,OK:3:6,LA:4:6,MS:5:6,AL:6:6,GA:7:6,HI:0:7,TX:3:7,FL:8:7";
  var regionNames = null;
  function countryName(code) {
    try {
      if (!regionNames) regionNames = new Intl.DisplayNames(undefined, { type: "region" });
      return regionNames.of(code) || code;
    } catch (e) { return code; }
  }
  function hbar(v, max) {
    return "<td><div class='hbar'><div style='width:" + (max ? Math.max(3, (v / max) * 100) : 0).toFixed(0) + "%'></div></div></td>";
  }

  function renderGeo(d) {
    var g = d.geo || {}, countries = g.countries || [], regions = g.regions || [];
    var hint = document.getElementById("geoHint"), bodyEl = document.getElementById("geoBody");
    if (!countries.length) {
      bodyEl.style.display = "none";
      hint.textContent = g.since
        ? "Nothing in the last 30 days from devices that aren't yours."
        : "No locations recorded yet. This starts counting with the release that added it: each game start notes the country and state Cloudflare sees the request come from. Nothing before that release can be filled in.";
      return;
    }
    bodyEl.style.display = "block";
    hint.textContent = "Country and state of the network each game was started from, counted since " + shortDay(g.since) +
      ". It is where the connection is, so a VPN or a phone on mobile data can land in the wrong state. No addresses are kept.";

    var total = sum(countries.map(function (c) { return c.devices30d; }));
    var top = countries[0], topRegion = regions[0];
    document.getElementById("tilesGeo").innerHTML =
      plainTile("Countries", countries.length, "with a game started") +
      plainTile("Top country", countryName(top.country), fmtNum(top.devices30d) + " of " + fmtNum(total) + " devices") +
      plainTile("States / regions", regions.length, "distinct") +
      plainTile("Top region", topRegion ? (topRegion.region || topRegion.regionCode || "Unknown") : "—",
        topRegion ? fmtNum(topRegion.devices30d) + " devices · " + countryName(topRegion.country) : "");

    var cmax = top.devices30d;
    tbody("countriesTable", countries.map(function (c) {
      return "<tr>" + td(countryName(c.country)) + hbar(c.devices30d, cmax) + tdn(c.devices30d) + tdn(c.devices7d) + tdn(c.devicesToday) + tdn(c.plays30d) + "</tr>";
    }).join(""));

    var us = {}, usMax = 0;
    regions.forEach(function (r) { if (r.country === "US" && r.regionCode) { us[r.regionCode] = r; usMax = Math.max(usMax, r.devices30d); } });
    document.getElementById("usWrap").style.display = usMax ? "block" : "none";
    document.getElementById("usGrid").innerHTML = US_GRID.split(",").map(function (cell) {
      var p = cell.split(":"), r = us[p[0]];
      var style = "grid-column:" + (Number(p[1]) + 1) + ";grid-row:" + (Number(p[2]) + 1) +
        (r ? ";background:rgba(76,141,255," + (0.3 + 0.7 * (r.devices30d / usMax)).toFixed(2) + ")" : "");
      return "<div" + (r ? " class='hit'" : "") + " style='" + style + "' title='" + esc(r ? (r.region || p[0]) + ": " + r.devices30d + " devices" : p[0]) + "'>" +
        p[0] + (r ? "<span>" + fmtNum(r.devices30d) + "</span>" : "") + "</div>";
    }).join("");

    var rmax = regions.length ? regions[0].devices30d : 0;
    tbody("regionsTable", regions.map(function (r) {
      return "<tr>" + td(r.region || r.regionCode || "Unknown") + td(countryName(r.country)) + hbar(r.devices30d, rmax) +
        tdn(r.devices30d) + tdn(r.devices7d) + tdn(r.plays30d) + "</tr>";
    }).join("") || emptyRow(6, "No regions yet."));
  }

  function statusPill(p, now) {
    if (!p.lastRun) return "<span class='pill quiet'>Quiet 90d+</span>";
    var days = (now - p.lastRun) / DAY;
    if (days <= 7) return "<span class='pill ok'>Active</span>";
    if (days <= 21) return "<span class='pill warn'>Slipping</span>";
    return "<span class='pill quiet'>Quiet</span>";
  }

  function renderPlayers(d) {
    tbody("playersTable", (d.players || []).map(function (p) {
      // The Mine button lives in the first cell so it is visible without
      // scrolling the table sideways on a phone.
      var btn = "<button class='small" + (p.mine ? " on" : "") + "' style='margin-left:8px' data-mine-initials='" + esc(p.initials) +
        "' data-is-mine='" + (p.mine ? "1" : "") + "'>" + (p.mine ? "Unmark" : "Mine") + "</button>";
      return "<tr" + (p.mine ? " class='dim'" : "") + "><td>" + esc(p.initials) + btn + "</td>" +
        "<td>" + statusPill(p, d.generatedAt) + "</td>" + td(p.lastRun ? ago(p.lastRun, d.generatedAt) : "—") +
        tdn(p.days30) + tdn(p.runs7d) + tdn(p.runs) + tdn(p.games) + tdn(p.devices) + "</tr>";
    }).join("") || emptyRow(8, "No players yet."));
  }

  function renderGames(d) {
    tbody("gamesTable", (d.games || []).map(function (r) {
      var finish = r.plays7d ? Math.round((r.runs7d / r.plays7d) * 100) + "%" : "—";
      return "<tr>" + td(r.gameId) + "<td>" + spark((d.gameRuns && d.gameRuns[r.gameId]) || [], 80, 22, ACCENT) + "</td>" +
        tdn(r.plays7d) + tdn(r.playsToday) + tdn(r.activeDevices7d) +
        tdn(r.runs7d) + "<td class='num'>" + finish + "</td>" + tdn(r.runsAllTime) +
        tdn(r.playersAllTime) + tdn(r.devicesAllTime) + "</tr>";
    }).join("") || emptyRow(10, "Nothing yet."));
  }

  function meter(label, used, limit) {
    var pct = limit ? Math.min(100, (used / limit) * 100) : 0;
    var lv = level(pct);
    return "<div class='meter'><div class='top'><span>" + esc(label) + "</span>" +
      "<span>" + fmtNum(used) + " / " + fmtNum(limit) + " <span class='pill " + lv + "'>" +
      (pct < 1 && used > 0 ? "<1" : Math.round(pct)) + "%</span></span></div>" +
      "<div class='bar'><div class='fill' style='width:" + Math.max(pct, used > 0 ? 1 : 0) +
      "%;background:" + COLORS[lv] + "'></div></div></div>";
  }

  function renderCapacity(cap) {
    var el = document.getElementById("capacity");
    var u = cap.usage || {}, L = cap.limits || {}, t = cap.tables || {};
    var html = "";
    if (u.source === "cloudflare") {
      html += meter("Worker requests", u.workerRequests, L.workerRequests);
      html += meter("Database rows read", u.d1RowsRead, L.d1RowsRead);
      html += meter("Database rows written", u.d1RowsWritten, L.d1RowsWritten);
      if (u.workerErrors) html += "<div class='hint'>Worker errors today: " + fmtNum(u.workerErrors) + "</div>";
      html += "<div class='hint' style='margin-bottom:0'>Whole Cloudflare account, all Workers and databases — the free limits are shared. " +
        "Over a limit, the scoreboard stops until 00:00 UTC; scores queue on the phones meanwhile.</div>";
    } else {
      html += "<div class='hint'>" + (u.source === "error"
        ? "Couldn't read live usage from Cloudflare: " + esc(u.message || "unknown error")
        : "Live usage not connected. Add CF_API_TOKEN and CF_ACCOUNT_ID secrets to see today's requests and rows against the free limits here (see the runbook).") +
        " Until then, check Cloudflare → Workers &amp; Pages → play → Metrics, and D1 → hyperdrive-arcade → Metrics.</div>";
    }
    html += "<div class='tiles' style='margin-top:10px'>" +
      plainTile("Runs stored", t.scoresRows, "history table") +
      plainTile("Leaderboard rows", t.bestRows, "one per device per board") +
      plainTile("Biggest board", t.largestBoard, "devices on one game") +
      plainTile("Play-day rows", t.playDayRows, "one per device per game per day") +
      "</div>";
    el.innerHTML = html;
  }

  function renderSimple(id, rows, a, b, emptyText) {
    tbody(id, rows.map(function (r) { return "<tr>" + td(r[a]) + tdn(r[b]) + "</tr>"; }).join("") || emptyRow(2, emptyText));
  }

  function renderDaily(rows) {
    var empty = document.getElementById("dailyEmpty");
    var wrap = document.getElementById("dailyWrap");
    empty.style.display = rows.length ? "none" : "block";
    wrap.style.display = rows.length ? "block" : "none";
    tbody("dailyTable", rows.map(function (r) {
      return "<tr>" + td(r.boardId) + tdn(r.scores) + tdn(r.uniqueDevices) + tdn(r.games) + td(fmtTime(r.lastPlayed)) + "</tr>";
    }).join(""));
  }

  function renderScores(rows) {
    tbody("scoresTable", rows.map(function (r) {
      return "<tr" + (r.mine ? " class='dim'" : "") + ">" + td(fmtTime(r.createdAt)) + td(r.gameId) + td(r.initials + (r.mine ? " (mine)" : "")) + tdn(r.score) + td(r.boardId) +
        "<td><button class='small' data-del='" + esc(r.id) + "' data-label='" + esc(r.initials + " " + r.score + " on " + r.gameId) + "'>Delete</button></td></tr>";
    }).join("") || emptyRow(6, "No scores yet."));
  }

  function renderFeedback(d) {
    var rows = d.feedback || [], n = d.feedback7d || 0;
    var weekAgo = d.generatedAt - 7 * DAY;
    var badge = document.getElementById("fbBadge");
    badge.hidden = !n;
    badge.textContent = n;
    var callout = document.getElementById("fbCallout");
    callout.className = "callout" + (n ? " hot" : "");
    callout.innerHTML = n
      ? "<b>" + fmtNum(n) + "</b><span>new feedback note" + (n === 1 ? "" : "s") + " in the last 7 days</span><span class='go'>Read</span>"
      : "<span>No new feedback in the last 7 days.</span>" + (rows.length ? "<span class='go'>Older notes</span>" : "");
    document.getElementById("fbHint").textContent = fmtNum(n) + " in the last 7 days. Newest first, the latest 30; " +
      "notes from the last 7 days are marked New.";
    tbody("feedbackTable", rows.map(function (r) {
      var version = "—", screen = "—";
      if (r.context) {
        try { var p = JSON.parse(r.context); version = p.v || "—"; screen = p.screen || "—"; }
        catch (e) { screen = r.context; }
      }
      var fresh = r.createdAt >= weekAgo;
      return "<tr>" + "<td>" + (fresh ? "<span class='pill warn'>New</span> " : "") + esc(ago(r.createdAt, d.generatedAt)) + "</td>" +
        td(r.initials || "—") + "<td class='msg'>" + esc(r.message) + "</td>" + td(version) + td(screen) + "</tr>";
    }).join("") || emptyRow(5, "No feedback yet."));
  }

  function render(d) {
    lastData = d;
    renderScope(d);
    renderFilter(d);
    var s = buildSeries(d);
    d._series = s;
    renderHeadline(d, s);
    renderTiles(d, s);
    renderDays(d, s);
    renderCharts(d, s);
    renderGeo(d);
    renderPlayers(d);
    renderGames(d);
    renderDaily(d.dailyBoards || []);
    renderSimple("versionsTable", d.versions || [], "version", "devices", "No plays recorded yet.");
    renderSimple("rejectTable", d.rejections || [], "reason", "n", "None — good.");
    renderCapacity(d.capacity || {});
    renderScores(d.recentScores || []);
    renderFeedback(d);
  }

  // ---- tabs ----
  var TABS = ["overview", "games", "players", "geo", "feedback", "ops"];
  function currentTab() {
    var t = location.hash.slice(1);
    return TABS.indexOf(t) >= 0 ? t : "overview";
  }
  function showTab(name, scroll) {
    if (TABS.indexOf(name) < 0) name = "overview";
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    TABS.forEach(function (t) { document.getElementById("tab-" + t).className = "tab" + (t === name ? " on" : ""); });
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
      b.className = b.dataset.tab === name ? "on" : "";
    });
    if (scroll) window.scrollTo(0, 0);
    if (lastData && lastData._series) renderCharts(lastData, lastData._series);
  }
  document.getElementById("tabs").addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-tab]");
    if (btn) showTab(btn.dataset.tab, true);
  });
  window.addEventListener("hashchange", function () { showTab(currentTab(), true); });
  dashboardEl.addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-goto]");
    if (btn) showTab(btn.dataset.goto, true);
  });

  // ---- login and loading ----
  function showLogin(message) {
    loginEl.style.display = "block";
    dashboardEl.style.display = "none";
    loginError.hidden = !message;
    if (message) loginError.textContent = message;
  }
  function showDashboard() { loginEl.style.display = "none"; dashboardEl.style.display = "block"; showTab(currentTab()); }

  function includeMine() { return localStorage.getItem(INCLUDE_KEY) === "1"; }

  function load() {
    if (!localStorage.getItem(STORAGE_KEY)) { showLogin(); return; }
    statusEl.textContent = "Loading…";
    api("GET", "/api/admin/overview" + (includeMine() ? "?mine=include" : ""))
      .then(function (response) {
        if (response.status === 403) {
          localStorage.removeItem(STORAGE_KEY);
          showLogin("That token was rejected. Check it and try again.");
          return null;
        }
        if (!response.ok) throw new Error("http_" + response.status);
        return response.json();
      })
      .then(function (d) {
        if (!d) return;
        showDashboard();
        render(d);
        statusEl.textContent = "Updated " + new Date().toLocaleTimeString();
      })
      .catch(function () { statusEl.textContent = "Couldn't reach the server."; });
  }

  function myDeviceId() {
    // The game keeps its ids in this same browser storage. Read-only here.
    try {
      var p = JSON.parse(localStorage.getItem("hyperdrive.player") || "null");
      if (p && p.deviceId) return p.deviceId;
      return localStorage.getItem("hyperdrive.visitor");
    } catch (e) { return null; }
  }

  function mark(body, okText) {
    return api("POST", "/api/admin/mine", body).then(function (r) {
      statusEl.textContent = r.ok ? okText : "Couldn't save (" + r.status + ")";
      if (r.ok) load();
    }).catch(function () { statusEl.textContent = "Couldn't save."; });
  }

  // ---- events ----
  document.getElementById("filter").addEventListener("change", function (event) {
    if (event.target.id !== "includeMine") return;
    localStorage.setItem(INCLUDE_KEY, event.target.checked ? "1" : "0");
    load();
  });

  document.getElementById("filter").addEventListener("click", function (event) {
    var btn = event.target.closest("button");
    if (!btn) return;
    if (btn.id === "markBrowser") {
      var id = myDeviceId();
      if (!id || id.length < 8) { statusEl.textContent = "This browser hasn't played the arcade yet, so it has no device id."; return; }
      mark({ kind: "device", value: id, label: "This browser" }, "Marked this browser as mine.");
      return;
    }
    if (btn.dataset.unmine) {
      api("DELETE", "/api/admin/mine?kind=" + encodeURIComponent(btn.dataset.unmine) + "&value=" + encodeURIComponent(btn.dataset.value))
        .then(function (r) { statusEl.textContent = r.ok ? "Removed." : "Couldn't remove (" + r.status + ")"; load(); });
    }
  });

  document.getElementById("playersTable").addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-mine-initials]");
    if (!btn) return;
    var initials = btn.dataset.mineInitials;
    if (btn.dataset.isMine) {
      api("DELETE", "/api/admin/mine?kind=initials&value=" + encodeURIComponent(initials))
        .then(function (r) { statusEl.textContent = r.ok ? "Unmarked " + initials + "." : "Couldn't unmark (" + r.status + ")"; load(); });
    } else {
      mark({ kind: "initials", value: initials }, "Marked " + initials + " as mine.");
    }
  });

  // Delete a silly score. Asks first, in the page rather than a browser
  // dialog, by turning the button into a confirm button for a few seconds.
  document.getElementById("scoresTable").addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-del]");
    if (!btn) return;
    if (btn.dataset.armed !== "1") {
      btn.dataset.armed = "1";
      btn.textContent = "Tap to confirm";
      btn.style.background = "var(--bad)";
      setTimeout(function () {
        if (!btn.isConnected) return;
        btn.dataset.armed = "";
        btn.textContent = "Delete";
        btn.style.background = "";
      }, 4000);
      return;
    }
    btn.disabled = true;
    api("DELETE", "/api/scores/" + encodeURIComponent(btn.dataset.del)).then(function (r) {
      statusEl.textContent = r.ok ? "Deleted " + btn.dataset.label : "Delete failed (" + r.status + ")";
      load();
    }).catch(function () { statusEl.textContent = "Delete failed."; btn.disabled = false; });
  });

  document.getElementById("unlock").addEventListener("click", function () {
    var value = tokenInput.value.trim();
    if (!value) return;
    localStorage.setItem(STORAGE_KEY, value);
    load();
  });
  tokenInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") document.getElementById("unlock").click();
  });
  document.getElementById("refresh").addEventListener("click", load);
  document.getElementById("logout").addEventListener("click", function () {
    localStorage.removeItem(STORAGE_KEY);
    tokenInput.value = "";
    showLogin();
  });

  // Charts are drawn at the container's pixel width, so redraw when it changes.
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (lastData && lastData._series) renderCharts(lastData, lastData._series);
    }, 150);
  });

  load();
})();
</script>
</body>
</html>
`;
