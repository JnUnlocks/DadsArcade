/**
 * Putting the arcade on the home screen.
 *
 * Android Chrome offers its own install dialog through `beforeinstallprompt`,
 * but only to a page that catches the event and keeps it; it fires once, early,
 * so this module listens from the moment it is imported. iPhones have no such
 * event: Add to Home Screen lives in Safari's Share menu, and all the arcade
 * can do is say where.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Without this Chrome shows its own mini bar at a moment of its choosing.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
  });
}

/** True when Android has offered an install dialog this visit. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** Show Android's install dialog. Resolves true if the player said yes. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null; // each event can only be shown once
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

/** Running from the home screen rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** An iPhone or iPad. iPadOS reports itself as a Mac, so touch gives it away. */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
