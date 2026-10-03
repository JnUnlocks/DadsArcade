/**
 * Builds public/crossword-words.txt, the dictionary behind the Word Finder.
 *
 * The source is the public-domain ENABLE word list (enable1.txt), the same
 * list Letter Lock's allowed guesses were cut from. It isn't kept in the repo:
 * download it and pass its path.
 *
 *   curl -o enable1.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
 *   node scripts/build-wordlist.mjs enable1.txt
 *
 * What comes out is ENABLE with words longer than a newspaper grid is wide
 * removed, and without the swears and slurs: a child typing a pattern into the
 * finder shouldn't get one back. Each word below is dropped along with its
 * plain endings (-s, -ed, -ing and so on).
 */

import { readFileSync, writeFileSync } from "node:fs";

const MAX_LENGTH = 15;

const RUDE = [
  "arse", "ass", "asshole", "bastard", "bitch", "blowjob", "bollock", "boob", "boobie", "booby",
  "bugger", "bullshit", "clit", "cock", "coon", "crap", "cunt", "damn", "dick", "dildo", "dyke",
  "fag", "faggot", "fart", "fuck", "goddamn", "homo", "horny", "jism", "kike", "nigger", "nude",
  "orgasm", "penis", "piss", "poop", "porn", "prick", "pussy", "queer", "rape", "rapist", "scrotum",
  "semen", "sex", "shit", "slut", "spic", "tit", "turd", "twat", "vagina", "wank", "whore", "wop",
];
const ENDINGS = ["", "s", "es", "ed", "d", "ing", "er", "ers", "y", "ier", "iest", "ies", "ty", "tier", "tiest"];

const blocked = new Set();
for (const word of RUDE) {
  for (const ending of ENDINGS) {
    blocked.add(word + ending);
    // Doubled last letter: "crapped", "shitting".
    blocked.add(word + word[word.length - 1] + ending);
    // Dropped final e: "raping".
    if (word.endsWith("e")) blocked.add(word.slice(0, -1) + ending);
  }
}
// Innocent words the endings above would otherwise take with them.
const KEEP = [
  "assess", "cocker", "cockers", "dicker", "dickers", "homed", "homer", "homers", "homes", "homey",
  "homier", "homiest", "homing", "homy", "prickly", "pricklier", "prickliest", "titer", "titers",
];
for (const word of KEEP) blocked.delete(word);

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/build-wordlist.mjs <path to enable1.txt>");
  process.exit(1);
}

const words = readFileSync(source, "utf8")
  .split(/\r?\n/)
  .map((word) => word.trim().toLowerCase())
  .filter((word) => /^[a-z]{2,}$/.test(word) && word.length <= MAX_LENGTH && !blocked.has(word));

writeFileSync(new URL("../public/crossword-words.txt", import.meta.url), words.join("\n") + "\n");
console.log(`${words.length} words written to public/crossword-words.txt`);
