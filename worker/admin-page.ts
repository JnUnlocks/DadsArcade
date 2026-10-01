/**
 * The `/admin` dashboard: a single self-contained HTML response with its own
 * inline CSS and JS. Deliberately not part of the Vite-built SPA -- it has no
 * bundle, isn't in `dist/`, registers no service worker, and never appears in
 * any build manifest. It is served straight out of the Worker (see the
 * `/admin` branch in `worker/index.ts`), gated by nothing at the page level;
 * every request it makes to `/api/admin/*` carries the token typed into the
 * login form, and the server rejects those without a valid one.
 *
 * Layout is phone-first: capacity at the top (the thing that can break),
 * then headline numbers, then per-game detail, then the raw lists.
 *
 * NOTE: this whole page is one template literal. Inside it, avoid backticks
 * and dollar-brace, and write the inline JS with plain string concatenation.
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
    --ok: #3ecf8e; --warn: #f5b942; --bad: #ff6b6b; --accent: #1c6ef2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 16px; padding-bottom: 48px; max-width: 900px; margin: 0 auto;
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
    margin-top: 12px; padding: 10px 16px; background: var(--accent); color: #fff; border: none;
    border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  button.secondary { background: var(--line); }
  button.small { margin: 0; padding: 4px 10px; font-size: 12px; background: var(--line); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .error { color: var(--bad); font-size: 13px; margin-top: 10px; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #1c2333; white-space: nowrap; }
  th { background: #141a2b; color: var(--dim); font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:last-child td { border-bottom: none; }
  td.msg { white-space: normal; min-width: 200px; }
  .muted { color: var(--dim); }
  #dashboard { display: none; }
  #status { color: var(--dim); font-size: 12px; margin-left: auto; }

  .tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  @media (min-width: 640px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
  .tile { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
  .tile .v { font-size: 24px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .tile .l { font-size: 12px; color: var(--dim); }
  .tile .s { font-size: 12px; color: var(--dim); margin-top: 2px; }

  .meter { margin: 10px 0 14px; }
  .meter .top { display: flex; justify-content: space-between; font-size: 13px; }
  .meter .bar { height: 10px; background: #1c2333; border-radius: 6px; overflow: hidden; margin-top: 6px; }
  .meter .fill { height: 100%; border-radius: 6px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .pill.ok { background: rgba(62,207,142,.15); color: var(--ok); }
  .pill.warn { background: rgba(245,185,66,.15); color: var(--warn); }
  .pill.bad { background: rgba(255,107,107,.15); color: var(--bad); }

  .bars { display: flex; align-items: flex-end; gap: 3px; height: 80px; padding: 8px 0 0; }
  .bars div { flex: 1; background: var(--accent); border-radius: 3px 3px 0 0; min-height: 2px; opacity: .85; }
  .bars-axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); margin-top: 4px; }
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

  <h2>Capacity — free plan, today (resets 00:00 UTC)</h2>
  <div class="card" id="capacity"></div>

  <h2>Players</h2>
  <div class="tiles" id="tiles"></div>

  <h2>Plays per day — last 30 days</h2>
  <div class="card">
    <div class="bars" id="playsBars"></div>
    <div class="bars-axis"><span id="barsFrom"></span><span id="barsTo"></span></div>
    <div class="hint" id="playsHint" style="margin-bottom:0"></div>
  </div>

  <h2>Games</h2>
  <p class="hint">Plays = games started. Runs = scores saved. Finish = runs ÷ plays, last 7 days. Players = distinct initials; devices is usually higher because Safari and the home-screen app count separately.</p>
  <div class="table-wrap"><table id="gamesTable"><thead><tr>
    <th>Game</th><th class="num">Plays 7d</th><th class="num">Today</th><th class="num">Devices 7d</th>
    <th class="num">Runs 7d</th><th class="num">Finish</th><th class="num">Runs all</th>
    <th class="num">Players</th><th class="num">Devices all</th>
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

  <h2>Daily boards</h2>
  <div id="dailyEmpty" class="muted" style="display:none">No daily board scores yet.</div>
  <div class="table-wrap" id="dailyWrap"><table id="dailyTable"><thead><tr>
    <th>Board</th><th class="num">Runs</th><th class="num">Devices</th><th class="num">Games</th><th>Last played</th>
  </tr></thead><tbody></tbody></table></div>

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
  var loginEl = document.getElementById("login");
  var dashboardEl = document.getElementById("dashboard");
  var tokenInput = document.getElementById("token");
  var loginError = document.getElementById("loginError");
  var statusEl = document.getElementById("status");

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmtTime(ms) { return ms ? new Date(ms).toLocaleString() : "—"; }
  function fmtNum(n) { return n == null ? "—" : Number(n).toLocaleString(); }
  function td(text) { return "<td>" + esc(text) + "</td>"; }
  function tdn(n) { return "<td class='num'>" + esc(fmtNum(n)) + "</td>"; }
  function emptyRow(cols, text) { return "<tr><td colspan='" + cols + "' class='muted'>" + esc(text) + "</td></tr>"; }
  function tbody(id, html) { document.querySelector("#" + id + " tbody").innerHTML = html; }

  function level(pct) { return pct >= 80 ? "bad" : pct >= 50 ? "warn" : "ok"; }
  var COLORS = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)" };

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
    var u = cap.usage || {};
    var L = cap.limits || {};
    var t = cap.tables || {};
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
      tile("Runs stored", t.scoresRows, "history table") +
      tile("Leaderboard rows", t.bestRows, "one per device per board") +
      tile("Biggest board", t.largestBoard, "devices on one game") +
      tile("Play-day rows", t.playDayRows, "one per device per game per day") +
      "</div>";
    el.innerHTML = html;
  }

  function tile(label, value, sub) {
    return "<div class='tile'><div class='v'>" + esc(typeof value === "string" ? value : fmtNum(value)) + "</div><div class='l'>" + esc(label) +
      "</div>" + (sub ? "<div class='s'>" + esc(sub) + "</div>" : "") + "</div>";
  }

  function renderTiles(d) {
    var t = d.totals || {};
    var r = d.retention || {};
    var installed = 0, browser = 0;
    (d.installSplit || []).forEach(function (row) {
      if (row.installed) installed = row.devices; else browser = row.devices;
    });
    var instTotal = installed + browser;
    document.getElementById("tiles").innerHTML =
      tile("Players (initials)", t.playersAllTime, fmtNum(t.devicesAllTime) + " devices all-time") +
      tile("Active devices today", t.devicesToday, fmtNum(t.devices7d) + " in last 7 days") +
      tile("Plays today", t.playsToday, fmtNum(t.plays7d) + " in last 7 days · " + fmtNum(t.runsToday) + " runs saved today") +
      tile("Came back (30d)", r.returning30d,
        r.active30d ? Math.round((r.returning30d / r.active30d) * 100) + "% of " + fmtNum(r.active30d) + " played on 2+ days" : "played on 2+ days") +
      tile("Home-screen app (7d)", instTotal ? Math.round((installed / instTotal) * 100) + "%" : "—",
        fmtNum(installed) + " installed · " + fmtNum(browser) + " in a browser");
  }

  function renderPlaysByDay(rows, today) {
    var byDay = {};
    rows.forEach(function (r) { byDay[r.day] = r.plays; });
    var days = [];
    var end = Date.parse(today + "T00:00:00Z");
    for (var i = 29; i >= 0; i--) days.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
    var max = 1;
    days.forEach(function (d) { max = Math.max(max, byDay[d] || 0); });
    document.getElementById("playsBars").innerHTML = days.map(function (d) {
      var n = byDay[d] || 0;
      return "<div title='" + d + ": " + n + " plays' style='height:" + (n / max) * 100 + "%'></div>";
    }).join("");
    document.getElementById("barsFrom").textContent = days[0].slice(5);
    document.getElementById("barsTo").textContent = "today";
    document.getElementById("playsHint").textContent = rows.length
      ? "Busiest day: " + fmtNum(max) + " plays."
      : "No plays recorded yet. Play counts start with v0.12.5; phones pick it up the next time the app opens.";
  }

  function renderGames(rows) {
    tbody("gamesTable", rows.map(function (r) {
      var finish = r.plays7d ? Math.round((r.runs7d / r.plays7d) * 100) + "%" : "—";
      return "<tr>" + td(r.gameId) + tdn(r.plays7d) + tdn(r.playsToday) + tdn(r.activeDevices7d) +
        tdn(r.runs7d) + "<td class='num'>" + finish + "</td>" + tdn(r.runsAllTime) +
        tdn(r.playersAllTime) + tdn(r.devicesAllTime) + "</tr>";
    }).join("") || emptyRow(9, "Nothing yet."));
  }

  function renderSimple(id, rows, a, b, emptyText) {
    tbody(id, rows.map(function (r) { return "<tr>" + td(r[a]) + tdn(r[b]) + "</tr>"; }).join("") ||
      emptyRow(2, emptyText));
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
      return "<tr>" + td(fmtTime(r.createdAt)) + td(r.gameId) + td(r.initials) + tdn(r.score) + td(r.boardId) +
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

  function showLogin(message) {
    loginEl.style.display = "block";
    dashboardEl.style.display = "none";
    loginError.hidden = !message;
    if (message) loginError.textContent = message;
  }
  function showDashboard() { loginEl.style.display = "none"; dashboardEl.style.display = "block"; }

  function load() {
    var token = localStorage.getItem(STORAGE_KEY);
    if (!token) { showLogin(); return; }
    statusEl.textContent = "Loading…";
    fetch("/api/admin/overview", { headers: { "X-Admin-Token": token } })
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
        renderCapacity(d.capacity || {});
        renderTiles(d);
        renderPlaysByDay(d.playsByDay || [], d.today);
        renderGames(d.games || []);
        renderSimple("versionsTable", d.versions || [], "version", "devices", "No plays recorded yet.");
        renderSimple("rejectTable", d.rejections || [], "reason", "n", "None — good.");
        renderDaily(d.dailyBoards || []);
        renderScores(d.recentScores || []);
        renderFeedback(d.feedback || []);
        statusEl.textContent = "Updated " + new Date().toLocaleTimeString();
      })
      .catch(function () { statusEl.textContent = "Couldn't reach the server."; });
  }

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
    fetch("/api/scores/" + encodeURIComponent(btn.dataset.del), {
      method: "DELETE",
      headers: { "X-Admin-Token": localStorage.getItem(STORAGE_KEY) || "" },
    }).then(function (r) {
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

  load();
})();
</script>
</body>
</html>
`;
