/**
 * Audio player for timers and alarms — loops for 30 seconds.
 * Uses the Web Audio API. The AudioContext is unlocked on first user gesture.
 */

interface PlayerState {
  context: AudioContext | null;
  gain: GainNode | null;
  loopTimer: number | null;
  stopAllTimer: number | null;
  primed: boolean;
  gestureListenerAttached: boolean;
}

const state: PlayerState = {
  context: null,
  gain: null,
  loopTimer: null,
  stopAllTimer: null,
  primed: false,
  gestureListenerAttached: false,
};

function getAudioContextCtor():
  | (new (
      contextOptions?: AudioContextOptions,
    ) => AudioContext)
  | null {
  const W = window as unknown as {
    AudioContext?: new (o?: AudioContextOptions) => AudioContext;
    webkitAudioContext?: new (o?: AudioContextOptions) => AudioContext;
  };
  return W.AudioContext ?? W.webkitAudioContext ?? null;
}

/** Creates or resumes the AudioContext. Called both manually and on user gesture. */
function ensureContext(): AudioContext | null {
  if (state.context && state.context.state !== "closed") {
    if (state.context.state === "suspended") {
      void state.context.resume();
    }
    return state.context;
  }
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    state.context = new Ctor();
    return state.context;
  } catch {
    return null;
  }
}

/** Plays a near-silent beep to "unlock" the AudioContext. */
function silentTickle(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.001;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
  } catch {
    // ignore
  }
}

/**
 * Global primer — call once at app startup.
 * Attaches a listener that unlocks audio on the first user interaction.
 */
export function initAudioPrimer() {
  if (state.gestureListenerAttached || typeof window === "undefined") return;
  state.gestureListenerAttached = true;

  const handler = () => {
    const ctx = ensureContext();
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume();
      silentTickle(ctx);
      state.primed = true;
    }
    // Remove listeners after first trigger
    window.removeEventListener("click", handler);
    window.removeEventListener("touchstart", handler);
    window.removeEventListener("keydown", handler);
    window.removeEventListener("pointerdown", handler);
  };

  window.addEventListener("click", handler, { once: false });
  window.addEventListener("touchstart", handler, { once: false });
  window.addEventListener("keydown", handler, { once: false });
  window.addEventListener("pointerdown", handler, { once: false });
}

/** Call explicitly when you know you are inside a user gesture. */
export function primeAudio() {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  silentTickle(ctx);
  state.primed = true;
}

function playBeep(ctx: AudioContext, gain: GainNode, offset: number) {
  const now = ctx.currentTime + offset;
  // Two tones: 880Hz + 1100Hz (alarm pattern)
  const beep = (freq: number, startOffset: number, duration: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now + startOffset);
    env.gain.linearRampToValueAtTime(0.4, now + startOffset + 0.02);
    env.gain.setValueAtTime(0.4, now + startOffset + duration - 0.05);
    env.gain.linearRampToValueAtTime(0, now + startOffset + duration);
    osc.connect(env);
    env.connect(gain);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.1);
  };
  beep(880, 0, 0.18);
  beep(1100, 0.22, 0.18);
}

/**
 * Starts the audio loop. Repeating beep-beep pattern for up to 30 seconds.
 * If the AudioContext is not ready, attempts to create it on the fly
 * (may fail without a prior user gesture).
 */
export function startAlertSound() {
  const ctx = ensureContext();
  if (!ctx) {
    console.warn("[alertSound] AudioContext not available");
    return;
  }

  // If suspended, try to resume (may fail without a prior user gesture)
  if (ctx.state === "suspended") {
    void ctx.resume();
  }

  stopAlertSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(ctx.destination);
  state.gain = masterGain;

  // Play the first beep immediately
  playBeep(ctx, masterGain, 0);

  // Repeat pattern every 0.8 seconds
  state.loopTimer = window.setInterval(() => {
    if (state.context && state.gain) {
      playBeep(state.context, state.gain, 0);
    }
  }, 800);

  // Auto-stop after 30 seconds
  state.stopAllTimer = window.setTimeout(() => {
    stopAlertSound();
  }, 30_000);
}

export function stopAlertSound() {
  if (state.loopTimer !== null) {
    window.clearInterval(state.loopTimer);
    state.loopTimer = null;
  }
  if (state.stopAllTimer !== null) {
    window.clearTimeout(state.stopAllTimer);
    state.stopAllTimer = null;
  }
  if (state.gain) {
    try {
      state.gain.disconnect();
    } catch {
      // ignore
    }
    state.gain = null;
  }
}
