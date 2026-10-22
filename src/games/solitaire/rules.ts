/**
 * Klondike, scored the way the old office PC scored it.
 *
 * No DOM and no clock of its own: a game is a plain object that the screen
 * hands back in, and every move either returns true having changed it, or
 * returns false having changed nothing. Undo is a snapshot taken by the
 * screen before each move, so nothing here needs to know how to reverse
 * anything.
 *
 * Standard scoring, from the PC game's help page:
 *   waste to tableau            +5
 *   waste to foundation        +10
 *   tableau to foundation      +10
 *   turning a tableau card up   +5
 *   foundation to tableau      -15
 *   going through the deck again: -100 drawing one, -20 drawing three
 *   every ten seconds           -2
 *   a win after 30 seconds or more: a bonus of 700,000 / seconds
 * The score never goes below zero.
 */

import { Rng } from "../../core/rng.ts";

/** Spades, hearts, diamonds, clubs. Hearts and diamonds are red. */
export type Suit = 0 | 1 | 2 | 3;

export interface Card {
  /** 0..51, unique in the deck: suit * 13 + rank - 1. */
  readonly id: number;
  readonly suit: Suit;
  /** 1 (ace) to 13 (king). */
  readonly rank: number;
  up: boolean;
}

export type DrawCount = 1 | 3;

export type PileRef =
  | { readonly kind: "stock" }
  | { readonly kind: "waste" }
  | { readonly kind: "foundation"; readonly index: number }
  | { readonly kind: "tableau"; readonly index: number };

export interface Game {
  readonly draw: DrawCount;
  stock: Card[];
  waste: Card[];
  foundations: Card[][];
  tableau: Card[][];
  score: number;
  /** Times the waste has gone back into the stock. */
  recycles: number;
  /** Moves made, draws included: only so the screen can tell a fresh deal. */
  moves: number;
  /**
   * How many of the waste's top cards lie fanned out. Drawing three fans
   * the three just turned; playing one off leaves the other two, as on the
   * PC, rather than pulling up a card from underneath.
   */
  fan: number;
}

export const SCORE = {
  wasteToTableau: 5,
  wasteToFoundation: 10,
  tableauToFoundation: 10,
  turnOver: 5,
  foundationToTableau: -15,
  recycleDrawOne: -100,
  recycleDrawThree: -20,
  /** Every TIME_STEP seconds. */
  timePenalty: -2,
} as const;

export const TIME_STEP = 10;
/** A win quicker than this earns no time bonus. */
export const BONUS_MIN_SECONDS = 30;
export const BONUS_NUMERATOR = 700_000;

export function isRed(card: Card): boolean {
  return card.suit === 1 || card.suit === 2;
}

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < 4; suit += 1) {
    for (let rank = 1; rank <= 13; rank += 1) {
      deck.push({ id: suit * 13 + rank - 1, suit: suit as Suit, rank, up: false });
    }
  }
  return deck;
}

/** A fresh deal: seven columns of one to seven cards, the last of each face up. */
export function deal(seed: number, draw: DrawCount): Game {
  const rng = new Rng(seed);
  const deck = newDeck();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  const tableau: Card[][] = [[], [], [], [], [], [], []];
  // Dealt the way a person deals: across the row, one fewer column each time.
  for (let row = 0; row < 7; row += 1) {
    for (let col = row; col < 7; col += 1) {
      const card = deck.pop()!;
      card.up = col === row;
      tableau[col]!.push(card);
    }
  }
  return {
    draw,
    stock: deck,
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    score: 0,
    recycles: 0,
    moves: 0,
    fan: 0,
  };
}

export function clone(game: Game): Game {
  const copy = (pile: Card[]) => pile.map((c) => ({ ...c }));
  return {
    ...game,
    stock: copy(game.stock),
    waste: copy(game.waste),
    foundations: game.foundations.map(copy),
    tableau: game.tableau.map(copy),
  };
}

