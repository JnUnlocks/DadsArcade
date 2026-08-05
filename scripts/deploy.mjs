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

const DB_NAME = "hyperdrive-arcade";
const CONFIG = "wrangler.jsonc";
const PLACEHOLDER = "REPLACE_WITH_DATABASE_ID";

const step = (n, msg) => console.log(`\n\x1b[36m[${n}/5]\x1b[0m ${msg}`);
const ok = (msg) => console.log(`      \x1b[32m✓\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
};

/** Run a command, streaming its output to the terminal. */
function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit", env: { ...process.env, CI: "1" } });
}

/** Run a command and capture stdout. */
function capture(cmd, args) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
}

// ---- 1. Confirm login -------------------------------------------------------

step(1, "Checking your Cloudflare login…");
try {
  const who = capture("npx", ["wrangler", "whoami"]);
  if (/not authenticated/i.test(who)) throw new Error("not authenticated");
  const email = who.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0];
  ok(email ? `Logged in as ${email}` : "Logged in");
} catch {
  fail("Not logged in. Run this first:\n\n    npx wrangler login\n");
}

// ---- 2. Find or create the database ----------------------------------------

step(2, `Looking for the "${DB_NAME}" database…`);

function findDatabaseId() {
  try {
    const raw = capture("npx", ["wrangler", "d1", "list", "--json"]);
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
  run("npx", ["wrangler", "d1", "create", DB_NAME]);
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
run("npx", [
  "wrangler",
  "d1",
  "execute",
  DB_NAME,
  "--remote",
  "--file=worker/schema.sql",
]);
ok("Schema applied");

// ---- 5. Build and ship ------------------------------------------------------

step(5, "Building and deploying…");
run("npm", ["run", "build"]);
run("npx", ["wrangler", "deploy"]);

console.log(`
\x1b[32m✓ Deployed.\x1b[0m

Open the URL above on your phone, then Share → Add to Home Screen.
Send the same URL to your dad and he does the same.

Read his feedback any time with:  npm run feedback
`);
