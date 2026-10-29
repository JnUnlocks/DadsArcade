/**
 * Helping a newcomer find a second game, and keep the arcade.
 *
 * The Facebook post of 27 Oct 2026 brought 38 new phones in one evening, and
 * 31 of them started one game once and never another. So for a phone's first
 * week, until it has tried three cabinets, the arcade suggests what to try
 * next, and offers to put itself on the home screen.
 *
 * Phones that had the arcade before this arrived never see any of it: Justin
 * didn't want regulars nagged. They are told apart by the first-seen mark
 * (see initFirstSeen in storage.ts), which says "existing" for them.
 *
 * Pure rules only, so they can be tested without a DOM. The screens that show
 * them are in ui/welcome.ts.
 */

/** How long a phone counts as new, in local days from its first visit. */
export const NEWCOMER_DAYS = 7;

/** Tried this many different cabinets, and it has found its way around. */
export const NEWCOMER_GAMES = 3;

/** The first-seen mark of a phone that had the arcade before this existed. */
export const EXISTING = "existing";

/**
 * Never suggested to a newcomer. Word Finder is a helper for the crossword,
 * not a game, and Pass the Disc needs a room full of people.
 */
const NOT_SUGGESTED: ReadonlySet<string> = new Set(["word-finder", "black-disc"]);

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Whole days from one `dailyKey()` to another; negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** How many different cabinets this phone has opened. */
export function triedCount(plays: Readonly<Record<string, number>>): number {
  return Object.values(plays).filter((n) => n > 0).length;
}

/**
 * Whether this phone still gets the newcomer help. `firstSeen` is the day it
 * first opened the arcade, or EXISTING.
 */
export function isNewcomer(
  firstSeen: string,
  today: string,
  plays: Readonly<Record<string, number>>,
): boolean {
  if (!DAY_KEY.test(firstSeen)) return false;
  const age = daysBetween(firstSeen, today);
  // A clock set backwards shouldn't make a phone new for ever.
  if (age < 0 || age >= NEWCOMER_DAYS) return false;
  return triedCount(plays) < NEWCOMER_GAMES;
}

/**
 * Up to `count` cabinets this phone hasn't opened, in the arcade's own order,
 * so the suggestions follow the menu order Justin chose. Leaves out `current`
 * (the game just played), the helpers above, and anything still in BETA: a
 * first impression should be a finished game.
 */
export function suggestGames<T extends { readonly id: string; readonly beta?: boolean }>(
  games: readonly T[],
  plays: Readonly<Record<string, number>>,
  current: string | null,
  count = 2,
): T[] {
  return games
    .filter(
      (game) =>
        !(plays[game.id]! > 0) &&
        game.id !== current &&
        !NOT_SUGGESTED.has(game.id) &&
        game.beta !== true,
    )
    .slice(0, count);
}

/**
 * What the home-screen offer should say on this phone, or null for none.
 *
 * - "in-app": inside Facebook, Instagram, Messenger and the like. Their
 *   browsers can't add to a home screen, and keep their own storage, so the
 *   offer is to open the arcade in the phone's real browser instead.
 * - "prompt": Android Chrome has offered its own install dialog.
 * - "ios": Safari on an iPhone or iPad, where Add to Home Screen is tucked
 *   away in the Share menu and nobody finds it unprompted.
 */
export type InstallKind = "in-app" | "prompt" | "ios";

const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Snapchat|musical_ly|TikTok|Line\//;

export function installKind(env: {
  userAgent: string;
  standalone: boolean;
  canPrompt: boolean;
  ios: boolean;
}): InstallKind | null {
  if (env.standalone) return null;
  if (IN_APP.test(env.userAgent)) return "in-app";
  if (env.canPrompt) return "prompt";
  if (env.ios) return "ios";
  return null;
}
