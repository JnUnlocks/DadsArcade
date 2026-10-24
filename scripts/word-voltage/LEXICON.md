# Word Voltage: words, puzzles and assets

What Word Voltage's word lists are made from, under what licence, how they're
filtered, and what they can't do. Kept beside the generator because that's
the only thing that reads them. The phone never gets a dictionary: each
puzzle in the pack carries its own list of accepted bonus words.

## Sources

| List | From | Licence |
| --- | --- | --- |
| Bonus words | ENABLE (Enhanced North American Benchmark Lexicon), as the arcade already ships it in `public/crossword-words.txt` | Public domain. Built by `scripts/build-wordlist.mjs` from `enable1.txt` ([dolph/dictionary](https://github.com/dolph/dictionary)) |
| Target words | Letter Lock's answers (`src/games/letterlock/words.ts`) | Written by hand for this arcade |
| | Mom Mom's Crossword clue bank (`src/games/crossword/clues.ts`) | Written by hand for this arcade |
| | `data/extra-targets.txt` | Written by hand for Word Voltage |
| Deny list | `data/bonus-deny.txt` | Written by hand for Word Voltage |

Nothing was taken from another word game's dictionary, levels or art.

## How the lists are built (`lexicon.ts`)

- **Normalised** to upper-case A-Z, three to seven letters. Anything with an
  apostrophe, hyphen, accent, space or digit is dropped; so are one- and
  two-letter words.
- **Bonus words** are ENABLE (already without the swears and slurs that
  `build-wordlist.mjs` removes) minus everything in `bonus-deny.txt`: more
  slurs and insults, bodies, drinking, smoking and drugs, violence and death,
  and a few others. The deny list is exact words only; each form to block is
  listed.
- **Target words** are the three hand-written lists, minus the deny list, and
  only if ENABLE has them too. That last check is how typos get caught: a
  candidate missing from ENABLE is reported and left out (at the time of
  writing: APRIL, JUNE, ONLINE, RAP, SPICY, WEBSITE). Three clue-bank words are
  left out by the deny list (CIDER, KNIFE, WEED).
- Plurals and past tenses count only where a list spells them out. The
  generator never makes a word by adding S, ED or ING.

At the last build: 3,796 target words (343 three-letter, 1,039 four, 1,230
five, 652 six, 532 seven) and 51,428 bonus words.

## Packs

`pack-v1.json` (v0.29.0, Oct 21, 2026) was built from scratch: 401 puzzles.
`pack-v2.json` (v0.32.0, Oct 24, 2026) is v1 unchanged plus Challenge levels
101-200, with the same word lists: seven-letter wheels, 9 to 12 words, and
four letters or more for every board word from level 141.

## How a puzzle's words are chosen (`generate.ts`)

A base word from the target list gives the wheel its letters. Every target
word the wheel spells is a candidate for the board; the generator places as
many as the level asks for, and every other bonus-lexicon word the wheel
spells becomes that puzzle's bonus list. So a target is always a common word,
a bonus can be any accepted word, and the two lists never overlap. The pack
test (`src/games/wordvoltage/pack.test.ts`) recomputes each bonus list from
the lexicon to check it, which is what makes "7 of 23 found" an honest count.

The wheel's starting order is shuffled so that no reading round the circle,
from any letter and either way, is on the deny list, and reading all the way
round never spells one of the puzzle's own words.

## Review, honestly

Each target list was reviewed when it was written, against the bar stated at
the top of its file; the extra list was written and reviewed by the coding
assistant that built Word Voltage. That is a careful read, not a playtest: no
child has yet played these 400 boards. ENABLE's bonus words haven't been read one by one --
51,000 is too many -- so the deny list is a safety net, not a guarantee, and a
word someone finds unsuitable should be added to `bonus-deny.txt` and the pack
regenerated (as a new pack version once v1 is released).

## Known limits

- ENABLE is a word-game list, not a dictionary of current usage. It has
  obscure words (AAL, ETA, TAE) that will count as bonuses, and lacks some
  modern ones (ONLINE, EMAIL) and all proper names, so a real word can be
  refused. The game says "Try another word", never "that's not a word".
- American spellings only, as in the rest of the arcade.
- Word commonness is judged by hand; there is no frequency data behind it.

## Assets

Everything Word Voltage shows is made in code, like the rest of the arcade:

- The cabinet marquee is canvas paths (`src/games/wordvoltage/art.ts`).
- The bolt, the icons, the badges and the stars are inline SVG written for
  this game (`art.ts`).
- The title lockup is live text styled in CSS (`wordvoltage.css`); there's no
  logo image. The Dad's Arcade identity on its home screen is the arcade's
  own icon (`public/icon-192.png`) and its own wordmark style.
- Every sound is synthesised by the arcade's audio engine (`src/core/audio.ts`,
  the `volt*` sounds). No audio files.
- Fonts are system fonts (Arial Black / Segoe UI Black for titles, the
  platform's sans-serif for letters and controls). None are bundled.

No generated mock-up image is used anywhere in the game.
