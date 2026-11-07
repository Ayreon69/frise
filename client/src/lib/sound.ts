// Sons synthétisés (Web Audio), aucun fichier à charger : carte qui glisse, carton qui se retourne,
// petit carillon de musée quand c'est juste, note grave quand c'est faux, gong de la victoire.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  /** Une carte qu'on prend en main. */
  pick: () => noise(0.05, { gain: 0.16, freq: 3200, q: 1.5, fade: 4 }),
  /** Une carte qui glisse sur la table. */
  slide: () => noise(0.22, { gain: 0.14, freq: 900, sweep: 3800, q: 0.8, fade: 1.5 }),
  /** Le carton qui se retourne : deux claquements secs. */
  flip: () => {
    noise(0.025, { gain: 0.22, freq: 2400, q: 2, fade: 6 });
    noise(0.025, { gain: 0.18, freq: 1800, q: 2, fade: 6, delay: 0.07 });
  },
  /** C'est juste : un petit carillon de deux notes qui monte. */
  good: () => {
    tone(783.99, 0.6, { type: 'sine', gain: 0.06, attack: 0.01 });
    tone(1174.66, 0.8, { type: 'sine', gain: 0.05, delay: 0.11, attack: 0.01 });
    tone(2349.3, 0.4, { type: 'sine', gain: 0.012, delay: 0.11 });
  },
  /** C'est faux : une note grave qui retombe. */
  bad: () => {
    tone(220, 0.38, { type: 'triangle', gain: 0.07, slide: 0.72 });
    noise(0.12, { gain: 0.08, freq: 300, q: 1, fade: 3 });
  },
  /** C'est ton tour : une clochette. */
  turn: () => {
    tone(1318.5, 0.5, { type: 'sine', gain: 0.045 });
    tone(1975.5, 0.35, { type: 'sine', gain: 0.018, delay: 0.05 });
  },
  /** Un tap discret. */
  tap: () => tone(660, 0.05, { type: 'triangle', gain: 0.025 }),
  /** Une des dernières secondes du tour. */
  tick: () => noise(0.015, { gain: 0.12, freq: 4200, q: 4, fade: 8 }),
  /** Dernier tour, départage : deux coups graves. */
  alert: () => {
    tone(392, 0.4, { type: 'triangle', gain: 0.05 });
    tone(523.25, 0.5, { type: 'triangle', gain: 0.05, delay: 0.18 });
  },
  /** Fin de partie : un gong et une montée, ou une descente. */
  fanfare: (good: boolean) => {
    if (good) {
      tone(130.8, 2.2, { type: 'sine', gain: 0.09, attack: 0.004 });
      tone(261.6, 1.6, { type: 'sine', gain: 0.04 });
    }
    const notes = good ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [392, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 1 : 0.22, { type: 'triangle', gain: 0.055, delay: 0.15 + i * 0.13 }));
  },
  /** Début de partie : les cartes sont distribuées. */
  deal: (n = 5) => {
    for (let i = 0; i < n; i++) noise(0.06, { gain: 0.12, freq: 1600 + i * 200, q: 1.2, fade: 3, delay: i * 0.09 });
  },
};
