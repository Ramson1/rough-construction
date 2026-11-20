type MusicScene = "menu" | "match" | "results" | "off";

const NOTE: Record<string, number> = {
  A1: 55,
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98,
  A2: 110,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196,
  A3: 220,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392,
  A4: 440,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
};

/** Small Web Audio engine: adaptive music plus synthesized game SFX. */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private scene: MusicScene = "off";
  private timer: number | null = null;
  private step = 0;
  private nextStepTime = 0;
  private musicVolume = 0.42;
  private sfxVolume = 0.75;
  private intensity = 0;

  ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 20;
      compressor.ratio.value = 6;
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = "lowpass";
      this.musicFilter.frequency.value = 2200;
      this.musicGain.connect(this.musicFilter);
      this.musicFilter.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.master);
      this.noiseBuffer = this.makeNoiseBuffer(1.2);
      this.nextStepTime = this.ctx.currentTime;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.12);
    }
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.08);
    }
  }

  setScene(scene: MusicScene): void {
    if (this.scene === scene) return;
    this.scene = scene;
    this.step = 0;
    if (scene === "off") {
      this.stopMusicLoop();
      return;
    }
    const ctx = this.ensure();
    if (!ctx) return;
    if (this.musicFilter) {
      this.musicFilter.frequency.setTargetAtTime(scene === "match" ? 4200 : 2100, ctx.currentTime, 0.5);
    }
    this.startMusicLoop();
  }

  setIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
    if (this.musicFilter && this.ctx) {
      this.musicFilter.frequency.setTargetAtTime(1800 + this.intensity * 3400, this.ctx.currentTime, 0.35);
    }
  }

  private startMusicLoop(): void {
    if (this.timer !== null) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.nextStepTime = ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.scheduleMusic(), 90);
    this.scheduleMusic();
  }

  private stopMusicLoop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const stepDuration = this.scene === "match" ? 0.265 : 0.34;
    while (this.nextStepTime < ctx.currentTime + 0.35) {
      this.playStep(this.step, this.nextStepTime, stepDuration);
      this.step = (this.step + 1) % 16;
      this.nextStepTime += stepDuration;
    }
  }

  private playStep(step: number, time: number, stepDuration: number): void {
    if (!this.ctx || !this.musicGain) return;
    const match = this.scene === "match";
    const chordRoots = match ? [NOTE.A2, NOTE.F2, NOTE.C3, NOTE.G2] : [NOTE.A2, NOTE.F2, NOTE.C3, NOTE.G2];
    const scale = match
      ? [NOTE.A3, NOTE.C4, NOTE.D4, NOTE.E4, NOTE.G4, NOTE.A4]
      : [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.A4, NOTE.C5];
    const bar = Math.floor(step / 4) % 4;
    const root = chordRoots[bar];
    const beat = step % 4;

    if (beat === 0) {
      this.tone(root, stepDuration * 2.4, "sine", 0.08 * this.musicGain.gain.value, time, undefined, 0.02);
      this.tone(root * 2, stepDuration * 1.4, "triangle", 0.035 * this.musicGain.gain.value, time, undefined, 0.015);
    }
    if (match) {
      if (step === 0 || step === 6 || step === 10) {
        this.kick(time, 0.12 * this.musicGain.gain.value);
      }
      if (step === 4 || step === 12) {
        this.snare(time, 0.085 * this.musicGain.gain.value);
      }
      if (step % 2 === 1) {
        this.hat(time, 0.025 * this.musicGain.gain.value);
      }
    }

    // Arpeggio.
    if (step % 2 === 0 || this.intensity > 0.4) {
      const note = scale[(step * 3 + bar * 2) % scale.length];
      this.tone(
        note,
        stepDuration * 0.8,
        match ? "square" : "triangle",
        (match ? 0.035 : 0.024) * this.musicGain.gain.value,
        time,
        undefined,
        0.01,
      );
      if (match) {
        this.tone(note * 2, stepDuration * 0.5, "sine", 0.018 * this.musicGain.gain.value, time + 0.02);
      }
    }

    // Pad every bar.
    if (beat === 0) {
      const third = bar === 0 ? NOTE.C4 : bar === 1 ? NOTE.A3 : bar === 2 ? NOTE.E4 : NOTE.B3;
      this.tone(root * 1.5, stepDuration * 4.2, "sine", 0.03 * this.musicGain.gain.value, time, undefined, 0.5);
      this.tone(third, stepDuration * 4.0, "sine", 0.022 * this.musicGain.gain.value, time, undefined, 0.55);
    }
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gainValue: number,
    when: number,
    slideTo?: number,
    attack = 0.008,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), when);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), when + duration);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  private kick(time: number, gainValue: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(125, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.14);
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private snare(time: number, gainValue: number): void {
    this.noise(time, 0.13, gainValue, 1900, "bandpass");
  }

  private hat(time: number, gainValue: number): void {
    this.noise(time, 0.045, gainValue, 7200, "highpass");
  }

  private noise(
    time: number,
    duration: number,
    gainValue: number,
    frequency: number,
    filterType: BiquadFilterType,
    destination?: AudioNode,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination || this.musicGain || ctx.destination);
    source.start(time);
    source.stop(time + duration + 0.02);
  }

  // --- SFX ---------------------------------------------------------------

  shoot(weapon: "rifle" | "pistol"): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const big = weapon === "rifle";
    const source = ctx.createBufferSource();
    if (this.noiseBuffer) {
      source.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(big ? 2700 : 2100, now);
      filter.frequency.exponentialRampToValueAtTime(450, now + (big ? 0.13 : 0.09));
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(big ? 0.65 : 0.48, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      source.start(now);
      source.stop(now + 0.2);
    }
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(big ? 145 : 185, now);
    osc.frequency.exponentialRampToValueAtTime(big ? 48 : 70, now + 0.11);
    oscGain.gain.setValueAtTime(0.34, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(oscGain);
    oscGain.connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  knifeSwing(): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.noise(now, 0.14, 0.2, 3200, "bandpass", this.sfxGain);
  }

  reload(): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.clickSound(now, 0.1);
    this.clickSound(now + 0.32, 0.08);
    if (this.noiseBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.13, now + 0.55);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      source.connect(gain);
      gain.connect(this.sfxGain);
      source.start(now + 0.55);
      source.stop(now + 0.7);
    }
  }

  empty(): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    this.clickSound(ctx.currentTime, 0.08);
  }

  hit(headshot = false): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(headshot ? 1250 : 760, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 780 : 520, now + 0.1);
    gain.gain.setValueAtTime(headshot ? 0.22 : 0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  eliminate(): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.tone(330, 0.18, "sawtooth", 0.1, now, 220);
    this.tone(220, 0.3, "triangle", 0.08, now + 0.12, 110);
    this.noise(now, 0.3, 0.12, 800, "lowpass", this.sfxGain);
  }

  hurt(): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    this.noise(now, 0.2, 0.2, 500, "lowpass", this.sfxGain);
    this.tone(110, 0.16, "sine", 0.12, now, 65);
  }

  footstep(): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    this.noise(ctx.currentTime, 0.07, 0.055, 380, "lowpass", this.sfxGain);
  }

  jump(): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    this.noise(ctx.currentTime, 0.1, 0.05, 650, "bandpass", this.sfxGain);
  }

  click(): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    this.clickSound(ctx.currentTime, 0.06);
  }

  countdown(final = false): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    this.tone(final ? 880 : 520, 0.14, "square", 0.07, ctx.currentTime, undefined, 0.005);
  }

  private clickSound(time: number, volume: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1600, time);
    osc.frequency.exponentialRampToValueAtTime(900, time + 0.03);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(time);
    osc.stop(time + 0.06);
  }

  dispose(): void {
    this.stopMusicLoop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
