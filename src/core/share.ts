/**
 * Sending a result out of the arcade -- to a family group chat, mostly.
 *
 * Every other reason to come back (the TODAY badge, a streak) only works on
 * someone who has already opened the app. A result dropped into the chat is
 * the one thing that reaches the people who haven't, which is why it's worth
 * a shared helper rather than a one-off in Plasma Sort.
 *
 * The phone's own share sheet comes first: on a phone that's Messages,
 * WhatsApp and the rest in one tap. Where there isn't one (most desktops) the
 * text goes on the clipboard instead, and the caller says "now paste it".
 */

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/** Must be called from inside a tap handler: browsers refuse share() otherwise. */
export async function shareText(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === "function") {
    try {
      // Text only, with the link inside it. Passing `url` separately makes
      // some targets drop the text and send a bare link.
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      // Closing the sheet is a choice, not a failure: say nothing.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // Anything else (no gesture, a blocked target) falls through to copying.
    }
  }
  return (await copyText(text)) ? "copied" : "failed";
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refused -- try the old way.
  }
  // execCommand is deprecated but is still the only copy that works on a
  // plain-http dev server, which is where a phone on the Wi-Fi tests this.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/**
 * A link that opens the arcade straight into one game. The shell reads
 * `?play=` on boot (Shell.boot), so a tap on a shared result lands on the
 * puzzle rather than on the menu.
 */
export function playLink(gameId: string, origin = location.origin): string {
  return `${origin}/?play=${encodeURIComponent(gameId)}`;
}
