/**
 * Fact Frenzy's decks: the facts each grade practises, and how each fact is
 * dealt -- the question, four answers to choose from, and the picture Digit
 * shows after a miss.
 *
 * Pure: no DOM, so every deck can be dealt thousands of times in a test and
 * checked for a wrong answer, a repeated choice or a negative number.
 *
 * Numbers travel as the strings the screen shows ("14", "1.3", "3/4"), and
 * every deck writes its numbers one way only, so a tap is right when its
 * string matches. Wrong answers are chosen to be wrong the way children are
 * wrong -- 14 − 8 offers 22 (added instead) and 5 or 7 (counted one off) --
 * so a correct tap means the fact is known, not guessed by elimination.
 */

import type { Rng } from "../../core/rng.ts";

export type Grade = "K" | "1" | "2" | "3" | "4" | "5";

export const GRADES: readonly Grade[] = ["K", "1", "2", "3", "4", "5"];

export const GRADE_NAMES: Record<Grade, string> = {
  K: "Kindergarten",
  "1": "Grade 1",
  "2": "Grade 2",
  "3": "Grade 3",
  "4": "Grade 4",
  "5": "Grade 5",
};

export type Op = "+" | "−" | "×" | "÷";

/** A number as the screen shows it: "14", "1.3", "3/4". */
export type Num = string;

/** What Digit shows after a miss. `say` is the line in Digit's bubble. */
export type Hint =
  /** Dots in ten-frames: a, then b more (or b sliding away). Up to 20. */
  | { kind: "frames"; op: "+" | "−"; a: number; b: number; say: string }
  /** Tens rods and ones dots for each number. Up to 199. */
  | { kind: "tens"; op: "+" | "−"; a: number; b: number; say: string }
  /** Rows of dots. `cols` 0 draws the rows empty, for a missing factor. */
  | { kind: "array"; rows: number; cols: number; say: string }
  /** Fraction bars cut into `parts`, `shaded` of each filled. */
  | { kind: "bars"; parts: number; shaded: readonly number[]; say: string }
  /** Steps in words, for decimals. */
  | { kind: "steps"; lines: readonly string[]; say: string };

export interface Fact {
  /** The same fact always has the same key: "14−8", "3×?=21". */
  key: string;
  left: Num;
  op: Op;
  right: Num;
  result: Num;
  /** Which number the player fills in. */
  blank: "result" | "right";
  answer: Num;
  /** Four, smallest first, one of them the answer. */
  choices: readonly Num[];
  /** Kindergarten counts pictures rather than reading numerals. */
  picture?: string;
  hint: Hint;
}

export interface Deck {
  /** Stable: personal bests are filed under it. */
  readonly id: string;
  readonly grade: Grade;
  readonly skill: string;
  readonly range: string;
  make(rng: Rng): Fact;
}

/** The fact written out with its answer, for the "practise these" list. */
export function factText(fact: Fact): string {
  return `${fact.left} ${fact.op} ${fact.right} = ${fact.result}`;
}

// ----- Whole numbers -----

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Three wrong answers: up to two of the likely mistakes, then near misses,
 * all inside [lo, hi]. Returned with the answer, smallest first.
 */
export function wholeChoices(
  rng: Rng,
  answer: number,
  mistakes: readonly number[],
  lo: number,
  hi: number,
): Num[] {
  const picked = new Set<number>();
  const fits = (v: number) => Number.isInteger(v) && v >= lo && v <= hi && v !== answer && !picked.has(v);
  for (const v of shuffled(rng, mistakes)) {
    if (picked.size >= 2) break;
    if (fits(v)) picked.add(v);
  }
  const near = answer >= 20 ? [-1, 1, -2, 2, -10, 10, -3, 3] : [-1, 1, -2, 2, -3, 3, -4, 4];
  for (const d of shuffled(rng, near)) {
    if (picked.size >= 3) break;
    if (fits(answer + d)) picked.add(answer + d);
  }
  for (let guard = 0; picked.size < 3 && guard < 200; guard += 1) {
    const v = rng.int(lo, hi);
    if (fits(v)) picked.add(v);
  }
  return [answer, ...picked].sort((p, q) => p - q).map(String);
}

