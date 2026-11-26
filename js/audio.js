/**
 * PRAIRIE TOWN: Coterie & Burrow
 * Zero-dependency Web Audio API procedural sound synthesizer & nature ambience engine.
 */
(function (root) {
  'use strict';

  const PT = (root.PT = root.PT || {});

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.sfxGain = null;
      this.ambGain = null;

      this.windGain = null;
      this.windFilter = null;
      this.rainGain = null;
      this.rainFilter = null;
      this.ambInitialized = false;

      this.settings = {
        muted: false,
        masterVol: 0.8,
        sfxVol: 0.85,
        ambVol: 0.65
      };

      this._lastDigTime = 0;
      this._lastTrimTime = 0;
      this._birdTimer = 4;
    }

    ensureContext() {
      if (typeof window === 'undefined') return false;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;

      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.ambGain = this.ctx.createGain();

        this.sfxGain.connect(this.masterGain);
        this.ambGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);

        this._applyVolumes();
        this._initAmbience();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }

    updateSettings(partial) {
      Object.assign(this.settings, partial);
      this._applyVolumes();
    }

    _applyVolumes() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const master = this.settings.muted ? 0 : this.settings.masterVol;
      this.masterGain.gain.setTargetAtTime(master, now, 0.04);
      this.sfxGain.gain.setTargetAtTime(this.settings.sfxVol, now, 0.04);
      this.ambGain.gain.setTargetAtTime(this.settings.ambVol, now, 0.04);
    }

    _createNoiseBuffer(seconds) {
      const length = Math.floor(this.ctx.sampleRate * seconds);
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.12) * 0.35;
      }
      return buf;
    }

    _initAmbience() {
      if (this.ambInitialized || !this.ctx) return;
      this.ambInitialized = true;

      const noiseBuf = this._createNoiseBuffer(4.0);
      this.sharedShortNoise = this._createNoiseBuffer(0.25);

      // Gentle prairie wind sweeping through grass
      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = noiseBuf;
      windSrc.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 380;
      this.windFilter.Q.value = 1.4;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.14;

      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ambGain);
      windSrc.start();

      // Storm rain layer
      const rainSrc = this.ctx.createBufferSource();
      rainSrc.buffer = noiseBuf;
      rainSrc.loop = true;

      this.rainFilter = this.ctx.createBiquadFilter();
      this.rainFilter.type = 'highpass';
      this.rainFilter.frequency.value = 1100;

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;

      rainSrc.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.ambGain);
      rainSrc.start();
    }

    updateAmbience(windSpeed, rainAmount, isPaused, dt) {
      if (!this.ctx || !this.ambInitialized) return;
      const now = this.ctx.currentTime;
      const pauseScale = isPaused ? 0.25 : 1.0;

      const targetWindGain = (0.06 + Math.min(1.6, windSpeed) * 0.12) * pauseScale;
      const targetWindFreq = 260 + Math.min(1.8, windSpeed) * 320 + Math.sin(now * 0.7) * 65;
      this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.25);
      this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.25);

      const targetRainGain = rainAmount * 0.26 * pauseScale;
      this.rainGain.gain.setTargetAtTime(targetRainGain, now, 0.4);

      if (!isPaused && rainAmount < 0.2 && !this.settings.muted) {
        this._birdTimer -= dt;
        if (this._birdTimer <= 0) {
          this._birdTimer = 6 + Math.random() * 10;
          this._playDistantMeadowBird();
        }
      }
    }

    _playDistantMeadowBird() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const base = 1800 + Math.random() * 700;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.25, t + 0.08);
      osc.frequency.exponentialRampToValueAtTime(base * 0.92, t + 0.18);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.025, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(this.ambGain);
      osc.start(t);
      osc.stop(t + 0.24);
    }

    // Semantic Call 1: High-Pitch Dive Chirp (Hawk)
    playHawkChirp() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      [0, 0.13].forEach((offset) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2200, t + offset);
        osc.frequency.exponentialRampToValueAtTime(3450, t + offset + 0.035);
        osc.frequency.exponentialRampToValueAtTime(1650, t + offset + 0.11);

        gain.gain.setValueAtTime(0.0001, t + offset);
        gain.gain.linearRampToValueAtTime(0.26, t + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.12);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t + offset);
        osc.stop(t + offset + 0.13);
      });
    }

    // Semantic Call 2: Rhythmic Ground Bark (Coyote)
    playCoyoteBark() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      [0, 0.17, 0.34].forEach((offset, idx) => {
        const osc = this.ctx.createOscillator();
        const mod = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        const f0 = idx === 1 ? 1050 : 900;
        osc.frequency.setValueAtTime(f0, t + offset);
        osc.frequency.exponentialRampToValueAtTime(1420, t + offset + 0.03);
        osc.frequency.exponentialRampToValueAtTime(580, t + offset + 0.11);

        mod.frequency.value = 48;
        modGain.gain.value = 90;
        mod.connect(modGain);
        modGain.connect(osc.frequency);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1400;
        filter.Q.value = 2.0;

        gain.gain.setValueAtTime(0.0001, t + offset);
        gain.gain.linearRampToValueAtTime(0.24, t + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.12);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(t + offset);
        mod.start(t + offset);
        osc.stop(t + offset + 0.13);
        mod.stop(t + offset + 0.13);
      });
    }

    // Semantic Call 3: Long Low Whistle (Human)
    playHumanWhistle() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1180, t);
      osc.frequency.linearRampToValueAtTime(980, t + 0.25);
      osc.frequency.exponentialRampToValueAtTime(740, t + 0.62);

      lfo.frequency.value = 14;
      lfoGain.gain.value = 25;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.24, t + 0.05);
      gain.gain.setValueAtTime(0.21, t + 0.45);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 0.68);
      lfo.stop(t + 0.68);
    }

    playSemanticCall(callId) {
      if (callId === 'hawk_chirp') this.playHawkChirp();
      else if (callId === 'coyote_bark') this.playCoyoteBark();
      else this.playHumanWhistle();
    }

    playToothTouch() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      [0, 0.12].forEach((off, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        const f = i === 0 ? 1320 : 1680;
        osc.frequency.setValueAtTime(f, t + off);
        osc.frequency.exponentialRampToValueAtTime(f * 1.18, t + off + 0.07);
        gain.gain.setValueAtTime(0.0001, t + off);
        gain.gain.linearRampToValueAtTime(0.16, t + off + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.11);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t + off);
        osc.stop(t + off + 0.12);
      });
    }

    playDig() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      if (t - this._lastDigTime < 0.2) return;
      this._lastDigTime = t;

      const src = this.ctx.createBufferSource();
      src.buffer = this.sharedShortNoise || (this.sharedShortNoise = this._createNoiseBuffer(0.25));

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(520 + Math.random() * 180, t);
      filter.Q.value = 1.6;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(t);
    }

    playTrimGrass() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      if (t - this._lastTrimTime < 0.16) return;
      this._lastTrimTime = t;

      const src = this.ctx.createBufferSource();
      src.buffer = this.sharedShortNoise || (this.sharedShortNoise = this._createNoiseBuffer(0.25));

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 2200;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start(t);
    }

    playDive() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.16);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.18);
    }

    playBuildComplete() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      [440, 554.37, 659.25].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.06);
        gain.gain.setValueAtTime(0.001, t + i * 0.06);
        gain.gain.linearRampToValueAtTime(0.13, t + i * 0.06 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.24);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t + i * 0.06);
        osc.stop(t + i * 0.06 + 0.25);
      });
    }

    playRankUp() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      [392, 493.88, 587.33, 783.99].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.09);
        gain.gain.setValueAtTime(0.001, t + i * 0.09);
        gain.gain.linearRampToValueAtTime(0.17, t + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.42);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.44);
      });
    }

    playFailAlert() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.linearRampToValueAtTime(155, t + 0.26);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.3);
    }

    playClick() {
      if (!this.ensureContext()) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(680, t);
      osc.frequency.exponentialRampToValueAtTime(420, t + 0.045);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.055);
    }
  }

  PT.AudioEngine = AudioEngine;
})(window);
