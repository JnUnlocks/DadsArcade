/**
 * The arcade's game registry.
 *
 * Adding a game is: write a module in `src/games/<name>/`, import it, add it to
 * this array. Nothing in the shell needs to know it exists.
 */

import type { GameModule } from "../core/game";
import { mallardModule } from "./mallard";
import { reefModule } from "./reef";
import { crossingModule } from "./crossing";
import { slimeShopModule } from "./slimeshop";
import { starfighterModule } from "./starfighter";

export const GAMES: GameModule[] = [
  starfighterModule,
  mallardModule,
  reefModule,
  slimeShopModule,
  crossingModule,
];
