const FANFARE_HZ = [523, 659, 784, 1047];
const FANFARE_STEP_MS = 130;

declare global {
  interface Window {
    /** Older Safari. */
    webkitAudioContext: typeof AudioContext;
  }
}

let context: AudioContext | undefined;

export function playTone(frequency = 900, seconds = 0.03, volume = 0.08) {
  try {
    context ??= new (window.AudioContext ?? window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = 'square';
    gain.gain.value = volume;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + seconds);
    oscillator.stop(context.currentTime + seconds);
  } catch {
    // audio may be unavailable or blocked; the draw must go on without sound
  }
}

export function playFanfare(play: typeof playTone) {
  FANFARE_HZ.forEach((frequency, i) => setTimeout(() => play(frequency, 0.35, 0.1), i * FANFARE_STEP_MS));
}
