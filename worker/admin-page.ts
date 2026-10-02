/**
 * The `/admin` dashboard: a single self-contained HTML response with its own
 * inline CSS and JS. Deliberately not part of the Vite-built SPA -- it has no
 * bundle, isn't in `dist/`, registers no service worker, and never appears in
 * any build manifest. It is served straight out of the Worker (see the
 * `/admin` branch in `worker/index.ts`), gated by nothing at the page level;
 * every request it makes to `/api/admin/*` carries the token typed into the
 * login form, and the server rejects those without a valid one.
 *
 * Layout is phone-first: who is being counted, then headline numbers with
 * trend lines, then who is playing, then per-game detail, then the raw lists.
 * Capacity sits lower down: it is far from any limit at this scale.
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

  .tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  @media (min-width: 640px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
  .tile .v { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
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
  <div class="row">
    <h1 style="margin-bottom:0">Dad's Arcade — Admin</h1>
    <span id="status"></span>
  </div>
  <div class="row" style="margin-top:10px">
    <button id="refresh">Refresh</button>
    <button id="logout" class="secondary">Log out</button>
  </div>

  <h2>Who is counted</h2>
  <div class="card" id="filter"></div>

  <h2>This week</h2>
  <div class="tiles" id="tiles"></div>

  <h2>Saved runs per day — last 30 days</h2>
  <div class="card">
    <div class="chart" id="runsChart"></div>
    <div class="hint" id="runsHint" style="margin-bottom:0"></div>
  </div>

  <h2>Plays per day</h2>
  <div class="card">
    <div class="chart" id="playsChart"></div>
    <div class="hint" id="playsHint" style="margin-bottom:0"></div>
  </div>

  <h2>Players</h2>
  <p class="hint">One row per set of initials. Last seen and active days come from saved runs in the last 90 days. Tap Mine on your own initials to leave them out of the numbers.</p>
  <div class="table-wrap"><table id="playersTable"><thead><tr>
    <th>Player</th><th>Status</th><th>Last seen</th><th class="num">Days (30d)</th>
    <th class="num">Runs 7d</th><th class="num">Runs all</th><th class="num">Games</th><th class="num">Devices</th>
  </tr></thead><tbody></tbody></table></div>

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

  <h2>App versions in use — last 7 days</h2>
  <div class="table-wrap"><table id="versionsTable"><thead><tr>
    <th>Version</th><th class="num">Devices</th>
  </tr></thead><tbody></tbody></table></div>

  <h2>Refused scores — last 7 days</h2>
  <p class="hint">A few rate_limited is normal. A pile of implausible_score or invalid_* means someone is poking the API.</p>
  <div class="table-wrap"><table id="rejectTable"><thead><tr>
    <th>Reason</th><th class="num">Count</th>
  </tr></thead><tbody></tbody></table></div>

  <h2>Capacity — free plan, today (resets 00:00 UTC)</h2>
  <div class="card" id="capacity"></div>

  <h2>Recent scores (50)</h2>
  <div class="table-wrap"><table id="scoresTable"><thead><tr>
    <th>When</th><th>Game</th><th>Initials</th><th class="num">Score</th><th>Board</th><th></th>
  </tr></thead><tbody></tbody></table></div>

  <h2>Recent feedback (30)</h2>
  <div class="table-wrap"><table id="feedbackTable"><thead><tr>
    <th>When</th><th>Initials</th><th>Version</th><th>Screen</th><th>Note</th>
  </tr></thead><tbody></tbody></table></div>
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
    return "<div class='tile'><div class='v'>" + esc(typeof value === "string" ? value : fmtNum(value)) + "</div><div class='l'>" + esc(label) +
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

  function renderTiles(d) {
    var days30 = dayList(d.today, 30);
    var byDay = {};
    (d.runsByDay || []).forEach(function (r) { byDay[r.day] = r; });
    var runs = days30.map(function (x) { return byDay[x] ? byDay[x].runs : 0; });
    var playersDaily = days30.map(function (x) { return byDay[x] ? byDay[x].players : 0; });
    var playsMap = {};
    (d.playsByDay || []).forEach(function (r) { playsMap[r.day] = r; });
    var since = d.trackingSince;
    var plays = days30.map(function (x) { return since && x >= since ? (playsMap[x] ? playsMap[x].plays : 0) : null; });

    var runDelta = weekDelta(runs);
    var weekAgo = d.generatedAt - 7 * DAY;
    var activePlayers = (d.players || []).filter(function (p) { return p.lastRun && p.lastRun >= weekAgo; }).length;
    var knownPlayers = (d.players || []).length;

    // Plays only have a "prior week" once tracking has run for two weeks.
    var trackedDays = since ? Math.round((Date.parse(d.today + "T00:00:00Z") - Date.parse(since + "T00:00:00Z")) / DAY) + 1 : 0;
    var t = d.totals || {}, r = d.retention || {};
    var installed = 0, browser = 0;
    (d.installSplit || []).forEach(function (row) { if (row.installed) installed = row.devices; else browser = row.devices; });
    var instTotal = installed + browser;

    document.getElementById("tiles").innerHTML =
      tile("Saved runs · 7 days", runDelta.cur, deltaHtml(runDelta), spark(runs.slice(-14), 120, 28, ACCENT)) +
      tile("Players active · 7 days", activePlayers, esc("of " + fmtNum(knownPlayers) + " known players"), spark(playersDaily.slice(-14), 120, 28, ACCENT)) +
      tile("Plays · 7 days", t.plays7d,
        trackedDays >= 14 ? deltaHtml(weekDelta(plays.map(function (v) { return v || 0; }))) : esc("tracking since " + (since ? shortDay(since) : "—")),
        trackedDays >= 3 ? spark(plays.slice(-Math.min(14, trackedDays)), 120, 28, GOOD) : "") +
      plainTile("Came back (30d)", r.returning30d,
        r.active30d ? Math.round((r.returning30d / r.active30d) * 100) + "% of " + fmtNum(r.active30d) + " played on 2+ days" : "played on 2+ days") +
      plainTile("Active devices today", t.devicesToday, fmtNum(t.devices7d) + " in last 7 days") +
      plainTile("Plays today", t.playsToday, fmtNum(t.runsToday) + " runs saved today") +
      plainTile("Players (initials)", t.playersAllTime, fmtNum(t.devicesAllTime) + " devices all-time") +
      plainTile("Home-screen app (7d)", instTotal ? Math.round((installed / instTotal) * 100) + "%" : "—",
        fmtNum(installed) + " installed · " + fmtNum(browser) + " in a browser");

    return { days30: days30, runs: runs, plays: plays, trackedDays: trackedDays, since: since };
  }

  function renderCharts(d, s) {
    lineChart("runsChart", s.days30, s.runs, ACCENT, "runs");
    var best = 0, bestDay = "";
    s.runs.forEach(function (v, i) { if (v > best) { best = v; bestDay = s.days30[i]; } });
    var rd = weekDelta(s.runs);
    document.getElementById("runsHint").textContent = best
      ? "Busiest day: " + fmtNum(best) + " runs on " + shortDay(bestDay) + ". Last 7 days: " + fmtNum(rd.cur) + " runs; the 7 before: " + fmtNum(rd.prev) + "."
      : "No saved runs in the last 30 days.";

    var span = Math.max(7, Math.min(30, s.trackedDays));
    lineChart("playsChart", s.days30.slice(-span), s.plays.slice(-span), GOOD, "plays");
    document.getElementById("playsHint").textContent = !s.since
      ? "No plays recorded yet. Play counts start with v0.12.6; phones pick it up the next time the app opens."
      : "Games started, counted since " + shortDay(s.since) + " (" + s.trackedDays + " day" + (s.trackedDays === 1 ? "" : "s") +
        "). Phones on older versions don't report plays, so early days run low.";
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

  function renderFeedback(rows) {
    tbody("feedbackTable", rows.map(function (r) {
      var version = "—", screen = "—";
      if (r.context) {
        try { var p = JSON.parse(r.context); version = p.v || "—"; screen = p.screen || "—"; }
        catch (e) { screen = r.context; }
      }
      return "<tr>" + td(fmtTime(r.createdAt)) + td(r.initials || "—") + td(version) + td(screen) +
        "<td class='msg'>" + esc(r.message) + "</td></tr>";
    }).join("") || emptyRow(5, "No feedback yet."));
  }

  function render(d) {
    lastData = d;
    renderFilter(d);
    var s = renderTiles(d);
    d._series = s;
    renderCharts(d, s);
    renderPlayers(d);
    renderGames(d);
    renderDaily(d.dailyBoards || []);
    renderSimple("versionsTable", d.versions || [], "version", "devices", "No plays recorded yet.");
    renderSimple("rejectTable", d.rejections || [], "reason", "n", "None — good.");
    renderCapacity(d.capacity || {});
    renderScores(d.recentScores || []);
    renderFeedback(d.feedback || []);
  }

  // ---- login and loading ----
  function showLogin(message) {
    loginEl.style.display = "block";
    dashboardEl.style.display = "none";
    loginError.hidden = !message;
    if (message) loginError.textContent = message;
  }
  function showDashboard() { loginEl.style.display = "none"; dashboardEl.style.display = "block"; }

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
