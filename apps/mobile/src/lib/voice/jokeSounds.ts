/**
 * Comedic sounds played after jokes — generated via the Web Audio API.
 * No external audio files required.
 */

let _audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

/** Ba-dum TSS! — standup comedy rimshot.
 *  Two dry snare hits followed by a crash cymbal. */
export function playRimshot() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  function snareHit(time: number, volume: number) {
    // Short low tone (snare body)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.08);
    oscGain.gain.setValueAtTime(volume, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(oscGain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.1);

    // Noise burst (snare wires)
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3000;
    bp.Q.value = 1.5;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * 0.6, time);
    nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    noise.connect(bp).connect(nGain).connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.1);
  }

  // "Ba" — first snare hit
  snareHit(now, 0.5);
  // "Dum" — second snare hit (slightly louder)
  snareHit(now + 0.2, 0.65);

  // "TSS!" — long bright crash cymbal
  const crashLen = 0.6;
  const crashBuf = ctx.createBuffer(1, ctx.sampleRate * crashLen, ctx.sampleRate);
  const cd = crashBuf.getChannelData(0);
  for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
  const crash = ctx.createBufferSource();
  crash.buffer = crashBuf;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;

  const peak = ctx.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 10000;
  peak.gain.value = 6;
  peak.Q.value = 2;

  const cGain = ctx.createGain();
  const tCrash = now + 0.4;
  cGain.gain.setValueAtTime(0.7, tCrash);
  cGain.gain.exponentialRampToValueAtTime(0.01, tCrash + crashLen);

  crash.connect(hp).connect(peak).connect(cGain).connect(ctx.destination);
  crash.start(tCrash);
  crash.stop(tCrash + crashLen);
}

/** Synthetic laugh — ascending series of tonal bursts */
export function playLaugh() {
  const ctx = getCtx();
  const now = ctx.currentTime;

  const laughNotes = [300, 350, 320, 380, 340, 400, 360, 420];
  const noteLen = 0.08;
  const gap = 0.04;

  laughNotes.forEach((freq, i) => {
    const t = now + i * (noteLen + gap);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    // Slight vibrato for a more natural feel
    osc.frequency.setValueAtTime(freq * 1.02, t + noteLen * 0.3);
    osc.frequency.setValueAtTime(freq * 0.98, t + noteLen * 0.6);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3 + Math.random() * 0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + noteLen);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + noteLen);
  });
}

/** Randomly plays either the rimshot or the laugh */
export function playJokeSound() {
  if (Math.random() > 0.5) {
    playRimshot();
  } else {
    playLaugh();
  }
}
