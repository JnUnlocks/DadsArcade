/**
 * One word to build or one sentence to fix, and what counts as doing it on
 * your own.
 *
 * A point is for a first Check that is right with no hint and no model.
 * Moving tiles around and hearing the word again before Check are free:
 * that's thinking, not help. Everything a child finishes moves the round on,
 * scored or not.
 *
 * No DOM here, so the rules are tested on their own.
 */

import type { FixItem, SpellWord, Tile } from "./words.ts";

/** Misses before Digit offers to show the answer. */
export const MODEL_AFTER = 2;

export type CheckResult = "right" | "wrong" | "not-full";

export class BuildTask {
  readonly word: SpellWord;
  readonly tiles: readonly Tile[];
  /** Tile id in each slot, or null for an empty slot. */
  readonly slots: (string | null)[];
  misses = 0;
  hinted = false;
  modeled = false;
  solved = false;

  constructor(word: SpellWord, tiles: readonly Tile[]) {
    this.word = word;
    this.tiles = tiles;
    this.slots = Array.from({ length: word.word.length }, () => null);
  }

  /** True when the item scores: right first time, without help. */
  get own(): boolean {
    return this.solved && this.misses === 0 && !this.hinted && !this.modeled;
  }

  get helped(): boolean {
    return this.misses > 0 || this.hinted || this.modeled;
  }

  get full(): boolean {
    return this.slots.every((s) => s !== null);
  }

  /** Is this tile sitting in a slot? */
  placed(tileId: string): boolean {
    return this.slots.includes(tileId);
  }

  letterOf(tileId: string): string {
    return this.tiles.find((t) => t.id === tileId)?.letter ?? "";
  }

  /** Put a tray tile in the first empty slot. Returns the slot, or -1. */
  place(tileId: string): number {
    if (this.solved || this.placed(tileId) || !this.tiles.some((t) => t.id === tileId)) return -1;
    const slot = this.slots.indexOf(null);
    if (slot < 0) return -1;
    this.slots[slot] = tileId;
    return slot;
  }

  /** Send a slot's tile back to the tray. Returns the tile id, or null. */
  lift(slot: number): string | null {
    if (this.solved) return null;
    const tileId = this.slots[slot] ?? null;
    if (tileId) this.slots[slot] = null;
    return tileId;
  }

  clear(): void {
    if (this.solved) return;
    this.slots.fill(null);
  }

  get spelled(): string {
    return this.slots.map((id) => (id ? this.letterOf(id) : "")).join("");
  }

  check(): CheckResult {
    if (this.solved) return "right";
    if (!this.full) return "not-full";
    if (this.spelled === this.word.word) {
      this.solved = true;
      return "right";
    }
    this.misses += 1;
    return "wrong";
  }

  hint(): string {
    this.hinted = true;
    return this.word.hint;
  }

  get offerModel(): boolean {
    return !this.solved && !this.modeled && this.misses >= MODEL_AFTER;
  }

  /** Digit shows the word, then the child builds it again with Digit pointing the way. */
  model(): void {
    this.modeled = true;
    this.clear();
  }

  /**
   * While building it together: the tray tile Digit points at next, the
   * first unused tile with the next letter. Null once the word is full.
   */
  nextTogether(): string | null {
    const slot = this.slots.indexOf(null);
    if (slot < 0) return null;
    const letter = this.word.word[slot]!;
    return this.tiles.find((t) => t.letter === letter && !this.placed(t.id))?.id ?? null;
  }
}

export type SpotResult = "found" | "wrong-spot" | "ignored";

export class FixTask {
  readonly item: FixItem;
  readonly choices: readonly string[];
  /** Has the child tapped the part that's wrong? */
  found = false;
  wrongSpots = 0;
  misses = 0;
  hinted = false;
  modeled = false;
  solved = false;

  constructor(item: FixItem, choices: readonly string[]) {
    this.item = item;
    this.choices = choices;
  }

  get own(): boolean {
    return this.solved && !this.helped;
  }

  /** Choosing the wrong place to fix counts as help once Digit has said so. */
  get helped(): boolean {
    return this.wrongSpots > 0 || this.misses > 0 || this.hinted || this.modeled;
  }

  tapPart(index: number): SpotResult {
    if (this.solved || index < 0 || index >= this.item.parts.length) return "ignored";
    if (index === this.item.at) {
      this.found = true;
      return "found";
    }
    if (this.found) return "ignored";
    this.wrongSpots += 1;
    return "wrong-spot";
  }

  choose(choice: string): "right" | "wrong" | "ignored" {
    if (this.solved || !this.found || !this.choices.includes(choice)) return "ignored";
    if (choice === this.item.fix) {
      this.solved = true;
      return "right";
    }
    this.misses += 1;
    return "wrong";
  }

  hint(): string {
    this.hinted = true;
    return this.item.look;
  }

  get offerModel(): boolean {
    return !this.solved && !this.modeled && this.misses + this.wrongSpots >= MODEL_AFTER;
  }

  /** Digit points at the part and the right choice; the child taps them. */
  model(): void {
    this.modeled = true;
    this.found = true;
  }
}

/** How each item in a round went: scored on your own, or done with help. */
export interface ItemResult {
  id: string;
  own: boolean;
}
