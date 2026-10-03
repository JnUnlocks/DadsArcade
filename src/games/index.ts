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

export const GAMES: GameModule[] = [
  // The two daily puzzles share the top row: they're the reason to open the
  // arcade today, and the cabinets a shared result links to.
  plasmaSortModule,
  letterLockModule,
  starfighterModule,
  // Snake sits beside Starfighter: the two straight arcade games, together.
  snakeModule,
  // Mom Mom's Crossword, the third daily puzzle, and the Word Finder that
  // helps with it, side by side in the row under the first two.
  crosswordModule,
  wordFinderModule,
  mallardModule,
  reefModule,
  towerModule,
  crossingModule,
  brickfallModule,
  slimeShopModule,
  blackDiscModule,
  // The newest cabinet goes on the end, as Snake did when it arrived.
  forestDashModule,
];
