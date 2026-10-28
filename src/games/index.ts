/**
 * The arcade's game registry.
 *
 * Adding a game is: write a module in `src/games/<name>/`, import it, add it to
 * this array. Nothing in the shell needs to know it exists.
 */

import type { GameModule } from "../core/game";
import { mallardModule } from "./mallard";
import { reefModule } from "./reef";
import { brickfallModule } from "./brickfall";
import { crossingModule } from "./crossing";
import { slimeShopModule } from "./slimeshop";
import { starfighterModule } from "./starfighter";
import { towerModule } from "./tower";
import { blackDiscModule } from "./blackdisc";
import { plasmaSortModule } from "./plasmasort";
import { letterLockModule } from "./letterlock";
import { snakeModule } from "./snake";
import { forestDashModule } from "./forestdash";
import { crosswordModule } from "./crossword";
import { wordFinderModule } from "./wordfinder";
import { sudokuModule } from "./sudoku";
import { prizeDropModule } from "./prizedrop";
import { wordVoltageModule } from "./wordvoltage";
import { solitaireModule } from "./solitaire";

export const GAMES: GameModule[] = [
  // The two daily puzzles share the top row: they're the reason to open the
  // arcade today, and the cabinets a shared result links to.
  plasmaSortModule,
  letterLockModule,
  // The newest cabinet, up where it's seen, then the straight arcade games.
  // Order chosen by Justin on 2026-10-16.
  prizeDropModule,
  starfighterModule,
  snakeModule,
  forestDashModule,
  // Mom Mom's Crossword and the Word Finder that helps with it, side by side.
  crosswordModule,
  wordFinderModule,
  mallardModule,
  reefModule,
  towerModule,
  crossingModule,
  brickfallModule,
  blackDiscModule,
  sudokuModule,
  // At the bottom while the family tries it out (BETA), by Justin's choice on
  // 2026-10-21.
  wordVoltageModule,
  // Brand new and in BETA (2026-10-22): after Word Voltage.
  solitaireModule,
  // Riley's own game, more for her than for the public: at the very bottom,
  // by Justin's choice on 2026-10-28.
  slimeShopModule,
];
