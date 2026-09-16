/**
 * The melody's shape, and the one thing about it that fails silently.
 *
 * The scheduler wraps its cursor on the LEAD's total length, so a bass line
 * longer than the melody simply never reaches its tail -- the first draft was
 * twice as long and half of it was dead. Nothing throws, nothing looks wrong
 * in the code; the tune just quietly loses its bottom end halfway through.
 *
 * Run with: npm test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { KOROBEINIKI, type Note, type Track } from "./music.ts";

const beats = (notes: readonly Note[]) =>
  notes.reduce((total, [, b]) => total + b, 0);

function check(name: string, track: Track) {
  describe(name, () => {
    it("loops the bass with the lead, not past it", () => {
      if (!track.bass) return;
      assert.equal(
        beats(track.bass),
        beats(track.lead),
        "a bass longer than the lead is silently truncated by the scheduler",
      );
    });

    it("has no zero-length or negative notes", () => {
      // A zero-length note would stall the scheduler's cursor and spin it
      // against its guard every refill.
      for (const [, b] of [...track.lead, ...(track.bass ?? [])]) {
        assert.ok(b > 0, `note length ${b} would stall the cursor`);
      }
    });

    it("has only audible pitches or rests", () => {
      for (const [hz] of [...track.lead, ...(track.bass ?? [])]) {
        assert.ok(hz === 0 || (hz > 20 && hz < 8000), `pitch ${hz} is out of range`);
      }
    });

    it("has a sane tempo", () => {
      assert.ok(track.bpm > 20 && track.bpm < 1000);
    });

    it("fills whole bars", () => {
      // Eighth-note beats, four-four: a loop that isn't a multiple of 8 would
      // drift against the bass every time round.
      assert.equal(beats(track.lead) % 8, 0, "the loop should be whole bars");
    });
  });
}

check("Korobeiniki", KOROBEINIKI);

describe("Korobeiniki specifically", () => {
  it("opens on the note the tune actually opens on", () => {
    // E5. A cheap anchor, but it catches a transcription that has been
    // shifted or reordered wholesale.
    const [first] = KOROBEINIKI.lead;
    assert.ok(first, "the melody should have notes");
    assert.ok(
      Math.abs(first[0] - 659.25) < 1,
      `expected E5 (659.25Hz), got ${first[0]}`,
    );
  });

  it("is long enough to be the tune rather than a fragment", () => {
    assert.ok(KOROBEINIKI.lead.length >= 32, "too short to be recognisable");
  });
});
