// Procedural suspense audio — Web Audio only, no assets, no dependencies.
// Muted by default; the toggle click doubles as the user gesture that
// autoplay policy requires. Everything here is deliberately quiet: a low
// drone that rises with dread, a distant bell at the last omen, a bass
// thump on impact. The context is suspended while muted so a muted page
// costs nothing.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let droneGain: GainNode | null = null;
let droneFilter: BiquadFilterNode | null = null;
let enabled = false;
let lastDroneLevel = -1;

export function isEnabled(): boolean {
  return enabled;
}

export function setEnabled(on: boolean): void {
  enabled = on;
  if (on) {
    if (!ctx) initGraph();
    ctx!.resume();
  } else if (ctx) {
    ctx.suspend();
  }
}

function initGraph(): void {
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 1.0;
  master.connect(ctx.destination);

  // Drone: three slightly-detuned low oscillators through a lowpass. The
  // beat frequency between them is the unease.
  droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 130;
  droneFilter.Q.value = 1.5;
  droneGain.connect(droneFilter);
  droneFilter.connect(master);

  const voices: Array<{ freq: number; type: OscillatorType; gain: number }> = [
    { freq: 55.0, type: 'triangle', gain: 0.50 },
    { freq: 55.7, type: 'triangle', gain: 0.45 },
    { freq: 110.4, type: 'sine', gain: 0.22 },
  ];
  for (const v of voices) {
    const osc = ctx.createOscillator();
    osc.type = v.type;
    osc.frequency.value = v.freq;
    const g = ctx.createGain();
    g.gain.value = v.gain;
    osc.connect(g);
    g.connect(droneGain);
    osc.start();
  }
}

// Called every frame with the current dread level (0..1).
export function setDread(dread: number): void {
  if (!ctx || !enabled || !droneGain || !droneFilter) return;
  if (Math.abs(dread - lastDroneLevel) < 0.005) return;
  lastDroneLevel = dread;
  // Silent below a floor, then a gentle power curve; never loud.
  const v = dread < 0.12 ? 0 : Math.pow((dread - 0.12) / 0.88, 1.4) * 0.16;
  droneGain.gain.setTargetAtTime(v, ctx.currentTime, 0.9);
  // The filter opens slowly as dread builds — the drone seems to approach.
  droneFilter.frequency.setTargetAtTime(130 + dread * 220, ctx.currentTime, 1.2);
}

// A distant bell — used sparingly, at the final omen stage.
export function omenBell(): void {
  if (!ctx || !enabled || !master) return;
  const t = ctx.currentTime;
  for (const [freq, gain] of [[392, 0.05], [587, 0.025], [983, 0.012]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.004);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 5);
  }
}

// Impact: a bass thump plus a filtered noise breath, scaled by severity.
export function impact(severity: number): void {
  if (!ctx || !enabled || !master) return;
  const t = ctx.currentTime;
  const s = 0.4 + 0.6 * Math.min(1, severity / 0.7);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(52, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22 * s, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + 2);

  const len = Math.floor(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const nf = ctx.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.setValueAtTime(900, t);
  nf.frequency.exponentialRampToValueAtTime(120, t + 1.0);
  const ng = ctx.createGain();
  ng.gain.value = 0.07 * s;
  src.connect(nf);
  nf.connect(ng);
  ng.connect(master);
  src.start(t);
}