const PICTURES = ["🍎", "⭐", "🐟", "🎈", "🍪", "🦆", "🌸", "🚗"] as const;

/** a + b with the sum in [minSum, maxSum] and both parts at least minPart. */
function sumOf(rng: Rng, minSum: number, maxSum: number, minPart: number): [number, number] {
  const sum = rng.int(minSum, maxSum);
  const a = rng.int(minPart, sum - minPart);
  return [a, sum - a];
}

/** a − b with a in [minTop, maxTop], b at least minPart and the answer too. */
function differenceOf(rng: Rng, minTop: number, maxTop: number, minPart: number): [number, number] {
  const a = rng.int(minTop, maxTop);
  const b = rng.int(minPart, a - minPart);
  return [a, b];
}

/** The usual slip in a two-digit take-away: the smaller digit from the bigger, in each column. */
function columnSlip(a: number, b: number): number {
  const tens = Math.floor(a / 10) - Math.floor(b / 10);
  const ones = Math.abs((a % 10) - (b % 10));
  return tens * 10 + ones;
}

function addFact(rng: Rng, a: number, b: number, hi: number, picture?: string): Fact {
  const answer = a + b;
  const mistakes = [Math.abs(a - b), answer - 10, answer + 10];
  return {
    key: `${a}+${b}`,
    left: String(a),
    op: "+",
    right: String(b),
    result: String(answer),
    blank: "result",
    answer: String(answer),
    choices: wholeChoices(rng, answer, mistakes, 0, hi),
    ...(picture ? { picture } : {}),
    hint: answer <= 20 ? framesHint("+", a, b) : tensHint("+", a, b),
  };
}

function takeFact(rng: Rng, a: number, b: number, hi: number, picture?: string): Fact {
  const answer = a - b;
  const mistakes = [a + b, columnSlip(a, b), answer + 10];
  return {
    key: `${a}−${b}`,
    left: String(a),
    op: "−",
    right: String(b),
    result: String(answer),
    blank: "result",
    answer: String(answer),
    choices: wholeChoices(rng, answer, mistakes, 0, hi),
    ...(picture ? { picture } : {}),
    hint: a <= 20 ? framesHint("−", a, b) : tensHint("−", a, b),
  };
}

function framesHint(op: "+" | "−", a: number, b: number): Hint {
  if (op === "−") return { kind: "frames", op, a, b, say: `Start with ${a}. Take away ${b}. Count what's left!` };
  const say =
    a + b > 10 && a < 10 && b < 10
      ? `${a} and ${b} more. Fill up the ten first, then count on!`
      : `${a} and ${b} more. Count them all!`;
  return { kind: "frames", op, a, b, say };
}

function tensHint(op: "+" | "−", a: number, b: number): Hint {
  const tens = (n: number) => Math.floor(n / 10);
  const ones = (n: number) => n % 10;
  const say =
    op === "+"
      ? `Tens first: ${tens(a)} tens and ${tens(b)} tens. Then the ones: ${ones(a)} and ${ones(b)}.`
      : `Start at ${a}. Take away ${tens(b)} tens, then ${ones(b)} ones.`;
  return { kind: "tens", op, a, b, say };
}

function mulFact(rng: Rng, a: number, b: number, hi: number): Fact {
  const answer = a * b;
  const mistakes = [a + b, a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b];
  return {
    key: `${a}×${b}`,
    left: String(a),
    op: "×",
    right: String(b),
    result: String(answer),
    blank: "result",
    answer: String(answer),
    choices: wholeChoices(rng, answer, mistakes, 0, hi),
    hint: {
      kind: "array",
      rows: a,
      cols: b,
      say: a === 0 || b === 0 ? `${a} rows of ${b}. How many dots is that?` : `${a} rows of ${b}. Skip count by ${b}!`,
    },
  };
}

function divFact(rng: Rng, divisor: number, quotient: number): Fact {
  const total = divisor * quotient;
  const mistakes = [total - divisor, divisor, quotient + 2, quotient - 2];
  return {
    key: `${total}÷${divisor}`,
    left: String(total),
    op: "÷",
    right: String(divisor),
    result: String(quotient),
    blank: "result",
    answer: String(quotient),
    choices: wholeChoices(rng, quotient, mistakes, 0, Math.max(12, quotient + 4)),
    hint: {
      kind: "array",
      rows: divisor,
      cols: quotient,
      say: `${total} shared into ${divisor} equal rows. How many in each row?`,
    },
  };
}

