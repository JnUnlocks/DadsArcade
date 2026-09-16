/**
 * The release history has to stay honest on its own.
 *
 * The version shown in Settings and stamped into every feedback note sat at
 * 0.1.0 through eight releases, because bumping it was a thing someone had to
 * remember. These tests make forgetting a build failure instead.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  compareVersions,
  LATEST_RELEASE,
  RELEASES,
  unseenReleases,
} from "./releases.ts";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

describe("release history", () => {
  it("matches the version in package.json", () => {
    // The app reads its version from package.json. If this fails, a release
    // note was added without bumping the version, or the other way round.
    assert.equal(
      pkg.version,
      LATEST_RELEASE.version,
      `package.json says ${pkg.version} but the newest release note is ${LATEST_RELEASE.version}`,
    );
  });

  it("is newest first, with no repeats", () => {
    for (let i = 1; i < RELEASES.length; i += 1) {
      assert.ok(
        compareVersions(RELEASES[i - 1]!.version, RELEASES[i]!.version) > 0,
        `${RELEASES[i - 1]!.version} should be newer than ${RELEASES[i]!.version}`,
      );
    }
  });

  it("uses real, well-formed versions and dates that don't go backwards", () => {
    for (const r of RELEASES) {
      assert.match(r.version, /^\d+\.\d+\.\d+$/, `bad version "${r.version}"`);
      assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `bad date "${r.date}"`);
      assert.ok(!Number.isNaN(Date.parse(r.date)), `impossible date "${r.date}"`);
    }
    for (let i = 1; i < RELEASES.length; i += 1) {
      assert.ok(
        RELEASES[i - 1]!.date >= RELEASES[i]!.date,
        `${RELEASES[i - 1]!.version} is dated before ${RELEASES[i]!.version}`,
      );
    }
  });

  it("gives every release a title and at least one note", () => {
    for (const r of RELEASES) {
      assert.ok(r.title.trim().length > 0, `${r.version} has no title`);
      assert.ok(r.notes.length > 0, `${r.version} has no notes`);
      for (const note of r.notes) assert.ok(note.trim().length > 0, `${r.version} has an empty note`);
    }
  });
});

describe("what's new", () => {
  it("compares versions numerically, not as text", () => {
    // As strings, "0.10.0" sorts before "0.9.0". The next release after this
    // one is exactly where that would bite.
    assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
    assert.ok(compareVersions("1.0.0", "0.99.99") > 0);
    assert.equal(compareVersions("0.9.0", "0.9.0"), 0);
  });

  it("flags everything for someone who has never looked", () => {
    assert.equal(unseenReleases(null).length, RELEASES.length);
  });

  it("flags nothing once the latest has been seen", () => {
    assert.equal(unseenReleases(LATEST_RELEASE.version).length, 0);
  });

  it("flags only what's newer than the last one seen", () => {
    const older = RELEASES[2]!.version;
    assert.deepEqual(
      unseenReleases(older).map((r) => r.version),
      [RELEASES[0]!.version, RELEASES[1]!.version],
    );
  });
});
