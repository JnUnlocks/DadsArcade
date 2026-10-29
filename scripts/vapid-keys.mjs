/**
 * Make the key pair daily reminders are signed with (worker/push.ts).
 *
 *   node scripts/vapid-keys.mjs
 *
 * Prints both keys and the two commands that store them as Worker secrets.
 * Run it once. A new pair stops every existing reminder (their browsers
 * subscribed with the old public key), so only rotate if the private key
 * has leaked. The private key never goes in the repo.
 */

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log(`VAPID_PUBLIC_KEY  ${publicKey}`);
console.log(`VAPID_PRIVATE_KEY ${d}`);
console.log("\nStore them (each command asks for the value; paste it):");
console.log("  npx wrangler secret put VAPID_PUBLIC_KEY");
console.log("  npx wrangler secret put VAPID_PRIVATE_KEY");
