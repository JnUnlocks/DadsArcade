/**
 * Looping chiptune, scheduled ahead of the clock.
 *
 * The arcade's sound effects are one-shots fired the instant something
 * happens, which is why AudioEngine had no notion of time beyond "now".
 * Music can't work that way: setTimeout drifts by tens of milliseconds and a
 * melody scheduled on it audibly wanders. So this keeps a cursor in
 * AudioContext time and schedules every note that falls inside a short
 * lookahead window, refilling on a coarse timer. The timer can be late by a
 * whole tick without any of the notes being late, because their start times
 * were computed in advance.
 *
 * Everything is synthesised, like the rest of the arcade. There are no audio
 * files in this project and this doesn't add one.
 */

/** A note as [frequency in Hz or 0 for a rest, length in beats]. */
export type Note = readonly [number, number];

export interface Track {
  /** The melody, played on a square lead. */
  lead: readonly Note[];
  /** Optional bass line, played on a triangle. Loops with the lead. */
  bass?: readonly Note[];
  /** Beats per minute at tempo scale 1. */
  bpm: number;
}

/** How far ahead notes are scheduled, and how often that's topped up. */
const LOOKAHEAD_SECONDS = 0.35;
const REFILL_MS = 120;

export class MusicPlayer {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private track: Track | null = null;
  private timer: number | null = null;

  /** Next unscheduled beat position, and the context time it falls at. */
  private cursorBeat = 0;
  private cursorTime = 0;
  private tempoScale = 1;
  private _volume = 0.34;

  /**
   * Attach to the engine's context. Called once audio is unlocked, since a
   * context created outside a user gesture never leaves "suspended".
   */
  attach(ctx: AudioContext, destination: GainNode): void {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this._volume;
    this.out.connect(destination);
  }

  get attached(): boolean {
    return this.ctx !== null;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
    if (this.out && this.ctx) {
      this.out.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Speed the music up without re-pitching it.
   *
   * Used to lift the tempo as the level climbs, which is the cheapest way to
   * make a board feel like it's closing in. Takes effect at the next
   * scheduled note rather than retroactively, so nothing already queued jumps.
   */
  setTempoScale(scale: number): void {
    this.tempoScale = Math.max(0.5, Math.min(2.5, scale));
  }

  play(track: Track): void {
    if (!this.ctx || !this.out) return;
    this.track = track;
    this.cursorBeat = 0;
    this.cursorTime = this.ctx.currentTime + 0.08;
    this.stopTimer();
    this.pump();
    this.timer = window.setInterval(() => this.pump(), REFILL_MS);
  }

  stop(): void {
    this.stopTimer();
    this.track = null;
  }

  get playing(): boolean {
    return this.track !== null;
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Schedule everything that falls inside the lookahead window. */
  private pump(): void {
    const ctx = this.ctx;
    const track = this.track;
    if (!ctx || !track || !this.out) return;
    if (ctx.state !== "running") return;

    const horizon = ctx.currentTime + LOOKAHEAD_SECONDS;

    // A late timer leaves the cursor in the past; catching it up here stops
    // the loop trying to schedule a backlog of notes all at once.
    if (this.cursorTime < ctx.currentTime) {
      this.cursorTime = ctx.currentTime;
    }

    const totalBeats = beatsIn(track.lead);
    if (totalBeats <= 0) return;

    let guard = 0;
    while (this.cursorTime < horizon && guard < 256) {
      guard += 1;
      const secondsPerBeat = 60 / (track.bpm * this.tempoScale);

      const lead = noteAt(track.lead, this.cursorBeat);
      if (lead && lead[0] > 0) {
        this.blip(lead[0], this.cursorTime, lead[1] * secondsPerBeat, "square", 0.16);
      }

      if (track.bass) {
        const bass = noteAt(track.bass, this.cursorBeat);
        if (bass && bass[0] > 0) {
          this.blip(bass[0], this.cursorTime, bass[1] * secondsPerBeat, "triangle", 0.2);
        }
      }

      // Advance by the lead's own note length, so the melody's rhythm drives
      // the cursor and the bass is sampled against it.
      const step = lead ? lead[1] : 1;
      this.cursorBeat = (this.cursorBeat + step) % totalBeats;
      this.cursorTime += step * secondsPerBeat;
    }
  }

  private blip(
    freq: number,
    at: number,
    duration: number,
    type: OscillatorType,
    gain: number,
  ): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);

    // Leave a sliver of silence at the end of every note so repeated pitches
    // are heard as separate notes rather than one held tone.
    const sound = Math.max(0.03, duration * 0.86);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + sound);

    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + sound + 0.02);
  }
}

