/**
 * "What's new" -- the release notes screen.
 *
 * DOM rather than canvas for the same reasons as the leaderboard and settings:
 * it scrolls, it grows with the large-text setting, and a screen reader can
 * read it. The content lives in src/releases.ts.
 */

import { RELEASES, unseenReleases, type Release } from "../releases";

export function buildReleaseNotesScreen(
  lastSeen: string | null,
  onBack: () => void,
): HTMLElement {
  const screen = document.createElement("div");
  screen.className = "screen screen--releases";

  // BACK sits at the top and stays there. It used to be under the last
  // release, so leaving meant scrolling past every note the arcade has ever
  // had -- forty of them by v0.27.0.
  const bar = document.createElement("div");
  bar.className = "screen-bar";
  const back = document.createElement("button");
  back.className = "btn btn--ghost screen-back";
  back.textContent = "‹ BACK";
  back.addEventListener("click", onBack);
  const title = document.createElement("h2");
  title.textContent = "WHAT'S NEW";
  bar.append(back, title);
  screen.append(bar);

  // Worked out before the caller marks everything seen, so the badges on this
  // visit still show what's actually new to this player.
  const fresh = new Set(unseenReleases(lastSeen).map((r) => r.version));

  // What's new to this player is shown in full; everything before it folds
  // away under EARLIER UPDATES. Someone who has seen it all still gets the
  // latest release open, so the screen is never just a closed drawer.
  const shown = RELEASES.filter(
    (r, i) => fresh.has(r.version) || r.version === __APP_VERSION__ || i === 0,
  );
  const earlier = RELEASES.filter((r) => !shown.includes(r));

  const scroller = document.createElement("div");
  scroller.className = "releases-scroll";

  const list = document.createElement("div");
  list.className = "release-list";
  for (const release of shown) list.append(buildRelease(release, fresh));
  scroller.append(list);

  if (earlier.length > 0) {
    const older = document.createElement("details");
    older.className = "release-older";
    const summary = document.createElement("summary");
    summary.textContent = `EARLIER UPDATES (${earlier.length})`;
    older.append(summary);
    const olderList = document.createElement("div");
    olderList.className = "release-list";
    for (const release of earlier) olderList.append(buildRelease(release, fresh));
    older.append(olderList);
    scroller.append(older);
  }

  screen.append(scroller);
  return screen;
}

function buildRelease(release: Release, fresh: ReadonlySet<string>): HTMLElement {
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
  return item;
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
