/**
 * Everything Word Workshop teaches: spelling decks for Build a Word and
 * sentence decks for Fix a Sentence.
 *
 * Every item has a stable id, because a child's queue of words to practice
 * and the check that a round is only counted once are kept by id. Never
 * renumber one that has shipped; retire it and add a new id instead.
 *
 * All second grade for now. Each deck carries its grade, the same as Fact
 * Frenzy's decks, so first- and third-grade decks can be added without
 * changing anything else.
 */

import type { Grade } from "../factfrenzy/decks.ts";
import type { Rng } from "../../core/rng.ts";

// ----- Build a Word -----

export interface SpellWord {
  id: string;
  word: string;
  /** Said after the word so it can't be mistaken for another: "The rug is on the floor." */
  sentence: string;
  /** One pattern, taught: "The first sound, /sh/, takes two letters." */
  hint: string;
  /** Sound-alike words the tray must never be able to spell (tail -> tale). */
  not?: readonly string[];
  /** A recording to play instead of the device's voice, when there is one. */
  audio?: string;
}

export interface SpellDeck {
  id: string;
  grade: Grade;
  title: string;
  /** A few of its words, for the deck button. */
  sample: string;
  /** Letters a child might reach for by mistake: the two spare tiles come from these. */
  spares: string;
  words: readonly SpellWord[];
}

const w = (word: string, sentence: string, hint: string, not?: string[]): SpellWord => ({
  id: word,
  word,
  sentence,
  hint,
  ...(not ? { not } : {}),
});

const SHORT_A = "The middle sound is short a, like in apple.";
const SHORT_E = "The middle sound is short e, like in egg.";
const SHORT_I = "The middle sound is short i, like in itch.";
const SHORT_O = "The middle sound is short o, like in octopus.";
const SHORT_U = "The middle sound is short u, like in up.";

const quietE = (vowel: string) => `The e at the end is quiet. It makes the ${vowel} say its name.`;