function beatsIn(notes: readonly Note[]): number {
  let total = 0;
  for (const [, beats] of notes) total += beats;
  return total;
}

/** The note sounding at a given beat offset within the loop. */
function noteAt(notes: readonly Note[], beat: number): Note | null {
  let cursor = 0;
  for (const note of notes) {
    if (beat < cursor + note[1] - 1e-9) return note;
    cursor += note[1];
  }
  return notes[notes.length - 1] ?? null;
}

// ----- Pitches -----

const A4 = 440;
/** Equal temperament, semitones from A4. */
function pitch(semitones: number): number {
  return A4 * Math.pow(2, semitones / 12);
}

const A3 = pitch(-12);
const C4 = pitch(-9);
const D4 = pitch(-7);
const E4 = pitch(-5);
const A4_ = pitch(0);
const B4 = pitch(2);
const C5 = pitch(3);
const D5 = pitch(5);
const E5 = pitch(7);
const F5 = pitch(8);
const G5 = pitch(10);
const A5 = pitch(12);
const REST = 0;

/**
 * "Korobeiniki" -- a Russian folk melody from 1861, in the public domain.
 *
 * This is our own arrangement of it: the melody transcribed into the note/beat
 * pairs above and voiced on a square lead over a triangle bass, synthesised
 * here at runtime. The tune is free to use; the famous handheld arrangement of
 * it is not, and none of it is reproduced here. Beats are eighth notes.
 */
export const KOROBEINIKI: Track = {
  bpm: 300, // eighth notes, so this is 150 quarter-note BPM
  lead: [
    [E5, 2], [B4, 1], [C5, 1], [D5, 2], [C5, 1], [B4, 1],
    [A4_, 2], [A4_, 1], [C5, 1], [E5, 2], [D5, 1], [C5, 1],
    [B4, 3], [C5, 1], [D5, 2], [E5, 2],
    [C5, 2], [A4_, 2], [A4_, 2], [REST, 2],

    [REST, 1], [D5, 2], [F5, 1], [A5, 2], [G5, 1], [F5, 1],
    [E5, 3], [C5, 1], [E5, 2], [D5, 1], [C5, 1],
    [B4, 2], [B4, 1], [C5, 1], [D5, 2], [E5, 2],
    [C5, 2], [A4_, 2], [A4_, 2], [REST, 2],
  ],
  /*
   * Sixty-four beats, the same as the lead.
   *
   * The scheduler wraps its cursor on the LEAD's length, so a bass longer than
   * the melody simply never reaches its second half -- the first draft was 128
   * beats and half of it was silently dead. Four beats per entry, one chord per
   * half-bar, following the melody's Am / Em / Dm shape.
   */
  bass: [
    [A3, 4], [E4, 4],   // E5 B4 C5 D5 C5 B4
    [A3, 4], [E4, 4],   // A4 A4 C5 E5 D5 C5
    [E4, 4], [E4, 4],   // B4 C5 D5 E5
    [A3, 4], [A3, 4],   // C5 A4 A4
    [D4, 4], [D4, 4],   // D5 F5 A5 G5 F5
    [A3, 4], [C4, 4],   // E5 C5 E5 D5 C5
    [E4, 4], [E4, 4],   // B4 B4 C5 D5 E5
    [A3, 4], [A3, 4],   // C5 A4 A4
  ],
};
