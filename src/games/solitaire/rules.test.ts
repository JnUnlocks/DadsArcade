/**
 * Solitaire's rules and scoring, away from the screen.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  autoFinishMove,
  canAutoFinish,
  canMove,
  cardsHome,
  chargeTime,
  clone,
  deal,
  drawFromStock,
  isWon,
  liftable,
  move,
  smartMove,
  timePenaltyAt,
  winBonus,
  type Card,
  type Game,
  type Suit,
} from "./rules.ts";

const card = (suit: Suit, rank: number, up = true): Card => ({ id: suit * 13 + rank - 1, suit, rank, up });

/** An empty table to arrange by hand. */
function table(draw: 1 | 3 = 3): Game {
  return {
    draw,
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    score: 0,
    recycles: 0,
    moves: 0,
    fan: 0,
  };
}

describe("the deal", () => {
  it("lays out 28 cards in seven columns with the last of each face up", () => {
    const game = deal(42, 3);
    assert.deepEqual(game.tableau.map((c) => c.length), [1, 2, 3, 4, 5, 6, 7]);
    for (const col of game.tableau) {
      col.forEach((c, i) => assert.equal(c.up, i === col.length - 1));
    }
    assert.equal(game.stock.length, 24);
    assert.ok(game.stock.every((c) => !c.up));
  });

  it("uses every card exactly once", () => {
    const game = deal(7, 1);
    const ids = [...game.stock, ...game.tableau.flat()].map((c) => c.id).sort((a, b) => a - b);
    assert.deepEqual(ids, Array.from({ length: 52 }, (_, i) => i));
  });

  it("is the same deal for the same seed and a different one otherwise", () => {
    const ids = (g: Game) => g.tableau.flat().map((c) => c.id).join();
    assert.equal(ids(deal(5, 3)), ids(deal(5, 3)));
    assert.notEqual(ids(deal(5, 3)), ids(deal(6, 3)));
  });
});

describe("moves", () => {
  it("stacks down in alternating colours, and only a king on an empty column", () => {
    const game = table();
    game.tableau[0] = [card(0, 9)]; // black 9
    game.tableau[1] = [card(1, 8)]; // red 8
    game.tableau[2] = [card(3, 8)]; // black 8
    game.tableau[3] = [card(2, 12)]; // red queen
    assert.ok(canMove(game, { kind: "tableau", index: 1 }, 0, { kind: "tableau", index: 0 }));
    assert.ok(!canMove(game, { kind: "tableau", index: 2 }, 0, { kind: "tableau", index: 0 }));
    assert.ok(!canMove(game, { kind: "tableau", index: 3 }, 0, { kind: "tableau", index: 4 }));
    game.tableau[3] = [card(2, 13)];
    assert.ok(canMove(game, { kind: "tableau", index: 3 }, 0, { kind: "tableau", index: 4 }));
  });

  it("builds foundations up by suit from the ace", () => {
    const game = table();
    game.waste = [card(1, 2)];
    assert.ok(!canMove(game, { kind: "waste" }, 0, { kind: "foundation", index: 0 }));
    game.foundations[0] = [card(1, 1)];
    assert.ok(canMove(game, { kind: "waste" }, 0, { kind: "foundation", index: 0 }));
    game.foundations[0] = [card(2, 1)];
    assert.ok(!canMove(game, { kind: "waste" }, 0, { kind: "foundation", index: 0 }));
  });

  it("moves a run together, but only a proper one", () => {
    const game = table();
    game.tableau[0] = [card(0, 5, false), card(1, 9), card(0, 8), card(2, 7)];
    assert.equal(liftable(game, { kind: "tableau", index: 0 }, 1), 3);
    assert.equal(liftable(game, { kind: "tableau", index: 0 }, 0), 0);
    game.tableau[0] = [card(1, 9), card(1, 8)];
    assert.equal(liftable(game, { kind: "tableau", index: 0 }, 0), 0);
  });

  it("turns over the card left on top, for five points", () => {
    const game = table();
    game.tableau[0] = [card(0, 4, false), card(1, 1)];
    assert.ok(move(game, { kind: "tableau", index: 0 }, 1, { kind: "foundation", index: 0 }));
    assert.equal(game.tableau[0]![0]!.up, true);
    assert.equal(game.score, 10 + 5);
  });

  it("changes nothing when a move isn't allowed", () => {
    const game = deal(3, 3);
    const before = JSON.stringify(game);
    assert.equal(move(game, { kind: "tableau", index: 0 }, 0, { kind: "tableau", index: 0 }), false);
    assert.equal(move(game, { kind: "tableau", index: 6 }, 0, { kind: "tableau", index: 1 }), false);
    assert.equal(JSON.stringify(game), before);
  });
});

