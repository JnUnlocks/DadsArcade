/**
 * The `/admin` dashboard: a single self-contained HTML response with its own
 * inline CSS and JS. Deliberately not part of the Vite-built SPA -- it has no
 * bundle, isn't in `dist/`, registers no service worker, and never appears in
 * any build manifest. It is served straight out of the Worker (see the
 * `/admin` branch in `worker/index.ts`), gated by nothing at the page level;
 * every request it makes to `/api/admin/*` carries the token typed into the
 * login form, and the server rejects those without a valid one.
 */

export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Dad's Arcade — Admin</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #0b0f1a;
    color: #e6e8ee;
    font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 16px;
    padding-bottom: 48px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #93a0b4; margin: 28px 0 8px; }
  p.hint { color: #93a0b4; font-size: 13px; margin: 4px 0 16px; }
  .card {
    background: #121826;
    border: 1px solid #232b40;
    border-radius: 10px;
    padding: 16px;
  }
  label { display: block; font-size: 13px; color: #93a0b4; margin-bottom: 6px; }
  input[type="password"], input[type="text"] {
    width: 100%;
    padding: 10px 12px;
    background: #0b0f1a;
    border: 1px solid #2c3550;
    border-radius: 8px;
    color: #e6e8ee;
    font-size: 16px;
  }
  button {
    margin-top: 12px;
    padding: 10px 16px;
    background: #1c6ef2;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  button.secondary { background: #232b40; }
  button:disabled { opacity: 0.5; cursor: default; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .error { color: #ff6b6b; font-size: 13px; margin-top: 10px; }
  .table-wrap { overflow-x: auto; border: 1px solid #232b40; border-radius: 10px; }
  table { border-collapse: collapse; width: 100%; min-width: 480px; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #1c2333; white-space: nowrap; }
  th { background: #141a2b; color: #93a0b4; font-weight: 600; position: sticky; top: 0; }
  tr:last-child td { border-bottom: none; }
  td.msg { white-space: normal; min-width: 220px; }
  .muted { color: #93a0b4; }
  #dashboard { display: none; }
  #status { color: #93a0b4; font-size: 12px; margin-left: auto; }
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

  <h2>Games — total scores, last 7 days, unique devices</h2>
  <div class="table-wrap"><table id="gamesTable"><thead><tr>
    <th>Game</th><th>All-time</th><th>Last 7 days</th><th>Unique devices</th>
  </tr></thead><tbody></tbody></table></div>

  <h2>Daily boards</h2>
  <div id="dailyEmpty" class="muted" style="display:none">No daily board scores yet.</div>
  <div class="table-wrap" id="dailyWrap"><table id="dailyTable"><thead><tr>
    <th>Board</th><th>Scores</th><th>Unique devices</th><th>Games</th><th>Last played</th>
  </tr></thead><tbody></tbody></table></div>

  <h2>Recent scores (50)</h2>
  <div class="table-wrap"><table id="scoresTable"><thead><tr>
    <th>When</th><th>Game</th><th>Initials</th><th>Score</th><th>Board</th>
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
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function fmtTime(ms) {
    if (!ms) return "—";
    var d = new Date(ms);
    return d.toLocaleString();
  }

  function td(text) {
    return "<td>" + esc(text) + "</td>";
  }

  function renderGames(rows) {
    var body = rows.map(function (r) {
      return "<tr>" +
        td(r.gameId) +
        td(r.totalScores) +
        td(r.weekScores) +
        td(r.uniqueDevices) +
        "</tr>";
    }).join("");
    document.querySelector("#gamesTable tbody").innerHTML =
      body || "<tr><td colspan=\\"4\\" class=\\"muted\\">No scores yet.</td></tr>";
  }

  function renderDaily(rows) {
    var empty = document.getElementById("dailyEmpty");
    var wrap = document.getElementById("dailyWrap");
    if (!rows.length) {
      empty.style.display = "block";
      wrap.style.display = "none";
      return;
    }
    empty.style.display = "none";
    wrap.style.display = "block";
    var body = rows.map(function (r) {
      return "<tr>" +
        td(r.boardId) +
        td(r.scores) +
        td(r.uniqueDevices) +
        td(r.games) +
        td(fmtTime(r.lastPlayed)) +
        "</tr>";
    }).join("");
    document.querySelector("#dailyTable tbody").innerHTML = body;
  }

  function renderScores(rows) {
    var body = rows.map(function (r) {
      return "<tr>" +
        td(fmtTime(r.createdAt)) +
        td(r.gameId) +
        td(r.initials) +
        td(r.score) +
        td(r.boardId) +
        "</tr>";
    }).join("");
    document.querySelector("#scoresTable tbody").innerHTML =
      body || "<tr><td colspan=\\"5\\" class=\\"muted\\">No scores yet.</td></tr>";
  }

  function renderFeedback(rows) {
    var body = rows.map(function (r) {
      var version = "—";
      var screen = "—";
      if (r.context) {
        try {
          var parsed = JSON.parse(r.context);
          version = parsed.v || "—";
          screen = parsed.screen || "—";
        } catch (e) {
          screen = r.context;
        }
      }
      return "<tr>" +
        td(fmtTime(r.createdAt)) +
        td(r.initials || "—") +
        td(version) +
        td(screen) +
        "<td class=\\"msg\\">" + esc(r.message) + "</td>" +
        "</tr>";
    }).join("");
    document.querySelector("#feedbackTable tbody").innerHTML =
      body || "<tr><td colspan=\\"5\\" class=\\"muted\\">No feedback yet.</td></tr>";
  }

  function showLogin(message) {
    loginEl.style.display = "block";
    dashboardEl.style.display = "none";
    if (message) {
      loginError.textContent = message;
      loginError.hidden = false;
    } else {
      loginError.hidden = true;
    }
  }

  function showDashboard() {
    loginEl.style.display = "none";
    dashboardEl.style.display = "block";
  }

  function load() {
    var token = localStorage.getItem(STORAGE_KEY);
    if (!token) {
      showLogin();
      return;
    }
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
      .then(function (data) {
        if (!data) return;
        showDashboard();
        renderGames(data.games || []);
        renderDaily(data.dailyBoards || []);
        renderScores(data.recentScores || []);
        renderFeedback(data.feedback || []);
        statusEl.textContent = "Updated " + new Date().toLocaleTimeString();
      })
      .catch(function () {
        statusEl.textContent = "Couldn't reach the server.";
      });
  }

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
