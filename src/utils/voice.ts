import { supabase, ensureCloudUser, apiHostRoot } from './supabaseClient';
import { emitVoiceBurst } from './socket';
import { uploadVoiceClip } from './voiceWake';

/**
 * Walkie-talkie voice bursts: record → live socket relay → auto-play LOUD
 * on every squad phone. Heard = vanished. Nothing stored anywhere.
 */

export const VOICE_MAX_MS = 15000;
/** 250ms slices — the encoder emits data immediately (less start clipping), and blobs stay small. */
const RECORDER_SLICE_MS = 250;
/** 64kbps is plenty for voice — smaller blob = faster socket transfer = lower latency. */
const VOICE_BITRATE = 64000;

// Ek baar user interact kare → audio policy unlock (receiver playback block na ho)
let audioUnlocked = false;
function unlockPlayback(): void {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const warm = () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      void ctx.resume?.();
      window.setTimeout(() => void ctx.close().catch(() => undefined), 1000);
    } catch { /* ignore */ }
  };
  try {
    window.addEventListener('pointerdown', warm, { once: true });
    window.addEventListener('keydown', warm, { once: true });
  } catch { /* ignore */ }
}
if (typeof window !== 'undefined') unlockPlayback();

export function startVoiceRecorder(
  onStop: (blob: Blob) => void,
  onError: (msg: string) => void,
  onStart?: () => void
): () => void {
  let recorder: MediaRecorder | null = null;
  let stopped = false;
  const chunks: BlobPart[] = [];

  navigator.mediaDevices
    .getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    .then((stream) => {
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const opts: MediaRecorderOptions = {};
      if (mime) opts.mimeType = mime;
      opts.audioBitsPerSecond = VOICE_BITRATE;
      recorder = mime || opts.audioBitsPerSecond
        ? new MediaRecorder(stream, opts)
        : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onStop(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
      };
      recorder.start(RECORDER_SLICE_MS);
      onStart?.();
      setTimeout(() => {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      }, VOICE_MAX_MS);
    })
    .catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : '';
      onError(name === 'NotAllowedError'
        ? 'Microphone permission denied. Allow microphone access in Android Settings and retry.'
        : 'Microphone unavailable. Check Android microphone permission and retry.');
    });

  return () => {
    stopped = true;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch { /* already stopped */ }
  };
}

/** Live send: blob → data URL → socket room (receivers auto-play). */
export async function sendVoiceViaSocket(
  tripId: string,
  byName: string,
  blob: Blob
): Promise<void> {
  // Reject empty/too-short recordings immediately — avoids "sent but heard nothing" confusion
  if (!blob || blob.size < 1500) throw new Error('Recording too short — hold and speak, then tap send');
  const user = await ensureCloudUser();
  const voiceUrl: string = await new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('audio read failed'));
      reader.readAsDataURL(blob);
    } catch {
      reject(new Error('audio read failed'));
    }
  });
  if (!voiceUrl.startsWith('data:audio')) throw new Error('empty recording — speak closer to the mic');
  // Same clipId over socket + POST so the server fans out exactly once.
  const clipId = makeClipId();
  const apiBase = apiHostRoot();
  // Offline members: store for 5 min so closed apps can fetch + play (never blocks send).
  uploadVoiceClip(tripId, clipId, voiceUrl, user.uid, byName, apiBase);
  await emitVoiceBurst(tripId, {
    voiceUrl,
    senderId: user.uid,
    senderName: byName,
    clipId,
    apiBase,
  });
}

/** Client-side clip id (shared by socket + upload paths for server dedupe). */
function makeClipId(): string {
  try {
    const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID().replace(/-/g, '').slice(0, 24);
  } catch { /* fallback below */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export async function sendVoiceBurst(
  tripId: string,
  byName: string,
  blob: Blob
): Promise<void> {
  // Legacy storage path is stubbed in this build — live socket relay instead.
  return sendVoiceViaSocket(tripId, byName, blob);
}

/** Play at full volume + vibrate. Resolves when finished. */
export function playVoiceLoud(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      audio.volume = 1;
      audio.preload = 'auto';
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      setTimeout(resolve, 30000);
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => resolve());
    } catch {
      resolve();
    }
    try {
      navigator.vibrate?.([400, 150, 400]);
    } catch { /* no vibrator */ }
  });
}

export async function deleteVoiceFile(path: string): Promise<void> {
  try {
    await supabase.storage.from('voice').remove([path]);
  } catch { /* already gone */ }
}

/** Phone-ringing siren, generated locally, no file. Used by siren + push handler. */
export function ringLocalSiren(durationMs = 3000): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    void ctx.resume?.();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.25;
    const t0 = ctx.currentTime;
    const steps = Math.ceil(durationMs / 400);
    for (let i = 0; i < steps; i++) {
      osc.frequency.setValueAtTime(i % 2 === 0 ? 650 : 950, t0 + i * 0.4);
    }
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000);
    setTimeout(() => void ctx.close().catch(() => undefined), durationMs + 300);
  } catch { /* audio blocked */ }
  try {
    navigator.vibrate?.([600, 200, 600, 200, 600]);
  } catch { /* no vibrator */ }
}
