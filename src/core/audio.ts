/**
 * Procedural arcade audio.
 *
 * Every sound is synthesised from oscillators and filtered noise -- there are
 * no audio files in this project. That keeps the offline cache tiny, sidesteps
 * sample licensing entirely, and honestly gets closer to a real cabinet than
 * downloaded samples would: these chips *were* square waves and noise.
 */

export type SoundName =
  | "shoot"
  | "enemyHit"
  | "enemyExplode"
  | "playerExplode"
  | "captureBeam"
  | "rescue"
  | "waveStart"
  | "bossHit"
  | "extraLife"
  | "uiMove"
  | "uiSelect"
  // Mallard Challenge
  | "shotgunBlast"
  | "duckFlush"
  | "duckHit"
  | "dogLaugh"
  | "dogBark"
  | "roundClear"
  | "roundFail"
  // Riley's Slime Shop
  | "slimePour"
  | "slimeStir"
  | "slimeServe"
  | "orderIn"
  | "perfectOrder"
  | "shopClose"
  | "slimeStretch"
  | "slimeSquelch"
  | "prizePop"
  | "prizeRare"
  | "prizeLegendary"
  // Highway Hop
  | "frogHop"
  | "frogSplat"
  | "frogHome"
  | "levelClear";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private _muted = false;
  private _volume = 0.7;

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(
        value ? 0 : this._volume,
        this.ctx.currentTime,
        0.01,
      );
    }
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
    this.muted = this._muted; // re-apply through the same clamp
  }

  /**
   * Must be called from inside a real user gesture handler. Mobile Safari and
   * Chrome both refuse to start an AudioContext otherwise, and a context
   * created outside a gesture stays stuck in "suspended" forever.
   */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return; // no Web Audio: game stays playable, just silent
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this._volume;
      this.master.connect(this.ctx.destination);
      this.noise = this.buildNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Silence everything immediately -- used when the game is paused. */
  suspend(): void {
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || this._muted) return;
    if (this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;

    switch (name) {
      case "shoot":
        this.blip(t, "square", 880, 220, 0.09, 0.18);
        break;
      case "enemyHit":
        this.blip(t, "square", 320, 180, 0.05, 0.14);
        break;
      case "enemyExplode":
        this.burst(t, 0.28, 1800, 240, 0.32);
        break;
      case "playerExplode":
        this.burst(t, 0.9, 900, 60, 0.5);
        this.blip(t, "sawtooth", 180, 40, 0.8, 0.28);
        break;
      case "captureBeam":
        // Rising, wavering -- meant to read as "something has hold of you".
        this.blip(t, "sine", 180, 900, 1.1, 0.22, 14);
        break;
      case "rescue":
        this.arpeggio(t, [523, 659, 784, 1047], 0.075, "square", 0.24);
        break;
      case "waveStart":
        this.arpeggio(t, [392, 523], 0.11, "square", 0.2);
        break;
      case "bossHit":
        this.blip(t, "sawtooth", 140, 90, 0.16, 0.3);
        break;
      case "extraLife":
        this.arpeggio(t, [523, 659, 784, 1047, 1319], 0.06, "square", 0.22);
        break;
      case "uiMove":
        this.blip(t, "square", 440, 440, 0.04, 0.12);
        break;
      case "uiSelect":
        this.arpeggio(t, [660, 990], 0.05, "square", 0.16);
        break;

      // ----- Mallard Challenge -----
      case "shotgunBlast":
        // A noise burst gives it weight; the short high blip on top is the
        // transient "crack" that a pure low-pass sweep alone doesn't have.
        this.burst(t, 0.22, 2400, 140, 0.42);
        this.blip(t, "square", 1200, 200, 0.03, 0.16);
        break;
      case "duckFlush":
        // Two quick wobbling blips read as "wak-wak" without needing a
        // sampled quack.
        this.blip(t, "sawtooth", 520, 340, 0.09, 0.17, 26);
        this.blip(t + 0.11, "sawtooth", 480, 320, 0.09, 0.15, 26);
        break;
      case "duckHit":
        // Lighter and airier than enemyExplode -- a poof of feathers, not
        // a metal explosion.
        this.burst(t, 0.16, 2600, 700, 0.2);
        break;
      case "dogLaugh":
        // Three descending, wobbling blips -- the mocking "ha-ha-ha".
        this.blip(t, "square", 500, 400, 0.13, 0.2, 20);
        this.blip(t + 0.16, "square", 430, 340, 0.13, 0.2, 20);
        this.blip(t + 0.32, "square", 360, 280, 0.15, 0.2, 20);
        break;
      case "dogBark":
        this.blip(t, "sawtooth", 260, 160, 0.09, 0.24);
        break;
      case "roundClear":
        this.arpeggio(t, [440, 554, 659, 880], 0.08, "square", 0.22);
        break;
      case "roundFail":
        // A two-note falling sting -- the "aw, missed" beat.
        this.blip(t, "sawtooth", 300, 220, 0.18, 0.22);
        this.blip(t + 0.19, "sawtooth", 220, 120, 0.24, 0.22);
        break;

      // ----- Riley's Slime Shop -----
      case "slimePour":
        // A short *bloop* -- a sine sliding downward is about as close to the
        // sound of thick liquid landing as two oscillators get.
        this.blip(t, "sine", 620, 280, 0.11, 0.2);
        break;
      case "slimeStir":
        // Muted, low noise: a squelch rather than a note.
        this.burst(t, 0.13, 900, 220, 0.16);
        break;
      case "slimeServe":
        this.blip(t, "sine", 400, 720, 0.16, 0.2);
        this.burst(t, 0.14, 1400, 400, 0.14);
        break;
      case "orderIn":
        // The counter bell.
        this.arpeggio(t, [880, 1320], 0.06, "sine", 0.16);
        break;
      case "perfectOrder":
        // Deliberately the brightest sound in the game. It is the only
        // feedback that says "you nailed the colour", and it should be worth
        // chasing.
        this.arpeggio(t, [659, 880, 1047, 1319], 0.07, "square", 0.2);
        this.blip(t + 0.28, "sine", 1568, 1568, 0.22, 0.14);
        break;
      case "shopClose":
        this.arpeggio(t, [784, 659, 523], 0.13, "sine", 0.2);
        break;

      // ----- The squish screen -----
      case "slimeStretch":
        // A slow upward bend with a wobble on it. Pitch rising as the slime
        // is pulled is what sells "this is under tension" -- a flat tone
        // reads as a machine noise instead.
        this.blip(t, "sine", 220, 460, 0.26, 0.1, 9);
        break;
      case "slimeSquelch":
        // Wet and dull: noise swept hard downward, no pitched component. The
        // absence of a note is what makes it read as a substance rather than
        // an instrument.
        this.burst(t, 0.19, 1100, 130, 0.2);
        break;
      case "prizePop":
        // The cork-out-of-a-bottle moment: a very short noise transient with
        // a fast upward blip riding on top.
        this.burst(t, 0.05, 3000, 900, 0.22);
        this.blip(t + 0.01, "sine", 500, 1150, 0.12, 0.2);
        break;
      case "prizeRare":
        this.burst(t, 0.06, 3200, 1000, 0.2);
        this.arpeggio(t + 0.02, [784, 1047, 1319], 0.07, "sine", 0.2);
        break;
      // ----- Highway Hop -----
      case "frogHop":
        // Short upward blip. It fires on every single hop, so it has to be
        // brief and quiet enough to hear forty times a minute without grating.
        this.blip(t, "sine", 320, 620, 0.06, 0.12);
        break;
      case "frogSplat":
        // Dull and downward: a bump, not a crunch. Nothing dies here.
        this.blip(t, "square", 300, 90, 0.16, 0.2);
        this.burst(t, 0.12, 800, 160, 0.16);
        break;
      case "frogHome":
        this.arpeggio(t, [659, 880, 1175], 0.07, "sine", 0.2);
        break;
      case "levelClear":
        this.arpeggio(t, [523, 659, 784, 1047, 1319], 0.08, "square", 0.22);
        break;
      case "prizeLegendary":
        // Deliberately the longest and brightest sound in the arcade. A child
        // should be able to hear from the next room that something good just
        // came out of the slime.
        this.burst(t, 0.08, 3600, 1200, 0.22);
        this.arpeggio(t + 0.02, [523, 659, 784, 1047, 1319, 1568], 0.075, "square", 0.19);
        this.blip(t + 0.5, "sine", 2093, 2093, 0.42, 0.15, 7);
        break;
    }
  }

  /** A pitched tone that slides from `from` Hz to `to` Hz. */
  private blip(
    startTime: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gain: number,
    vibratoHz = 0,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, startTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, to),
      startTime + duration,
    );

    if (vibratoHz > 0) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = vibratoHz;
      lfoGain.gain.value = from * 0.12;
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(startTime);
      lfo.stop(startTime + duration);
    }

    // Fast attack, exponential decay -- the classic chip envelope.
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.exponentialRampToValueAtTime(gain, startTime + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(env).connect(master);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /** Filtered noise -- explosions. The filter sweep is what gives it weight. */
  private burst(
    startTime: number,
    duration: number,
    filterFrom: number,
    filterTo: number,
    gain: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise) return;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFrom, startTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(20, filterTo),
      startTime + duration,
    );

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, startTime);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter).connect(env).connect(master);
    src.start(startTime);
    src.stop(startTime + duration + 0.02);
  }

  private arpeggio(
    startTime: number,
    notes: number[],
    noteLength: number,
    type: OscillatorType,
    gain: number,
  ): void {
    notes.forEach((hz, i) => {
      this.blip(startTime + i * noteLength, type, hz, hz, noteLength * 1.6, gain);
    });
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 1.0);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
