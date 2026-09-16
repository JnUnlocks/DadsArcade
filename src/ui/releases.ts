/**
 * "What's new" -- the release notes screen.
 *
 * DOM rather than canvas for the same reasons as the leaderboard and settings:
 * it scrolls, it grows with the large-text setting, and a screen reader can
 * read it. The content lives in src/releases.ts.
 */

import { RELEASES, unseenReleases } from "../releases";

export function buildReleaseNotesScreen(
  lastSeen: string | null,
  onBack: () => void,
): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen screen--releases";

  const title = document.createElement("h2");
  title.textContent = "WHAT'S NEW";
  screen.append(title);

  // Worked out before the caller marks everything seen, so the badges on this
  // visit still show what's actually new to this player.
  const fresh = new Set(unseenReleases(lastSeen).map((r) => r.version));

  const list = document.createElement("div");
  list.className = "release-list";

  for (const release of RELEASES) {
    const item = document.createElement("section");
    item.className = "release";

    const head = document.createElement("div");
    head.className = "release-head";

    const version = document.createElement("span");
    version.className = "release-version";
    version.textContent = `v${release.version}`;
    head.append(version);

    if (release.version === __APP_VERSION__) {
      head.append(tag("THIS VERSION", "release-tag release-tag--current"));
    } else if (fresh.has(release.version)) {
      head.append(tag("NEW", "release-tag"));
    }

    const date = document.createElement("span");
    date.className = "release-date";
    date.textContent = formatDate(release.date);
    head.append(date);

    const name = document.createElement("h3");
    name.className = "release-title";
    name.textContent = release.title;

    const notes = document.createElement("ul");
    notes.className = "release-notes";
    for (const note of release.notes) {
      const li = document.createElement("li");
      li.textContent = note;
      notes.append(li);
    }

    item.append(head, name, notes);
    list.append(item);
  }

  screen.append(list);

  const back = document.createElement("button");
  back.className = "btn btn--ghost";
  back.textContent = "BACK";
  back.addEventListener("click", onBack);
  screen.append(back);

  return screen;
}

function tag(text: string, className: string): HTMLElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

/** "2026-09-16" -> "16 Sep 2026", without trusting the device's locale or timezone. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}
