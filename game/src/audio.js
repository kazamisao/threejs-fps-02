// Procedural sound: every effect is synthesised with WebAudio, so the game ships
// no audio files and makes no network request. Silent until the first click
// unlocks the AudioContext; shot mode never enables it.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    return buffer;
  }

  function burst(duration, frequency, type = 'lowpass', gainValue = 1) {
    if (!ensure()) return;
    try {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(duration);
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch { /* sound is cosmetic; never break the game */ }
  }

  function tone(frequency, duration, gainValue = 0.5, type = 'square') {
    if (!ensure()) return;
    try {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* cosmetic */ }
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(kind) {
      if (kind === 'rifle') burst(0.12, 1400, 'lowpass', 1);
      else if (kind === 'smg') burst(0.09, 1800, 'bandpass', 0.8);
      else burst(0.14, 900, 'lowpass', 0.9);
    },
    enemyShot() { burst(0.1, 1100, 'lowpass', 0.45); },
    hit() { tone(1400, 0.06, 0.35, 'sine'); },
    kill() { tone(880, 0.1, 0.4, 'sine'); tone(1320, 0.12, 0.3, 'sine'); },
    reload() { tone(520, 0.07, 0.3, 'square'); },
    empty() { tone(300, 0.05, 0.3, 'square'); },
    beep() { tone(1900, 0.08, 0.35, 'sine'); },
    explosion() { burst(0.7, 320, 'lowpass', 1.4); tone(70, 0.5, 0.6, 'sine'); },
    plant() { tone(1200, 0.12, 0.4, 'sine'); tone(1600, 0.16, 0.35, 'sine'); },
    roundWin() { [660, 880, 990].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.35, 'sine'), i * 130)); },
  };
}