export function pile(game: Game, ref: PileRef): Card[] {
  switch (ref.kind) {
    case "stock":
      return game.stock;
    case "waste":
      return game.waste;
    case "foundation":
      return game.foundations[ref.index]!;
    case "tableau":
      return game.tableau[ref.index]!;
  }
}

function top(cards: readonly Card[]): Card | undefined {
  return cards[cards.length - 1];
}

function addScore(game: Game, points: number): void {
  game.score = Math.max(0, game.score + points);
}

/** True when `card` may go on foundation `index` as it stands. */
export function fitsFoundation(game: Game, card: Card, index: number): boolean {
  const under = top(game.foundations[index]!);
  if (!under) return card.rank === 1;
  return under.suit === card.suit && card.rank === under.rank + 1;
}

/** True when `card` (with whatever is on it) may go on tableau column `index`. */
export function fitsTableau(game: Game, card: Card, index: number): boolean {
  const under = top(game.tableau[index]!);
  if (!under) return card.rank === 13;
  return under.up && isRed(under) !== isRed(card) && card.rank === under.rank - 1;
}

/**
 * How many cards a move from `from` may pick up starting at `start`, or 0 if
 * the card there can't be picked up. Tableau runs move together; the waste
 * and foundations only ever give up their top card.
 */
export function liftable(game: Game, from: PileRef, start: number): number {
  const cards = pile(game, from);
  if (start < 0 || start >= cards.length) return 0;
  if (from.kind === "stock") return 0;
  if (from.kind !== "tableau") return start === cards.length - 1 ? 1 : 0;
  if (!cards[start]!.up) return 0;
  // Every card face up from there down must already be a proper run.
  for (let i = start + 1; i < cards.length; i += 1) {
    const above = cards[i - 1]!;
    const card = cards[i]!;
    if (!card.up || isRed(card) === isRed(above) || card.rank !== above.rank - 1) return 0;
  }
  return cards.length - start;
}

/** True when moving the cards from `start` up in `from` onto `to` is allowed. */
export function canMove(game: Game, from: PileRef, start: number, to: PileRef): boolean {
  if (to.kind === "stock" || to.kind === "waste" || samePile(from, to)) return false;
  const count = liftable(game, from, start);
  if (count === 0) return false;
  const card = pile(game, from)[start]!;
  if (to.kind === "foundation") return count === 1 && fitsFoundation(game, card, to.index);
  return fitsTableau(game, card, to.index);
}

/**
 * Move the cards from `start` up in `from` onto `to`. Returns false, having
 * changed nothing, if the move isn't allowed. A tableau card left face down
 * on top turns itself over, for its +5.
 */
export function move(game: Game, from: PileRef, start: number, to: PileRef): boolean {
  if (!canMove(game, from, start, to)) return false;
  const source = pile(game, from);
  const moving = source.splice(start);
  pile(game, to).push(...moving);
  addScore(game, movePoints(from, to));
  if (from.kind === "waste") game.fan = Math.max(source.length > 0 ? 1 : 0, game.fan - 1);
  if (from.kind === "tableau") {
    const last = top(source);
    if (last && !last.up) {
      last.up = true;
      addScore(game, SCORE.turnOver);
    }
  }
  game.moves += 1;
  return true;
}

function movePoints(from: PileRef, to: PileRef): number {
  if (from.kind === "waste" && to.kind === "tableau") return SCORE.wasteToTableau;
  if (from.kind === "waste" && to.kind === "foundation") return SCORE.wasteToFoundation;
  if (from.kind === "tableau" && to.kind === "foundation") return SCORE.tableauToFoundation;
  if (from.kind === "foundation" && to.kind === "tableau") return SCORE.foundationToTableau;
  return 0;
}

/**
 * Tap the stock: turn over one or three cards onto the waste, or, with the
 * stock used up, turn the waste back over to make the stock again. Returns
 * what happened, or "none" when both are empty.
 */
