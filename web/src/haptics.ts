import { WebHaptics } from 'web-haptics';

// Shared haptics instance
let haptics: WebHaptics | null = null;

function getHaptics(): WebHaptics {
  if (!haptics) {
    haptics = new WebHaptics();
  }
  return haptics;
}

// Audio context for tick sound
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playTick() {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = 1800;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  } catch {
    // Audio not available
  }
}

/** Trigger haptic + tick sound for dial rotation */
export function dialTick() {
  try {
    getHaptics().trigger(4);
  } catch {
    // Haptics not supported
  }
  playTick();
}
