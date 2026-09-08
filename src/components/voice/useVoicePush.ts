import { useEffect, useRef, useState } from 'react';
import { startVoiceRecorder, sendVoiceBurst, VOICE_MAX_MS } from '../../utils/voice';

/**
 * Shared walkie-talkie logic: recording starts ONLY after mic is granted
 * (fixes stuck-recording), elapsed timer, 15s auto-stop.
 */
export function useVoicePush(tripId: string, byName: string) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  const statusTimer = useRef<number | null>(null);

  const clearStatusLater = () => {
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      stopTimer();
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      stopRef.current?.();
    },
    []
  );

  const toggle = () => {
    if (recording) {
      stopRef.current?.();
      return;
    }
    setStatus('Requesting mic…');
    setElapsed(0);
    stopRef.current = startVoiceRecorder(
      async (blob) => {
        stopRef.current = null;
        setRecording(false);
        stopTimer();
        setStatus('Sending voice…');
        try {
          await sendVoiceBurst(tripId, byName, blob);
          setStatus('Voice sent — plays loud, then vanishes.');
        } catch {
          setStatus('Could not send voice. Check internet.');
        }
        clearStatusLater();
      },
      (msg) => {
        stopRef.current = null;
        setRecording(false);
        stopTimer();
        setElapsed(0);
        setStatus(msg);
        clearStatusLater();
      },
      () => {
        setRecording(true);
        setStatus(null);
        const t0 = Date.now();
        timerRef.current = window.setInterval(() => {
          setElapsed(Math.floor((Date.now() - t0) / 1000));
        }, 500);
      }
    );
  };

  return { recording, elapsed, status, toggle, maxSecs: Math.floor(VOICE_MAX_MS / 1000) };
}