describe("scoring", () => {
  it("scores waste to tableau, waste home, and charges taking one back", () => {
    const game = table();
    game.tableau[0] = [card(0, 9)];
    game.waste = [card(3, 1), card(1, 8)];
    move(game, { kind: "waste" }, 1, { kind: "tableau", index: 0 });
    assert.equal(game.score, 5);
    move(game, { kind: "waste" }, 0, { kind: "foundation", index: 2 });
    assert.equal(game.score, 15);
    game.tableau[1] = [card(1, 2)];
    move(game, { kind: "foundation", index: 2 }, 0, { kind: "tableau", index: 1 });
    assert.equal(game.score, 0);
  });

  it("never goes below zero", () => {
    const game = table(1);
    game.waste = [card(0, 3)];
    drawFromStock(game);
    assert.equal(game.score, 0);
    chargeTime(game, 10);
    assert.equal(game.score, 0);
  });

  it("charges -100 a pass drawing one and -20 drawing three", () => {
    const one = table(1);
    one.score = 150;
    one.waste = [card(0, 3), card(0, 4)];
    assert.equal(drawFromStock(one), "recycle");
    assert.equal(one.score, 50);
    const three = table(3);
    three.score = 150;
    three.waste = [card(0, 3)];
    drawFromStock(three);
    assert.equal(three.score, 130);
  });

  it("takes two points every ten seconds", () => {
    assert.equal(timePenaltyAt(9.9), 0);
    assert.equal(timePenaltyAt(10), 2);
    assert.equal(timePenaltyAt(125), 24);
  });

  it("pays a time bonus only from thirty seconds", () => {
    assert.equal(winBonus(29), 0);
    assert.equal(winBonus(30), 23333);
    assert.equal(winBonus(180), 3888);
  });
});

describe("the stock", () => {
  it("turns over three at a time, keeping their order", () => {
    const game = table(3);
    game.stock = [card(0, 1, false), card(0, 2, false), card(0, 3, false), card(0, 4, false)];
    drawFromStock(game);
    assert.deepEqual(game.waste.map((c) => c.rank), [4, 3, 2]);
    assert.ok(game.waste.every((c) => c.up));
    assert.equal(game.fan, 3);
    game.foundations[0] = [card(1, 1)];
    game.waste[2] = card(1, 2);
    move(game, { kind: "waste" }, 2, { kind: "foundation", index: 0 });
    assert.equal(game.fan, 2);
    drawFromStock(game);
    assert.deepEqual(game.waste.map((c) => c.rank), [4, 3, 1]);
    assert.equal(game.fan, 1);
  });

  it("comes back in the order it was first dealt", () => {
    const game = table(1);
    game.stock = [card(0, 1, false), card(0, 2, false), card(0, 3, false)];
    const order = game.stock.map((c) => c.id).join();
    drawFromStock(game);
    drawFromStock(game);
    drawFromStock(game);
    drawFromStock(game);
    assert.equal(game.stock.map((c) => c.id).join(), order);
    assert.ok(game.stock.every((c) => !c.up));
    assert.equal(game.recycles, 1);
  });
});

describe("tap to move", () => {
  it("sends a single card home first", () => {
    const game = table();
    game.foundations[1] = [card(1, 1)];
    game.tableau[0] = [card(1, 2)];
    game.tableau[1] = [card(0, 3)];
    assert.deepEqual(smartMove(game, { kind: "tableau", index: 0 }, 0), { kind: "foundation", index: 1 });
  });

  it("doesn't move a king from the bottom of one column to an empty one", () => {
    const game = table();
    game.tableau[0] = [card(0, 13)];
    assert.equal(smartMove(game, { kind: "tableau", index: 0 }, 0), null);
    game.waste = [card(1, 13)];
    assert.deepEqual(smartMove(game, { kind: "waste" }, 0), { kind: "tableau", index: 1 });
  });

  it("prefers a column with cards to an empty one", () => {
    const game = table();
    game.tableau[3] = [card(0, 1, false), card(1, 13)];
    game.tableau[5] = [card(1, 13)];
    game.tableau[6] = [card(1, 1, false), card(0, 12)];
    assert.deepEqual(smartMove(game, { kind: "tableau", index: 6 }, 1), { kind: "tableau", index: 3 });
  });
});

describe("finishing", () => {
  it("offers to finish once nothing is hidden, and plays it out to a win", () => {
    const game = table();
    for (let suit = 0; suit < 4; suit += 1) {
      // Each column a descending run of one suit's cards, alternating
      // colour, so every column is legal and all of it is face up.
      game.tableau[suit] = [];
    }
    // Lay all 52 out in four columns: K..A, colours alternating by pairing suits.
    const pairs: [Suit, Suit][] = [[0, 1], [1, 0], [3, 2], [2, 3]];
    pairs.forEach(([a, b], col) => {
      for (let rank = 13; rank >= 1; rank -= 1) game.tableau[col]!.push(card(rank % 2 ? a : b, rank));
    });
    assert.ok(canAutoFinish(game));
    let guard = 0;
    while (!isWon(game) && guard < 100) {
      const next = autoFinishMove(game);
      assert.ok(next, `stuck with ${cardsHome(game)} home`);
      assert.ok(move(game, next.from, next.start, next.to));
      guard += 1;
    }
    assert.ok(isWon(game));
    assert.equal(game.score, 52 * 10);
  });

  it("doesn't offer it with cards still face down", () => {
    const game = deal(9, 3);
    game.stock = [];
    assert.equal(canAutoFinish(game), false);
  });

  it("clones deeply enough for undo", () => {
    const game = deal(11, 1);
    const copy = clone(game);
    drawFromStock(game);
    move(game, { kind: "waste" }, game.waste.length - 1, { kind: "tableau", index: 0 });
    assert.equal(copy.stock.length, 24);
    assert.ok(copy.stock.every((c) => !c.up));
  });
});
