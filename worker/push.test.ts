import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  b64urlToBytes,
  bytesToB64url,
  dueForReminder,
  isPushEndpoint,
  isTimeZone,
  localTime,
  vapidAuthorization,
} from "./push.ts";

// 19:00 in New York on 29 Oct 2026 (EDT, UTC-4) is 23:00 UTC.
const SEVEN_PM_NY = Date.parse("2026-10-29T23:00:00Z");

describe("localTime", () => {
  it("reads the day and hour in the player's zone", () => {
    assert.deepEqual(localTime("America/New_York", SEVEN_PM_NY), { day: "2026-10-29", hour: 19 });
    assert.deepEqual(localTime("Europe/London", SEVEN_PM_NY), { day: "2026-10-29", hour: 23 });
  });
});

describe("dueForReminder", () => {
  const row = { hour: 19, tz: "America/New_York", lastSentDay: null, lastPlayAt: null };

  it("fires at the chosen local hour", () => {
    assert.equal(dueForReminder(row, SEVEN_PM_NY), true);
    assert.equal(dueForReminder(row, SEVEN_PM_NY - 3600_000), false);
  });

  it("fires once a day", () => {
    assert.equal(dueForReminder({ ...row, lastSentDay: "2026-10-29" }, SEVEN_PM_NY), false);
    assert.equal(dueForReminder({ ...row, lastSentDay: "2026-10-28" }, SEVEN_PM_NY), true);
  });

  it("stays quiet when they've already played today, their time", () => {
    // 09:00 New York the same day.
    assert.equal(dueForReminder({ ...row, lastPlayAt: Date.parse("2026-10-29T13:00:00Z") }, SEVEN_PM_NY), false);
    // 23:30 New York the day before is 03:30 UTC on the 29th: still yesterday for them.
    assert.equal(dueForReminder({ ...row, lastPlayAt: Date.parse("2026-10-29T03:30:00Z") }, SEVEN_PM_NY), true);
  });

  it("never throws on a bad zone", () => {
    assert.equal(dueForReminder({ ...row, tz: "Not/AZone" }, SEVEN_PM_NY), false);
  });
});

describe("validation", () => {
  it("accepts the real push services only", () => {
    assert.equal(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
    assert.equal(isPushEndpoint("https://web.push.apple.com/QGx"), true);
    assert.equal(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
    assert.equal(isPushEndpoint("https://evil.example.com/push.apple.com"), false);
    assert.equal(isPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false);
    assert.equal(isPushEndpoint(42), false);
  });

  it("knows a time zone", () => {
    assert.equal(isTimeZone("America/Chicago"), true);
    assert.equal(isTimeZone("Mars/Olympus"), false);
  });
});

describe("vapidAuthorization", () => {
  it("signs a token the public key verifies", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKey = bytesToB64url(raw);

    const header = await vapidAuthorization(
      "https://fcm.googleapis.com/fcm/send/abc",
      publicKey,
      jwk.d!,
      "https://play.hyperdrive-arcade.workers.dev",
      SEVEN_PM_NY,
    );
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    assert.ok(match);
    const [, head, body, sig, k] = match;
    assert.equal(k, publicKey);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlToBytes(body!))), {
      aud: "https://fcm.googleapis.com",
      exp: SEVEN_PM_NY / 1000 + 12 * 3600,
      sub: "https://play.hyperdrive-arcade.workers.dev",
    });
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      b64urlToBytes(sig!),
      new TextEncoder().encode(`${head}.${body}`),
    );
    assert.equal(ok, true);
  });
});
