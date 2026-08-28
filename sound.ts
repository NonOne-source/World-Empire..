// Tiny sound-effect helper using the Web Audio API directly — no audio files to host or download,
// which matters here since everything gets uploaded through GitHub's web UI. Each function just
// programs a couple of oscillator "beeps" and lets them fade out.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function beep(freq: number, startOffset: number, duration: number, type: OscillatorType, gainPeak: number) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = audio.currentTime + startOffset;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainPeak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export const sounds = {
  diceRoll() {
    beep(180, 0, 0.08, "square", 0.05);
    beep(220, 0.07, 0.08, "square", 0.05);
    beep(260, 0.14, 0.1, "square", 0.05);
  },
  cash() {
    beep(660, 0, 0.09, "sine", 0.06);
    beep(880, 0.08, 0.14, "sine", 0.06);
  },
  error() {
    beep(140, 0, 0.18, "sawtooth", 0.05);
  },
  notify() {
    beep(520, 0, 0.1, "triangle", 0.05);
  },
};