export const SPELL_DECKS: readonly SpellDeck[] = [
  {
    id: "w2-short",
    grade: "2",
    title: "Short vowels",
    sample: "cap, bed, sit, hot, rug",
    spares: "aeiou",
    words: [
      w("cap", "Digit wears a red cap.", SHORT_A),
      w("bed", "I sleep in my bed.", SHORT_E),
      w("sit", "Please sit next to me.", SHORT_I),
      w("hot", "The soup is hot.", SHORT_O),
      w("rug", "The rug is on the floor.", SHORT_U),
      w("map", "We read the map.", SHORT_A),
      w("hen", "The hen laid an egg.", SHORT_E),
      w("mud", "The pig rolled in the mud.", SHORT_U),
      w("pig", "The pig says oink.", SHORT_I),
      w("jet", "The jet flew over us.", SHORT_E),
      w("fox", "The fox ran into the woods.", SHORT_O),
      w("bus", "We ride the bus to school.", SHORT_U),
      w("web", "The spider spun a web.", SHORT_E),
      w("lid", "Put the lid on the box.", SHORT_I),
      w("pot", "Soup cooks in a pot.", SHORT_O),
    ],
  },
  {
    id: "w2-shch",
    grade: "2",
    title: "sh and ch",
    sample: "ship, fish, chip, lunch",
    spares: "cshtkw",
    words: [
      w("ship", "The ship sailed away.", "The first sound, /sh/, takes two letters."),
      w("shop", "We shop for food.", "The first sound, /sh/, takes two letters."),
      w("shut", "Please shut the door.", "The first sound, /sh/, takes two letters."),
      w("shed", "The rake is in the shed.", "The first sound, /sh/, takes two letters."),
      w("shell", "I found a shell at the beach.", "It starts with /sh/, two letters. It ends with two l's."),
      w("fish", "The fish swims in the tank.", "The last sound, /sh/, takes two letters."),
      w("dish", "Put the dish in the sink.", "The last sound, /sh/, takes two letters."),
      w("cash", "Mom paid with cash.", "The last sound, /sh/, takes two letters."),
      w("chip", "I ate a potato chip.", "The first sound, /ch/, takes two letters."),
      w("chin", "Milk dripped on my chin.", "The first sound, /ch/, takes two letters."),
      w("chat", "Let's chat on the phone.", "The first sound, /ch/, takes two letters."),
      w("chop", "Dad will chop the wood.", "The first sound, /ch/, takes two letters."),
      w("much", "Thank you very much.", "The last sound, /ch/, takes two letters."),
      w("rich", "The king was rich.", "The last sound, /ch/, takes two letters."),
      w("lunch", "We eat lunch at noon.", "The last sound, /ch/, takes two letters. Listen for the n before it."),
    ],
  },
  {
    id: "w2-silente",
    grade: "2",
    title: "Silent e",
    sample: "cape, kite, home, cube",
    spares: "aeiou",
    words: [
      w("cape", "A cape can flutter behind you.", quietE("a")),
      w("tape", "Fix the page with tape.", quietE("a")),
      w("game", "Let's play a game.", quietE("a")),
      w("cake", "We had cake on my birthday.", quietE("a")),
      w("lake", "We swam in the lake.", quietE("a")),
      w("kite", "My kite flies high.", quietE("i")),
      w("ride", "I ride my bike to the park.", quietE("i")),
      w("bike", "My bike has a bell.", quietE("i")),
      w("five", "I have five toes on each foot.", quietE("i")),
      w("home", "It is time to go home.", quietE("o")),
      w("rope", "Hold on to the rope.", quietE("o")),
      w("nose", "I smell with my nose.", quietE("o")),
      w("bone", "The dog chewed a bone.", quietE("o")),
      w("cube", "An ice cube is cold.", quietE("u")),
      w("mule", "The mule carried the bags.", quietE("u")),
    ],
  },
  {
    id: "w2-thwh",
    grade: "2",
    title: "th and wh",
    sample: "this, bath, when, whip",
    spares: "ftvwh",
    words: [
      w("thin", "The paper is thin.", "The first sound, /th/, takes two letters."),
      w("then", "First we eat, then we play.", "The first sound, /th/, takes two letters."),
      w("them", "I gave them a snack.", "The first sound, /th/, takes two letters."),
      w("this", "This is my hat.", "The first sound, /th/, takes two letters."),
      w("that", "Look at that bird.", "The first sound, /th/, takes two letters."),
      w("with", "Come with me.", "The last sound, /th/, takes two letters."),
      w("bath", "The dog needs a bath.", "The last sound, /th/, takes two letters."),
      w("math", "I like math class.", "The last sound, /th/, takes two letters."),
      w("path", "Walk on the path.", "The last sound, /th/, takes two letters."),
      w("moth", "A moth flew to the light.", "The last sound, /th/, takes two letters."),
      w("cloth", "Wipe it with a cloth.", "It starts with c and l together. The last sound, /th/, takes two letters."),
      w("when", "When is lunch?", "The first sound, /w/, is spelled wh in this word."),
      w("whip", "We whip the cream.", "The first sound, /w/, is spelled wh in this word."),
      w("whiz", "She is a whiz at puzzles.", "The first sound, /w/, is spelled wh. It ends with z."),
      w("white", "Snow is white.", "It starts with wh. The e at the end makes the i say its name."),
    ],
  },
  {
    id: "w2-ck",
    grade: "2",
    title: "ck at the end",
    sample: "back, duck, rock, truck",
    spares: "aeiouq",
    words: [
      w("back", "I sit in the back seat.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("sock", "I lost my left sock.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("duck", "The duck says quack.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("kick", "Kick the ball to me.", "It starts with k. After a short vowel, the /k/ at the end is spelled ck."),
      w("neck", "A giraffe has a long neck.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("pack", "Pack your bag for school.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("rock", "I sat on a big rock.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("sick", "I stayed home sick.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("lock", "Lock the door.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("luck", "Good luck on your test!", "After a short vowel, the /k/ at the end is spelled ck."),
      w("deck", "We sat out on the deck.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("pick", "Pick a card.", "After a short vowel, the /k/ at the end is spelled ck."),
      w("truck", "The truck is loud.", "It starts with t and r together. The /k/ at the end is spelled ck."),
      w("black", "The cat is black.", "It starts with b and l together. The /k/ at the end is spelled ck."),
      w("clock", "The clock says three.", "It starts with c and l together. The /k/ at the end is spelled ck."),
    ],
  },
  {
    id: "w2-teams",
    grade: "2",
    title: "Vowel teams",
    sample: "rain, play, feet, boat",
    spares: "aeiouwy",
    words: [
      w("rain", "Rain fell all day.", "Long a in the middle is spelled ai.", ["rein"]),
      w("tail", "The dog wags its tail.", "Long a in the middle is spelled ai.", ["tale"]),
      w("mail", "A letter came in the mail.", "Long a in the middle is spelled ai.", ["male"]),
      w("paint", "We paint a picture.", "Long a in the middle is spelled ai."),
      w("play", "Can you come out to play?", "Long a at the end of a word is spelled ay."),
      w("day", "Today is a sunny day.", "Long a at the end of a word is spelled ay."),
      w("feet", "I have two feet.", "Long e here is spelled with two e's.", ["feat"]),
      w("tree", "A bird is in the tree.", "Long e at the end is spelled with two e's."),
      w("seed", "Plant the seed in the dirt.", "Long e here is spelled with two e's."),
      w("leaf", "A red leaf fell down.", "Long e here is spelled ea."),
      w("team", "Our team won the game.", "Long e here is spelled ea.", ["teem"]),
      w("boat", "The boat floats on the lake.", "Long o in the middle is spelled oa."),
      w("road", "Cars drive on the road.", "Long o in the middle is spelled oa.", ["rode"]),
      w("snow", "We played in the snow.", "Long o at the end is spelled ow."),
      w("grow", "Plants grow in the sun.", "Long o at the end is spelled ow."),
    ],
  },
];

/** The words Digit's first lesson is built on. */
export const TUTORIAL = {
  cap: { word: "cap", say: "Cap. Digit wears a red cap." },
  cape: { word: "cape", say: "Now make cape. A cape can flutter behind you." },
  /** Offered beside the cap's tiles: only e makes cape. */
  spares: ["e", "s", "t"],
  done: "Cap. Cape. The e is quiet. Now the a says its name.",
};

// ----- Fix a Sentence -----

export interface FixItem {
  id: string;
  /**
   * The sentence as the child sees it, one part per tap target. The last part
   * is always its ending mark, "" when the mark is missing, so a missing period
   * is a box to tap.
   */
  parts: readonly string[];
  /** Which part is wrong. */
  at: number;
  /** What it should be. */
  fix: string;
  /** Wrong choices offered beside the fix. */
  others: readonly string[];
  /** Why, read with the fixed sentence: "We use are for more than one dog." */
  why: string;
  /** Where to look, for a hint: "Look at the word after dogs." */
  look: string;
}

export interface FixDeck {
  id: string;
  grade: Grade;
  title: string;
  sample: string;
  items: readonly FixItem[];
}

/** "The dogs is wet ." -> parts; the last word is the ending mark, "_" for none. */
const f = (id: string, sentence: string, at: number, fix: string, others: string[], why: string, look: string): FixItem => {
  const parts = sentence.split(" ");
  if (parts[parts.length - 1] === "_") parts[parts.length - 1] = "";
  return { id, parts, at: at < 0 ? parts.length - 1 : at, fix, others, why, look };
};

const END = "Look at the end of the sentence.";
const START = "Look at the first word.";

export const FIX_DECKS: readonly FixDeck[] = [
  {
    id: "s2-agree",
    grade: "2",
    title: "One or more",
    sample: "is or are, was or were",
    items: [
      f("dogs-is", "The dogs is wet .", 2, "are", ["am", "be"], "We use are for more than one dog.", "Look at the word after dogs."),
      f("cat-are", "The cat are sleepy .", 2, "is", ["am", "be"], "We use is for one cat.", "Look at the word after cat."),
      f("birds-sings", "The birds sings .", 2, "sing", ["singing", "song"], "One bird sings. More than one bird sing.", "Look at what the birds do."),
      f("shoes-is", "My shoes is muddy .", 2, "are", ["am", "be"], "We use are for more than one shoe.", "Look at the word after shoes."),
      f("ducks-was", "The ducks was in the pond .", 2, "were", ["is", "be"], "We use were for more than one duck.", "Look at the word after ducks."),
      f("sam-were", "Sam were late today .", 1, "was", ["are", "be"], "We use was for one person.", "Look at the word after Sam."),
      f("baby-sleep", "The baby sleep in the crib .", 2, "sleeps", ["sleepy", "sleeping"], "One baby sleeps. We add s for one.", "Look at what the baby does."),
      f("friends-is", "My friends is here .", 2, "are", ["am", "be"], "We use are for more than one friend.", "Look at the word after friends."),
      f("frog-jump", "The frog jump high .", 2, "jumps", ["jumping", "jumper"], "One frog jumps. We add s for one.", "Look at what the frog does."),
      f("kids-plays", "The kids plays tag .", 2, "play", ["playing", "player"], "One kid plays. More than one kid play.", "Look at what the kids do."),
      f("apple-are", "This apple are red .", 2, "is", ["am", "be"], "We use is for one apple.", "Look at the word after apple."),
      f("trees-was", "The trees was tall .", 2, "were", ["is", "be"], "We use were for more than one tree.", "Look at the word after trees."),
      f("mom-dad-is", "Mom and Dad is home .", 3, "are", ["am", "be"], "Mom and Dad are two people, so we use are.", "Look at the word after Dad."),
      f("bus-are", "The bus are late .", 2, "is", ["am", "be"], "We use is for one bus.", "Look at the word after bus."),
      f("cats-sleeps", "Two cats sleeps on the bed .", 2, "sleep", ["sleepy", "sleeping"], "One cat sleeps. Two cats sleep.", "Look at what the cats do."),
    ],
  },
  {
    id: "s2-marks",
    grade: "2",
    title: "Capitals and end marks",
    sample: "We, I, names, ? . !",
    items: [
      f("we-play", "we play .", 0, "We", ["WE", "Wee"], "A sentence starts with a capital letter.", START),
      f("where-hat", "Where is my hat .", -1, "?", ["!", ","], "A question ends with a question mark.", END),
      f("see-frog", "I see a frog _", -1, ".", ["?", ","], "A telling sentence ends with a period.", END),
      f("i-pizza", "i like pizza .", 0, "I", ["me", "my"], "The word I is always a capital letter.", START),
      f("my-dog", "my dog is fluffy .", 0, "My", ["MY", "Mi"], "A sentence starts with a capital letter.", START),
      f("dog-max", "My dog is max .", 3, "Max", ["MAX", "mAx"], "Names start with a capital letter.", "Look for a name."),
      f("help-me", "Can you help me .", -1, "?", ["!", ","], "A question ends with a question mark.", END),
      f("look-out", "Look out _", -1, "!", ["?", ","], "We shout Look out! with strong feeling, so it ends with an exclamation mark.", END),
      f("like-cake", "Do you like cake .", -1, "?", ["!", ","], "A question ends with a question mark.", END),
      f("sun-hot", "the sun is hot .", 0, "The", ["THE", "Tha"], "A sentence starts with a capital letter.", START),
      f("live-ohio", "We live in ohio .", 3, "Ohio", ["OHIO", "oHio"], "Names of places start with a capital letter.", "Look for the name of a place."),
      f("what-time", "What time is it _", -1, "?", [".", ","], "A question ends with a question mark.", END),
      f("red-ball", "I have a red ball _", -1, ".", ["?", ","], "A telling sentence ends with a period.", END),
      f("sam-cat", "sam has a cat .", 0, "Sam", ["SAM", "sAm"], "Names start with a capital letter. So does a sentence.", START),
      f("how-old", "How old are you .", -1, "?", ["!", ","], "A question ends with a question mark.", END),
    ],
  },
  {
    id: "s2-words",
    grade: "2",
    title: "Word choice",
    sample: "I or me, a or an, has or have",
    items: [
      f("me-swim", "Me like to swim .", 0, "I", ["My", "Mine"], "We use I when we are the one doing something.", START),
      f("to-i", "Give the ball to I .", 4, "me", ["my", "mine"], "After to, we use me.", "Look at the last word."),
      f("a-apple", "I ate a apple .", 2, "an", ["and", "on"], "Apple starts with a vowel sound, so we use an.", "Look at the word before apple."),
      f("an-dog", "I saw an dog .", 2, "a", ["and", "on"], "Dog starts with a consonant sound, so we use a.", "Look at the word before dog."),
      f("she-have", "She have a kite .", 1, "has", ["haves", "having"], "We use has for one person.", "Look at the word after She."),
      f("we-has", "We has two cats .", 1, "have", ["haves", "having"], "We use have with we.", "Look at the word after We."),
      f("him-brother", "Him is my brother .", 0, "He", ["His", "Them"], "We use he, not him, to start a sentence like this.", START),
      f("her-sister", "Her is my sister .", 0, "She", ["Hers", "They"], "We use she, not her, to start a sentence like this.", START),
      f("i-has", "I has a dog .", 1, "have", ["haves", "having"], "We use have with I.", "Look at the word after I."),
      f("a-egg", "Can I have a egg ?", 3, "an", ["and", "on"], "Egg starts with a vowel sound, so we use an.", "Look at the word before egg."),
      f("them-friends", "Them are my friends .", 0, "They", ["Their", "Then"], "We use they, not them, to start a sentence like this.", START),
      f("gave-i", "Mom gave I a hug .", 2, "me", ["my", "mine"], "After gave, we use me.", "Look at the word after gave."),
      f("he-have", "He have a red hat .", 1, "has", ["haves", "having"], "We use has for one person.", "Look at the word after He."),
      f("a-owl", "I saw a owl .", 2, "an", ["and", "on"], "Owl starts with a vowel sound, so we use an.", "Look at the word before owl."),
    ],
  },
];

export function spellDeck(id: string): SpellDeck | undefined {
  return SPELL_DECKS.find((d) => d.id === id);
}

export function fixDeck(id: string): FixDeck | undefined {
  return FIX_DECKS.find((d) => d.id === id);
}

/** The sentence as written, with its mistake: "The dogs is wet." */
export function sentenceText(parts: readonly string[]): string {
  const words = parts.slice(0, -1).join(" ");
  return `${words}${parts[parts.length - 1] ?? ""}`;
}

/** The sentence put right. */
export function fixedParts(item: FixItem): string[] {
  return item.parts.map((p, i) => (i === item.at ? item.fix : p));
}

/** What Digit says for a word: "Rug. The rug is on the floor." */
export function clue(word: SpellWord): string {
  return `${word.word[0]!.toUpperCase()}${word.word.slice(1)}. ${word.sentence}`;
}

// ----- Dealing -----

export interface Tile {
  /** Unique even when two tiles show the same letter. */
  id: string;
  letter: string;
}

/** A shuffled copy. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Could these tiles spell `word`? */
function canSpell(letters: readonly string[], word: string): boolean {
  const left = [...letters];
  for (const ch of word) {
    const i = left.indexOf(ch);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}

/**
 * The tray for a word: its letters plus two spares a child might reach for,
 * shuffled so it never already reads as the word. A spare is never a letter
 * the word has, and never one that would let the tray spell a sound-alike.
 */
export function trayFor(word: SpellWord, spares: string, rng: Rng): Tile[] {
  const letters = [...word.word];
  let pool = [...new Set(spares)].filter((ch) => !letters.includes(ch));
  if (pool.length < 2) pool = [...new Set("aeioustnrl")].filter((ch) => !letters.includes(ch));
  const choices: string[][] = [];
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) choices.push([pool[i]!, pool[j]!]);
  }
  const safe = choices.filter((pair) => !(word.not ?? []).some((other) => other.length === word.word.length && canSpell([...letters, ...pair], other)));
  const pair = rng.pick(safe.length ? safe : choices);
  const all = [...letters, ...pair];
  let tiles = all.map((letter, i) => ({ id: `t${i}`, letter }));
  for (let tries = 0; tries < 8; tries += 1) {
    tiles = shuffle(rng, tiles);
    if (tiles.slice(0, letters.length).map((t) => t.letter).join("") !== word.word) break;
  }
  return tiles;
}

/**
 * Five different items for a round: words the child needed help with last
 * time come back first (two at most, so a round is never all old trouble),
 * then fresh ones, in a shuffled order.
 */
export function deal<T extends { id: string }>(items: readonly T[], count: number, queued: readonly string[], rng: Rng): T[] {
  const picked: T[] = [];
  for (const id of queued) {
    const item = items.find((x) => x.id === id);
    if (item && !picked.includes(item) && picked.length < 2) picked.push(item);
  }
  const rest = shuffle(rng, items.filter((x) => !picked.includes(x)));
  while (picked.length < count && rest.length) picked.push(rest.shift()!);
  return shuffle(rng, picked);
}

/** The choices for a fix, shuffled. */
export function choicesFor(item: FixItem, rng: Rng): string[] {
  return shuffle(rng, [item.fix, ...item.others]);
}
