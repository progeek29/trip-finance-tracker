import { supabase, ensureCloudUser } from './supabaseClient';
import { sendPush } from './push';

/**
 * Walkie-talkie voice bursts: record → Storage → push → auto-play LOUD
 * on every squad phone → file deleted. Heard = vanished. Nothing retained.
 */

export const VOICE_MAX_MS = 15000;

export function startVoiceRecorder(
  onStop: (blob: Blob) => void,
  onError: (msg: string) => void,
  onStart?: () => void
): () => void {
  let recorder: MediaRecorder | null = null;
  let stopped = false;
  const chunks: BlobPart[] = [];

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onStop(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
      };
      recorder.start();
      onStart?.();
      setTimeout(() => {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      }, VOICE_MAX_MS);
    })
    .catch(() => onError('Microphone blocked. Allow mic access and retry.'));

  return () => {
    stopped = true;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch { /* already stopped */ }
  };
}

export async function sendVoiceBurst(
  tripId: string,
  byName: string,
  blob: Blob
): Promise<void> {
  const user = await ensureCloudUser();
  const id = `v_${Date.now().toString(36)}`;
  const path = `voice/${tripId}/${id}.webm`;

  const { error } = await supabase.storage
    .from('voice')
    .upload(path, blob, { contentType: blob.type || 'audio/webm', upsert: false });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from('voice').getPublicUrl(path);

  await sendPush({
    tripId,
    kind: 'voice',
    title: `${byName} is talking`,
    body: 'Tap to listen — vanishes after playing',
    voiceUrl: urlData.publicUrl,
    voicePath: path,
    senderUid: user.uid,
  });
}

/** Play at full volume + vibrate. Resolves when finished. */
export function playVoiceLoud(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      audio.volume = 1;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      setTimeout(resolve, 30000);
      void audio.play().catch(() => resolve());
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