/** a × ? = product: the right-hand factor is the blank. */
function missingFact(rng: Rng, a: number, b: number): Fact {
  const product = a * b;
  const mistakes = [product - a, a, b + 2, b - 2];
  return {
    key: `${a}×?=${product}`,
    left: String(a),
    op: "×",
    right: String(b),
    result: String(product),
    blank: "right",
    answer: String(b),
    choices: wholeChoices(rng, b, mistakes, 0, Math.max(12, b + 4)),
    hint: {
      kind: "array",
      rows: a,
      cols: b,
      say: `${a} rows make ${product} in all. How many in each row?`,
    },
  };
}

/** A factor from lo to hi, with 0 and 1 dealt less often -- they're the easy ones. */
function factor(rng: Rng, lo: number, hi: number): number {
  if (lo < 2 && rng.chance(0.15)) return rng.int(lo, 1);
  return rng.int(Math.max(2, lo), hi);
}

// ----- Decimals -----

/** Hundredths written the short way: 130 → "1.3", 65 → "0.65", 100 → "1". */
export function decimal(hundredths: number): Num {
  const whole = Math.floor(hundredths / 100);
  const part = hundredths % 100;
  if (part === 0) return String(whole);
  const digits = part % 10 === 0 ? String(part / 10) : String(part).padStart(2, "0");
  return `${whole}.${digits}`;
}

function decimalFact(rng: Rng): Fact {
  const tenthsOnly = rng.chance(0.6);
  let a: number;
  let b: number;
  if (tenthsOnly) {
    a = rng.int(1, 19) * 10;
    b = rng.int(1, 19) * 10;
  } else {
    // One in hundredths, one in tenths: lining up the point is the skill.
    do a = rng.int(11, 199);
    while (a % 10 === 0);
    b = rng.int(1, 19) * 10;
    if (rng.chance(0.5)) [a, b] = [b, a];
  }
  const add = rng.chance(0.5);
  if (!add && a === b) b = a === 10 ? 20 : a - 10;
  if (!add && a < b) [a, b] = [b, a];
  const answer = add ? a + b : a - b;

  // The slips: the point lined up wrongly (0.25 + 0.4 → 0.29, 0.6 + 0.7 → 0.13),
  // and a tenth or a hundredth off.
  const small = Math.min(a, b);
  const big = Math.max(a, b);
  const slips: number[] = [];
  if (tenthsOnly) slips.push(add ? (a + b) / 10 : (a - b) / 10);
  else {
    const tenths = a % 10 === 0 ? a : b;
    const hundredths = a % 10 === 0 ? b : a;
    slips.push(add ? hundredths + tenths / 10 : Math.abs(hundredths - tenths / 10));
  }
  const near = tenthsOnly ? [10, -10, 100, -100] : [10, -10, 1, -1, 100];
  const picked = new Set<number>();
  const fits = (v: number) => Number.isInteger(v) && v > 0 && v !== answer && !picked.has(v);
  for (const v of slips) if (fits(v)) picked.add(v);
  for (const d of shuffled(rng, near)) {
    if (picked.size >= 3) break;
    if (fits(answer + d)) picked.add(answer + d);
  }
  for (let k = 2; picked.size < 3; k += 1) if (fits(answer + k * 10)) picked.add(answer + k * 10);
  const choices = [answer, ...picked].sort((p, q) => p - q).map(decimal);

  const unit = tenthsOnly ? "tenths" : "hundredths";
  const count = (n: number) => (tenthsOnly ? n / 10 : n);
  const word = add ? "+" : "take away";
  return {
    key: `${a}${add ? "+" : "−"}${b}d`,
    left: decimal(add ? a : big),
    op: add ? "+" : "−",
    right: decimal(add ? b : small),
    result: decimal(answer),
    blank: "result",
    answer: decimal(answer),
    choices,
    hint: {
      kind: "steps",
      lines: [
        `${decimal(a)} is ${count(a)} ${unit}.`,
        `${decimal(b)} is ${count(b)} ${unit}.`,
        `${count(add ? a : big)} ${word} ${count(add ? b : small)} = ${count(answer)} ${unit}.`,
      ],
      say: `Line up the points! Count in ${unit}. How do you write ${count(answer)} ${unit}?`,
    },
  };
}

