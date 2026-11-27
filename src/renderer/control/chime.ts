import { useEffect, useRef } from "react";
import type { AppState } from "../../shared/ipc";

let context: AudioContext | null = null;

/** A short bell made in code, so there are no sound files. Plays on this laptop only. */
export function playChime(kind: "time-up" | "warning") {
  context ??= new AudioContext();
  const audio = context;
  void audio.resume();
  const start = audio.currentTime + 0.02;
  const notes = kind === "time-up" ? [880, 659, 880] : [659];
  notes.forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const at = start + index * 0.3;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + 1.05);
  });
}

/** Chime when the item running now hits 0:00 (and, if chosen, when it turns amber). */
export function useChime(state: AppState | null) {
  const previous = useRef<{ band: string; item?: string } | null>(null);
  useEffect(() => {
    if (!state) return;
    const mode = state.settings.chime ?? "time-up";
    const current = { band: state.view.colourBand, item: state.view.current?.id };
    const before = previous.current;
    previous.current = current;
    if (!before || mode === "off" || before.item !== current.item) return;
    if (current.band === "over" && before.band !== "over") playChime("time-up");
    else if (mode === "warning-and-time-up" && current.band === "warning" && before.band === "normal") playChime("warning");
  }, [state]);
}
