#!/usr/bin/env node
/**
 * One-shot deploy.
 *
 * Assumes you've already run `npx wrangler login` (that step opens a browser
 * and can't be automated). From there this:
 *   1. finds or creates the D1 database,
 *   2. writes its id into wrangler.jsonc for you,
 *   3. applies the schema,
 *   4. builds and deploys.
 *
 * Safe to re-run. Every step checks for existing state first, so a second run
 * is an update rather than a duplicate.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DB_NAME = "hyperdrive-arcade";
const CONFIG = "wrangler.jsonc";
const PLACEHOLDER = "REPLACE_WITH_DATABASE_ID";

/**
 * Everything is launched as `node <some .js>` rather than through `npx`/`npm`.
 *
 * On Windows those are `npx.cmd`/`npm.cmd`, and execFileSync can't run them:
 * without a shell it throws ENOENT, and naming the `.cmd` explicitly throws
 * EINVAL because Node now refuses to spawn batch files unshelled (the fix for
 * CVE-2024-27980). Passing `shell: true` would work but concatenates arguments
 * unescaped, which Node also warns about.
 *
 * Resolving the package's own JS entrypoint sidesteps all of it, needs no
 * shell, and behaves identically on macOS and Windows. This script previously
 * died at step 1 on Windows and blamed it on not being logged in.
 */
const WRANGLER = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);

const step = (n, msg) => console.log(`\n\x1b[36m[${n}/5]\x1b[0m ${msg}`);
const ok = (msg) => console.log(`      \x1b[32m✓\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
};

/** Run `node <script> ...`, streaming output to the terminal. */
function run(script, args) {
  execFileSync(process.execPath, [script, ...args], {
    stdio: "inherit",
    env: { ...process.env, CI: "1" },
  });
}

/** Run `node <script> ...` and capture stdout. */
function capture(script, args) {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
}

/**
 * Run one of this project's own npm scripts.
 *
 * `npm_execpath` is set by npm for any script it launches and points at
 * npm-cli.js, so this stays a plain `node` invocation. If the file is somehow
 * run outside npm there's nothing sensible to fall back to, so say so plainly
 * rather than failing later with a confusing error.
 */
function npmScript(name) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli || !npmCli.endsWith(".js")) {
    fail(
      `Couldn't locate npm to run "${name}".\n` +
        `Run this through npm:\n\n    npm run deploy\n`,
    );
  }
  run(npmCli, ["run", name]);
}

// ---- 1. Confirm login -------------------------------------------------------

step(1, "Checking your Cloudflare login…");
let who;
try {
  who = capture(WRANGLER, ["whoami"]);
} catch (error) {
  // Distinguish "wrangler wouldn't start" from "wrangler says you're logged
  // out". Reporting a spawn failure as a login problem sends you off to run
  // `wrangler login` over and over while the real fault is somewhere else.
  fail(
    `Couldn't run wrangler.\n\n${error.message}\n\n` +
      `Are dependencies installed? Try: npm install`,
  );
}
if (/not authenticated/i.test(who)) {
  fail("Not logged in. Run this first:\n\n    npx wrangler login\n");
}
const email = who.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
ok(email ? `Logged in as ${email}` : "Logged in");

// ---- 2. Find or create the database ----------------------------------------

step(2, `Looking for the "${DB_NAME}" database…`);

function findDatabaseId() {
  try {
    const raw = capture(WRANGLER, ["d1", "list", "--json"]);
    // Wrangler prints a banner before the JSON; take from the first bracket.
    const json = raw.slice(raw.indexOf("["));
    const list = JSON.parse(json);
    return list.find((d) => d.name === DB_NAME)?.uuid ?? null;
  } catch {
    return null;
  }
}

let databaseId = findDatabaseId();

if (databaseId) {
  ok(`Found existing database (${databaseId})`);
} else {
  ok("Not found — creating it");
  run(WRANGLER, ["d1", "create", DB_NAME]);
  databaseId = findDatabaseId();
  if (!databaseId) {
    fail(
      `Created the database but couldn't read its id back.\n` +
        `Run "npx wrangler d1 list", copy the uuid for "${DB_NAME}",\n` +
        `and paste it into ${CONFIG} in place of ${PLACEHOLDER}.`,
    );
  }
  ok(`Created (${databaseId})`);
}

// ---- 3. Write the id into wrangler.jsonc ------------------------------------

step(3, `Wiring the database id into ${CONFIG}…`);
const config = readFileSync(CONFIG, "utf8");

if (config.includes(`"${databaseId}"`)) {
  ok("Already wired up");
} else if (config.includes(PLACEHOLDER)) {
  // String replace rather than JSON round-trip, to preserve the comments.
  writeFileSync(CONFIG, config.replace(PLACEHOLDER, databaseId));
  ok("Written");
} else {
  fail(
    `${CONFIG} has a database_id that doesn't match "${DB_NAME}" (${databaseId}).\n` +
      `Check it by hand before deploying.`,
  );
}

// ---- 4. Schema --------------------------------------------------------------

step(4, "Creating the tables (scores + feedback)…");
run(WRANGLER, ["d1", "execute", DB_NAME, "--remote", "--file=worker/schema.sql"]);
ok("Schema applied");

// ---- 5. Build and ship ------------------------------------------------------

step(5, "Building and deploying…");
npmScript("build");
run(WRANGLER, ["deploy"]);

console.log(`
\x1b[32m✓ Deployed.\x1b[0m

Open the URL above on your phone, then Share → Add to Home Screen.
Send the same URL to your dad and he does the same.

Read his feedback any time with:  npm run feedback
`);
