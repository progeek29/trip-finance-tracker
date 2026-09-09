/** Local-only soft chime — Web Audio synthesized, zero assets, offline-safe. */

let ctx: AudioContext | null = null;
let sirenTimer: number | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Browsers block audio without a user gesture — call once on first interaction. */
export function unlockAudio(): void {
  const unlock = () => {
    const ac = ensureCtx();
    if (ac && ac.state === 'suspended') void ac.resume();
  };
  try {
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  } catch { /* ignore */ }
}

/** Premium metallic chime: 880Hz (A5) sine, fast attack + linear decay. */
export function playChime(): void {
  const ac = ensureCtx();
  if (!ac) return;
  try {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.85);
  } catch { /* audio unavailable */ }
}

/** Emergency loop — original 650/950 alarm tone on ONE shared context.
 *  ONE loop only (3 blasts ≈ 4.5s), then auto-silent. Visuals stay till stop. */
export function startSirenLoop(): void {
  stopSirenLoop();
  // Sync call inside the tap gesture → context actually starts running
  ensureCtx();
  let n = 0;
  sirenBlast();
  n += 1;
  try {
    sirenTimer = window.setInterval(() => {
      n += 1;
      if (n >= 3) {
        stopSirenLoop();
        return;
      }
      sirenBlast();
    }, 1500);
  } catch { /* ignore */ }
  try {
    navigator.vibrate?.([500, 200, 500, 200, 500]);
  } catch { /* no vibrator */ }
}

/** Single ~1.4s two-tone blast on the shared context. */
function sirenBlast(): void {
  const ac = ensureCtx();
  if (!ac) return;
  try {
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      osc.frequency.setValueAtTime(i % 2 === 0 ? 650 : 950, t0 + i * 0.35);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
    gain.gain.setValueAtTime(0.22, t0 + 1.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 1.45);
  } catch { /* audio unavailable */ }
}

/** Receiver-side: ~3s alarm burst on the shared context + vibrate. */
export function playReceiverSiren(): void {
  sirenBlast();
  try {
    navigator.vibrate?.([600, 200, 600, 200, 600]);
  } catch { /* no vibrator */ }
}

export function stopSirenLoop(): void {
  if (sirenTimer !== null) {
    window.clearInterval(sirenTimer);
    sirenTimer = null;
  }
}
