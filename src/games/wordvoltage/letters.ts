/**
 * Letters as a multiset: which words a wheel can spell.
 *
 * A wheel with one E cannot spell TEE, however many times the player drags
 * across it. Every check here counts letters, never just tests membership.
 */

/** Upper-case A-Z, or null for anything else (digits, accents, spaces). */
export function normalizeWord(raw: string): string | null {
  const word = raw.trim().toUpperCase();
  return /^[A-Z]+$/.test(word) ? word : null;
}

/** How many of each letter, A-Z, in 26 slots. */
export function letterCounts(letters: string): number[] {
  const counts = new Array<number>(26).fill(0);
  for (const ch of letters) {
    const at = ch.charCodeAt(0) - 65;
    if (at >= 0 && at < 26) counts[at]! += 1;
  }
  return counts;
}

/** True when `word` uses no letter more often than `letters` holds it. */
export function canSpell(word: string, letters: string): boolean {
  const have = letterCounts(letters);
  for (const ch of word) {
    const at = ch.charCodeAt(0) - 65;
    if (at < 0 || at >= 26) return false;
    have[at]! -= 1;
    if (have[at]! < 0) return false;
  }
  return true;
}

/** Sorted letters: two anagrams share a signature. */
export function letterSignature(letters: string): string {
  return [...letters].sort().join("");
}
