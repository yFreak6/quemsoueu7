// Efeitos sonoros sintetizados com a Web Audio API: nenhum arquivo de áudio externo.
// O áudio só é criado depois de um gesto do usuário (regra de autoplay dos navegadores).

let ctx = null;
let master = null;
let unlocked = false;
let enabled = true;
try {
  enabled = localStorage.getItem('qse:sound') !== 'off';
} catch {
  /* sem armazenamento: som ligado por padrão */
}
const subscribers = new Set();
const lastPlayed = new Map();

function ensure() {
  if (!unlocked) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const limiter = ctx.createDynamicsCompressor(); // evita estourar quando dois sons se encontram
    master.connect(limiter);
    limiter.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** Libera o áudio. Chamado a cada gesto do usuário; é barato depois da primeira vez. */
export function unlock() {
  unlocked = true;
  ensure();
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { passive: true });
}

function tone(c, { f, t = 0, d = 0.15, type = 'sine', v = 0.25, to = null, attack = 0.005 }) {
  const start = c.currentTime + t;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + d);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(v, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
  osc.connect(gain);
  gain.connect(master);
  osc.start(start);
  osc.stop(start + d + 0.03);
}

function noise(c, { t = 0, d = 0.2, v = 0.3, lp = 900 }) {
  const start = c.currentTime + t;
  const len = Math.max(1, Math.floor(c.sampleRate * d));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const gain = c.createGain();
  src.buffer = buf;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(lp, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, lp / 4), start + d);
  gain.gain.setValueAtTime(v, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(start);
}

/** Envolve um efeito: respeita o mute e ignora disparos duplicados em poucos milissegundos. */
const effect = (name, minGapMs, fn) => (...args) => {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -1e9) < minGapMs) return;
  lastPlayed.set(name, now);
  fn(c, ...args);
};

export const sfx = {
  /** Clique curto e agradável. */
  click: effect('click', 40, (c) => tone(c, { f: 880, to: 620, d: 0.05, type: 'triangle', v: 0.1 })),

  /** Início do turno: notificação de duas notas na sua vez, uma nota discreta nas dos outros. */
  turnStart: effect('turn', 300, (c, mine) => {
    if (mine) {
      tone(c, { f: 659, d: 0.16, type: 'sine', v: 0.22 });
      tone(c, { f: 988, t: 0.12, d: 0.28, type: 'sine', v: 0.22 });
    } else {
      tone(c, { f: 523, d: 0.14, type: 'sine', v: 0.08 });
    }
  }),

  /** Tique-taque dos últimos 5 segundos: cada segundo mais agudo e mais forte. */
  tick: effect('tick', 200, (c, secondsLeft, mine = true) => {
    const i = Math.min(4, Math.max(0, 5 - secondsLeft));
    const loud = (0.08 + i * 0.03) * (mine ? 1 : 0.5);
    tone(c, { f: 760 + i * 110, d: 0.05, type: 'square', v: loud, attack: 0.002 });
    tone(c, { f: 380 + i * 55, t: 0.5, d: 0.04, type: 'square', v: loud * 0.5, attack: 0.002 });
  }),

  /** Erro de chute: buzina curta e grave. */
  error: effect('error', 300, (c, delay = 0) => {
    tone(c, { f: 220, t: delay, to: 150, d: 0.26, type: 'sawtooth', v: 0.14 });
    tone(c, { f: 165, t: delay + 0.12, to: 110, d: 0.24, type: 'sawtooth', v: 0.12 });
  }),

  /** Perda de vida: impacto surdo (ruído filtrado + pancada grave). */
  lifeLost: effect('life', 300, (c, delay = 0) => {
    noise(c, { t: delay, d: 0.28, v: 0.32, lp: 1100 });
    tone(c, { f: 130, t: delay, to: 45, d: 0.36, type: 'sine', v: 0.4 });
  }),

  /** Eliminação: quatro notas descendentes. */
  eliminated: effect('elim', 600, (c, delay = 0) => {
    [392, 330, 262, 196].forEach((f, i) => tone(c, { f, t: delay + i * 0.17, d: 0.32, type: 'triangle', v: 0.2 }));
  }),

  /** Vitória: arpejo ascendente e acorde final. */
  victory: effect('win', 1500, (c, mine = true) => {
    const k = mine ? 1 : 0.55;
    [523, 659, 784, 1047].forEach((f, i) => tone(c, { f, t: i * 0.12, d: 0.3, type: 'triangle', v: 0.22 * k }));
    [523, 659, 784].forEach((f) => tone(c, { f, t: 0.52, d: 0.9, type: 'sine', v: 0.12 * k }));
  }),

  /** Ninguém acertou: acorde menor, mais baixo. */
  defeat: effect('lose', 1500, (c) => {
    [220, 262, 330].forEach((f) => tone(c, { f, t: 0, d: 0.7, type: 'triangle', v: 0.12 }));
    tone(c, { f: 110, t: 0.2, to: 82, d: 0.6, type: 'sine', v: 0.2 });
  }),
};

export const isSoundEnabled = () => enabled;

export function setSoundEnabled(on) {
  enabled = !!on;
  try {
    localStorage.setItem('qse:sound', enabled ? 'on' : 'off');
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  subscribers.forEach((fn) => fn(enabled));
}

export function subscribeSound(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Som de clique em qualquer botão da interface (um único listener global). */
export function installClickSounds() {
  document.addEventListener('click', (e) => {
    const button = e.target instanceof Element ? e.target.closest('button') : null;
    if (button && !button.disabled) sfx.click();
  });
}
