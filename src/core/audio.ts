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
  | "uiSelect";

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
