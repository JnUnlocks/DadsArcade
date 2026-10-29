/**
 * Daily reminders, sent as Web Push.
 *
 * A player who turns reminders on (the streak screen) gets one notification a
 * day at the hour they chose, in their own time zone, on days they haven't
 * started a game by then. The push carries no message at all: the service
 * worker writes the words when it arrives (public/sw.js). An empty push needs
 * no payload encryption, only the VAPID signature below, which keeps this to
 * WebCrypto and nothing else.
 *
 * Off until the two VAPID secrets are set (scripts/vapid-keys.mjs prints a
 * pair and the commands to set them). Until then the key endpoint answers 404
 * and the arcade doesn't offer reminders at all.
 */

/** Where a push may be sent. Anything else is refused, so the Worker can't be
 *  pointed at arbitrary URLs. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * The Authorization header for one push (RFC 8292). `publicKey` is the
 * uncompressed P-256 point the browser subscribed with, `privateKey` its `d`,
 * both base64url.
 */
export async function vapidAuthorization(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string,
  now = Date.now(),
): Promise<string> {
  const encode = (value: object) => bytesToB64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned =
    encode({ typ: "JWT", alg: "ES256" }) +
    "." +
    encode({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject });

  const point = b64urlToBytes(publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToB64url(point.slice(1, 33)),
      y: bytesToB64url(point.slice(33, 65)),
      d: privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto's ECDSA signature is r||s, which is exactly what a JWT wants.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `vapid t=${unsigned}.${bytesToB64url(signature)}, k=${publicKey}`;
}

/** The calendar day and hour at `at` in a time zone. */
export function localTime(timeZone: string, at: number): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export interface ReminderRow {
  hour: number;
  tz: string;
  lastSentDay: string | null;
  lastPlayAt: number | null;
}

/**
 * Whether a reminder goes out on this hourly run: it is the chosen hour where
 * the player lives, none has gone today, and they haven't started a game today.
 */
export function dueForReminder(row: ReminderRow, now: number): boolean {
  try {
    const here = localTime(row.tz, now);
    if (here.hour !== row.hour || row.lastSentDay === here.day) return false;
    if (row.lastPlayAt !== null && localTime(row.tz, row.lastPlayAt).day === here.day) return false;
    return true;
  } catch {
    return false;
  }
}
