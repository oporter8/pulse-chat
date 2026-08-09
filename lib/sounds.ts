import type { NotificationSound } from "@/lib/chat-types";

export function haptic(pattern: number | number[] = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
}

export function playNotificationSound(sound: NotificationSound) {
  if (sound === "none" || typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const settings = sound === "soft"
      ? { frequency: 520, duration: 0.10, volume: 0.025 }
      : sound === "pop"
        ? { frequency: 760, duration: 0.07, volume: 0.04 }
        : { frequency: 640, duration: 0.09, volume: 0.035 };
    osc.frequency.value = settings.frequency;
    osc.type = "sine";
    gain.gain.setValueAtTime(settings.volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + settings.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + settings.duration);
    osc.addEventListener("ended", () => void ctx.close());
  } catch { /* autoplay or platform restriction */ }
}