// ----- Fractions -----

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** n / d in lowest terms; a whole one is written "1". */
export function fraction(n: number, d: number): Num {
  const g = gcd(n, d);
  const top = n / g;
  const bottom = d / g;
  return bottom === 1 ? String(top) : `${top}/${bottom}`;
}

/** Pairs of denominators where one divides the other, so they share the bigger one. */
const DENOMINATORS: readonly (readonly [number, number])[] = [
  [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [8, 8], [10, 10], [12, 12],
  [2, 4], [2, 6], [3, 6], [4, 8], [2, 8], [3, 12], [4, 12], [6, 12], [5, 10], [2, 10],
];

const PIECES: Record<number, string> = { 4: "fourths", 6: "sixths", 8: "eighths", 10: "tenths", 12: "twelfths" };

function fractionFact(rng: Rng): Fact {
  const add = rng.chance(0.5);
  for (;;) {
    let [d1, d2] = rng.pick(DENOMINATORS);
    if (rng.chance(0.5)) [d1, d2] = [d2, d1];
    const whole = Math.max(d1, d2);
    const n1 = rng.int(1, d1 - 1);
    const n2 = rng.int(1, d2 - 1);
    const x1 = n1 * (whole / d1);
    const x2 = n2 * (whole / d2);
    if (add ? x1 + x2 > whole : x1 <= x2) continue;
    const total = add ? x1 + x2 : x1 - x2;

    // Wrong answers must be wrong in value, not just written another way:
    // 2/4 can't sit beside 1/2. They're compared in parts of `whole`.
    const value = (n: number, d: number) => (n * whole) / d;
    const taken = new Set<number>([total]);
    const picked: Num[] = [];
    const offer = (n: number, d: number) => {
      if (picked.length >= 3 || n <= 0 || d <= 0 || n > d * 2) return;
      const v = value(n, d);
      if (taken.has(v)) return;
      taken.add(v);
      picked.push(fraction(n, d));
    };
    // Tops and bottoms added (or taken) straight across.
    if (add) offer(n1 + n2, d1 + d2);
    else if (d1 !== d2) offer(n1 - n2, Math.abs(d1 - d2));
    for (const d of shuffled(rng, [1, -1, 2, -2, 3, -3])) offer(total + d, whole);
    for (let k = 4; picked.length < 3; k += 1) offer(total + k, whole);

    const choices = [fraction(total, whole), ...picked].sort((p, q) => numeric(p) - numeric(q));
    // Only the fraction that has to be cut smaller is mentioned: "2/4 is 6/12".
    const changes = [[n1, d1, x1], [n2, d2, x2]]
      .filter(([, d]) => d !== whole)
      .map(([n, d, x]) => `${n}/${d} is ${x}/${whole}.`);
    const say =
      d1 === d2
        ? `Same size pieces! ${add ? "Add" : "Take away"} the tops.`
        : `Cut both into ${PIECES[whole] ?? `${whole} pieces`}. ${changes.join(" ")}`;
    return {
      key: `${n1}/${d1}${add ? "+" : "−"}${n2}/${d2}`,
      left: `${n1}/${d1}`,
      op: add ? "+" : "−",
      right: `${n2}/${d2}`,
      result: fraction(total, whole),
      blank: "result",
      answer: fraction(total, whole),
      choices,
      hint: { kind: "bars", parts: whole, shaded: [x1, x2], say },
    };
  }
}

/** The value of a number as the screen writes it. */
export function numeric(num: Num): number {
  if (num.includes("/")) {
    const [n, d] = num.split("/").map(Number);
    return n! / d!;
  }
  return Number(num);
}

// ----- The decks -----

function deck(id: string, grade: Grade, skill: string, range: string, make: (rng: Rng) => Fact): Deck {
  return { id, grade, skill, range, make };
}

const addWithin = (max: number) => (rng: Rng) => {
  const [a, b] = sumOf(rng, Math.ceil(max * 0.35), max, 1);
  return addFact(rng, a, b, max);
};
const takeWithin = (max: number) => (rng: Rng) => {
  const [a, b] = differenceOf(rng, Math.ceil(max * 0.35), max, 1);
  return takeFact(rng, a, b, max);
};
const mixWithin = (max: number) => (rng: Rng) => (rng.chance(0.5) ? addWithin(max)(rng) : takeWithin(max)(rng));

export const DECKS: readonly Deck[] = [
  deck("k-pictures", "K", "Picture Math", "add and take away within 5", (rng) => {
    const picture = rng.pick(PICTURES);
    if (rng.chance(0.5)) {
      const [a, b] = sumOf(rng, 2, 5, 1);
      return addFact(rng, a, b, 5, picture);
    }
    const [a, b] = differenceOf(rng, 2, 5, 1);
    return takeFact(rng, a, b, 5, picture);
  }),
  deck("g1-add10", "1", "Addition", "within 10", addWithin(10)),
  deck("g1-take10", "1", "Subtraction", "within 10", takeWithin(10)),
  deck("g1-mix10", "1", "Addition + Subtraction", "within 10", mixWithin(10)),
  deck("g2-add20", "2", "Addition", "within 20", addWithin(20)),
  deck("g2-take20", "2", "Subtraction", "within 20", takeWithin(20)),
  deck("g2-mix20", "2", "Addition + Subtraction", "within 20", mixWithin(20)),
  deck("g2-mix100", "2", "Two-Digit Challenge", "within 100", (rng) => {
    if (rng.chance(0.5)) {
      const a = rng.int(10, 89);
      const b = rng.int(10, Math.max(10, 99 - a));
      return addFact(rng, a, b, 120);
    }
    const a = rng.int(21, 99);
    const b = rng.int(10, a - 5);
    return takeFact(rng, a, b, 120);
  }),
  deck("g3-times", "3", "Multiplication", "facts to 10 × 10", (rng) =>
    mulFact(rng, factor(rng, 0, 10), factor(rng, 0, 10), 110),
  ),
  deck("g3-share", "3", "Division", "facts to 100 ÷ 10", (rng) => divFact(rng, factor(rng, 1, 10), factor(rng, 1, 10))),
  deck("g3-mixed", "3", "Multiply + Divide", "facts to 10 × 10", (rng) =>
    rng.chance(0.5)
      ? mulFact(rng, factor(rng, 0, 10), factor(rng, 0, 10), 110)
      : divFact(rng, factor(rng, 1, 10), factor(rng, 1, 10)),
  ),
  deck("g4-mixed", "4", "Multiply + Divide", "to 12 × 12, with missing factors", (rng) => {
    const roll = rng.next();
    if (roll < 0.4) return mulFact(rng, rng.int(2, 12), rng.int(2, 12), 160);
    if (roll < 0.7) return divFact(rng, rng.int(2, 12), rng.int(2, 12));
    return missingFact(rng, rng.int(2, 12), rng.int(2, 12));
  }),
  deck("g5-mixed", "5", "Mixed Operations", "+ − × ÷", (rng) => {
    const roll = rng.next();
    if (roll < 0.25) {
      const a = rng.int(12, 99);
      const b = rng.int(12, 99);
      return addFact(rng, a, b, 220);
    }
    if (roll < 0.5) {
      const a = rng.int(40, 150);
      const b = rng.int(12, a - 8);
      return takeFact(rng, a, b, 220);
    }
    if (roll < 0.75) return mulFact(rng, rng.int(3, 12), rng.int(3, 12), 160);
    return divFact(rng, rng.int(3, 12), rng.int(3, 12));
  }),
  deck("g5-decimals", "5", "Decimals", "tenths and hundredths", decimalFact),
  deck("g5-fractions", "5", "Fractions", "add and take away", fractionFact),
];

/** Where each grade starts: the deck in the middle of what that grade practises. */
export const STARTING_DECK: Record<Grade, string> = {
  K: "k-pictures",
  "1": "g1-mix10",
  "2": "g2-mix20",
  "3": "g3-times",
  "4": "g4-mixed",
  "5": "g5-mixed",
};

export function deckById(id: string): Deck | undefined {
  return DECKS.find((d) => d.id === id);
}

export function decksFor(grade: Grade): Deck[] {
  return DECKS.filter((d) => d.grade === grade);
}
