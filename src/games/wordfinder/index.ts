/**
 * WORD FINDER -- a crossword helper, for any crossword.
 *
 * Not a game: a tool that lives on the arcade floor. Type the letters you
 * have with a ? for each blank and it lists every word that fits; give it a
 * jumble and it unscrambles it; give it a word from a clue and it searches
 * the clues written for Mom Mom's Crossword. It's the same panel that opens
 * over the grid inside the crossword (games/crossword/finder.ts) -- here it
 * stands alone, for the puzzle in the actual newspaper.
 *
 * Like Black Disc it is entirely a DOM overlay with nothing to simulate, no
 * score and no board, so render() draws nothing and it never calls
 * gameOver(). The shell's pause button is the way out.
 */

import "../crossword/crossword.css";

import type { GameHost, GameInstance, GameModule, HudState } from "../../core/game";
import type { InputSnapshot } from "../../core/input";
import { buildFinder } from "../crossword/finder";
import { drawFinderIcon } from "../crossword/render";

class WordFinder implements GameInstance {
  private readonly root = document.createElement("div");

  constructor(_host: GameHost) {
    this.root.className = "finder-root";
    this.root.append(buildFinder());
  }

  extraControls(): HTMLElement {
    return this.root;
  }

  update(_dt: number, _input: InputSnapshot): void {}

  render(_ctx: CanvasRenderingContext2D, _alpha: number): void {}

  hud(): HudState {
    return { lives: 0, progress: 0, progressLabel: "" };
  }

  /** Nothing is running, so there is nothing for a background pause to save. */
  pausesWhenHidden(): boolean {
    return false;
  }
}

export const wordFinderModule: GameModule = {
  id: "word-finder",
  title: "WORD FINDER",
  shortTitle: "FINDER",
  blurb: "Stuck on a crossword clue? Type C?T and see what fits.",
  accent: "#7fd6c2",
  beta: true,
  drawIcon: drawFinderIcon,
  create: (host) => new WordFinder(host),
};
