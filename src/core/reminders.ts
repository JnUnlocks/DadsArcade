/**
 * Daily reminders on this phone: asking for permission, subscribing to push,
 * and telling the server when to send (worker/push.ts has the other half).
 *
 * Strictly opt-in: nothing here runs until the player taps the switch on the
 * streak screen, and the browser's own permission question only appears then.
 */

import { loadVisitorId } from "./storage";
import { isIos, isStandalone } from "./install";

/** The hour reminders arrive, the player's local time. */
export const REMINDER_HOUR = 19;

const KEY_REMINDERS = "hyperdrive.reminders";

export type ReminderState =
  /** This browser can't receive web push, or the server has no keys yet. */
  | "unavailable"
  /** An iPhone in Safari: push only works once the arcade is on the home screen. */
  | "needs-home-screen"
  /** The player said no to notifications; only the phone's settings can undo it. */
  | "blocked"
  | "off"
  | "on";

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function serverKey(): Promise<string | null> {
  try {
    const response = await fetch("/api/reminders/key");
    if (!response.ok) return null;
    const { key } = (await response.json()) as { key?: string };
    return typeof key === "string" ? key : null;
  } catch {
    return null;
  }
}

/** The service worker, if one is running. Never waits: in dev there is none. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

export async function reminderState(): Promise<ReminderState> {
  if (isIos() && !isStandalone()) return "needs-home-screen";
  if (!pushSupported() || !(await registration()) || !(await serverKey())) return "unavailable";
  if (Notification.permission === "denied") return "blocked";
  const subscription = await (await registration())?.pushManager.getSubscription();
  return subscription && localStorage.getItem(KEY_REMINDERS) === "on" ? "on" : "off";
}

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Ask, subscribe, and register with the server. Resolves to the new state. */
export async function turnRemindersOn(): Promise<ReminderState> {
  const key = await serverKey();
  const reg = await registration();
  if (!key || !reg) return "unavailable";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";

  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  const response = await fetch("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: loadVisitorId(),
      subscription: subscription.toJSON(),
      hour: REMINDER_HOUR,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!response.ok) return "off";
  try {
    localStorage.setItem(KEY_REMINDERS, "on");
  } catch {
    // The reminder still works; the switch just won't remember it's on.
  }
  return "on";
}

export async function turnRemindersOff(): Promise<ReminderState> {
  try {
    localStorage.removeItem(KEY_REMINDERS);
  } catch {
    // Nothing to do.
  }
  const subscription = await (await registration())?.pushManager.getSubscription();
  await subscription?.unsubscribe().catch(() => undefined);
  await fetch(`/api/reminders?device=${encodeURIComponent(loadVisitorId())}`, { method: "DELETE" }).catch(
    () => undefined,
  );
  return "off";
}