export function drawFromStock(game: Game): "draw" | "recycle" | "none" {
  if (game.stock.length > 0) {
    const n = Math.min(game.draw, game.stock.length);
    for (let i = 0; i < n; i += 1) {
      const card = game.stock.pop()!;
      card.up = true;
      game.waste.push(card);
    }
    game.fan = n;
    game.moves += 1;
    return "draw";
  }
  if (game.waste.length === 0) return "none";
  game.stock = game.waste.reverse().map((c) => ({ ...c, up: false }));
  game.waste = [];
  game.fan = 0;
  game.recycles += 1;
  addScore(game, game.draw === 1 ? SCORE.recycleDrawOne : SCORE.recycleDrawThree);
  game.moves += 1;
  return "recycle";
}

/** Points lost to the clock after `seconds` of play. */
export function timePenaltyAt(seconds: number): number {
  return Math.floor(seconds / TIME_STEP) * -SCORE.timePenalty;
}

/** Take `points` off for time, never below zero. */
export function chargeTime(game: Game, points: number): void {
  addScore(game, -points);
}

/** The bonus a win earns at this time. */
export function winBonus(seconds: number): number {
  const s = Math.floor(seconds);
  if (s < BONUS_MIN_SECONDS) return 0;
  return Math.floor(BONUS_NUMERATOR / s);
}

export function cardsHome(game: Game): number {
  return game.foundations.reduce((n, f) => n + f.length, 0);
}

export function isWon(game: Game): boolean {
  return cardsHome(game) === 52;
}

/**
 * True when nothing is left hidden or undealt, so the rest is a formality and
 * the game can play itself out.
 */
export function canAutoFinish(game: Game): boolean {
  if (isWon(game)) return false;
  if (game.stock.length > 0 || game.waste.length > 0) return false;
  return game.tableau.every((col) => col.every((c) => c.up));
}

/** The next card the auto finish sends home: the lowest one that can go. */
export function autoFinishMove(game: Game): { from: PileRef; start: number; to: PileRef } | null {
  let best: { from: PileRef; start: number; to: PileRef; rank: number } | null = null;
  const sources: PileRef[] = [
    { kind: "waste" },
    ...game.tableau.map((_, index) => ({ kind: "tableau", index }) as const),
  ];
  for (const from of sources) {
    const cards = pile(game, from);
    const card = top(cards);
    if (!card) continue;
    for (let f = 0; f < 4; f += 1) {
      if (fitsFoundation(game, card, f) && (!best || card.rank < best.rank)) {
        best = { from, start: cards.length - 1, to: { kind: "foundation", index: f }, rank: card.rank };
      }
    }
  }
  return best && { from: best.from, start: best.start, to: best.to };
}

/**
 * Where a tap sends a card: the move the player most likely meant.
 *
 * A single card goes home to its foundation if it can. Otherwise the run
 * goes onto another column, preferring one with cards in it, and never
 * shuffling a king that's already at the bottom of a column into another
 * empty one, which would change nothing. Null when it has nowhere to go.
 */
export function smartMove(game: Game, from: PileRef, start: number): PileRef | null {
  const count = liftable(game, from, start);
  if (count === 0) return null;
  if (count === 1 && from.kind !== "foundation") {
    for (let f = 0; f < 4; f += 1) {
      const to: PileRef = { kind: "foundation", index: f };
      if (canMove(game, from, start, to)) return to;
    }
  }
  const card = pile(game, from)[start]!;
  let empty: PileRef | null = null;
  // Scan from the column next to this one, so repeated taps on a card that
  // fits two places move it along rather than back and forth.
  const origin = from.kind === "tableau" ? from.index : -1;
  for (let step = 1; step <= 7; step += 1) {
    const index = (origin + step + 7) % 7;
    const to: PileRef = { kind: "tableau", index };
    if (!canMove(game, from, start, to)) continue;
    if (game.tableau[index]!.length > 0) return to;
    const kingAlreadyAtBottom = from.kind === "tableau" && start === 0 && card.rank === 13;
    if (!empty && !kingAlreadyAtBottom) empty = to;
  }
  return empty;
}

export function samePile(a: PileRef, b: PileRef): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "stock" || a.kind === "waste") return true;
  return a.index === (b as { index: number }).index;
}
