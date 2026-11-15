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
import { circuitClimbModule } from "./circuitclimb";
import { wordVoltageModule } from "./wordvoltage";
import { solitaireModule } from "./solitaire";
import { reflexRushModule } from "./reflexrush";

export const GAMES: GameModule[] = [
  // Ordered on 2026-11-15 by how the arcade is actually played, from the
  // scoreboard's play log for the month before: the cabinets people come
  // back to on another day go first.
  //
  // The three daily puzzles lead. Uncle Potato Head's Sudoku brought back
  // more of its players than any other cabinet (half of them).
  plasmaSortModule,
  letterLockModule,
  sudokuModule,
  // Prize Drop is what most newcomers open first, and now has a daily too.
  prizeDropModule,
  // The newest cabinet (2026-11-14), up where it's seen.
  circuitClimbModule,
  // Brickfall was the second most likely to bring a player back.
  brickfallModule,
  reflexRushModule,
  // Mom Mom's Crossword and the Word Finder that helps with it, side by side.
  crosswordModule,
  wordFinderModule,
  forestDashModule,
  wordVoltageModule,
  solitaireModule,
  // Starfighter and Snake sat in the top rows and few came back to them.
  starfighterModule,
  snakeModule,
  blackDiscModule,
  mallardModule,
  reefModule,
  towerModule,
  crossingModule,
  // Riley's own game, more for her than for the public: at the very bottom,
  // by Justin's choice on 2026-10-28.
  slimeShopModule,
];
