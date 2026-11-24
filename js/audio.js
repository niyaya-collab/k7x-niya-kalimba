const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SILENT = "data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==";
const noises = new WeakMap();

export function freqOf(note) {
  const match = String(note || "").trim().match(/^([A-G])(\d)$/i);
  if (!match || NAMES[match[1].toUpperCase()] == null) return null;
  const midi = (Number(match[2]) + 1) * 12 + NAMES[match[1].toUpperCase()];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noiseBuffer(ctx) {
  let buffer = noises.get(ctx);
  if (buffer) return buffer;
  const len = Math.floor(ctx.sampleRate * 0.05);
  buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  noises.set(ctx, buffer);
  return buffer;
}

function impulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.7);
    }
  }
  return buffer;
}

function scheduleNote(ctx, dest, time, freq, velocity) {
  const peak = Math.max(0.04, Math.min(1, velocity || 0.8));
  const dur = freq < 320 ? 2.9 : freq < 520 ? 2.15 : 1.55;
  const detune = Math.random() * 6 - 3;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(1, time);
  bus.connect(dest);

  const body = ctx.createBiquadFilter();
  body.type = "lowpass";
  body.frequency.setValueAtTime(2500, time);
  body.Q.setValueAtTime(0.45, time);

  const tone = ctx.createOscillator();
  tone.type = "sine";
  tone.frequency.setValueAtTime(freq, time);
  tone.detune.setValueAtTime(detune, time);
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.0001, time);
  toneGain.gain.exponentialRampToValueAtTime(peak * 0.34, time + 0.002);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  tone.connect(body);
  body.connect(toneGain);
  toneGain.connect(bus);
  tone.start(time);
  tone.stop(time + dur + 0.06);

  const harm = ctx.createOscillator();
  harm.type = "sine";
  harm.frequency.setValueAtTime(freq * 2, time);
  harm.detune.setValueAtTime(detune, time);
  const harmGain = ctx.createGain();
  const harmDur = Math.min(0.5, dur * 0.32);
  harmGain.gain.setValueAtTime(0.0001, time);
  harmGain.gain.exponentialRampToValueAtTime(peak * 0.055, time + 0.002);
  harmGain.gain.exponentialRampToValueAtTime(0.0001, time + harmDur);
  harm.connect(harmGain);
  harmGain.connect(body);
  harm.start(time);
  harm.stop(time + harmDur + 0.05);

  const metalFreq = Math.min(freq * 6.27, ctx.sampleRate / 2 - 300);
  const metal = ctx.createOscillator();
  metal.type = "sine";
  metal.frequency.setValueAtTime(metalFreq, time);
  const metalGain = ctx.createGain();
  metalGain.gain.setValueAtTime(0.0001, time);
  metalGain.gain.exponentialRampToValueAtTime(peak * 0.05, time + 0.001);
  metalGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
  metal.connect(metalGain);
  metalGain.connect(bus);
  metal.start(time);
  metal.stop(time + 0.18);

  const tick = ctx.createBufferSource();
  tick.buffer = noiseBuffer(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(1700, time);
  band.Q.setValueAtTime(0.7, time);
  const tickGain = ctx.createGain();
  tickGain.gain.setValueAtTime(0.0001, time);
  tickGain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.18), time + 0.002);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.009);
  tick.connect(band);
  band.connect(tickGain);
  tickGain.connect(bus);
  tick.start(time);
  tick.stop(time + 0.02);

  return bus;
}

function encodeWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const rate = audioBuffer.sampleRate;
  const frames = audioBuffer.length;
  const block = channels * 2;
  const dataSize = frames * block;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * block, true);
  view.setUint16(32, block, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  const data = [];
  for (let c = 0; c < channels; c += 1) data.push(audioBuffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      const sample = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let dry = null;
  let wet = null;
  let media = null;
  let volume = 0.85;
  let reverb = 0.28;
  let silent = null;
  const active = [];

  function graph(context) {
    const input = context.createGain();
    const comp = context.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-18, context.currentTime || 0);
    comp.knee.setValueAtTime(10, context.currentTime || 0);
    comp.ratio.setValueAtTime(3, context.currentTime || 0);
    comp.attack.setValueAtTime(0.003, context.currentTime || 0);
    comp.release.setValueAtTime(0.25, context.currentTime || 0);
    const dryGain = context.createGain();
    const wetGain = context.createGain();
    const verb = context.createConvolver();
    verb.buffer = impulse(context, 2);
    dryGain.gain.value = 1;
    wetGain.gain.value = reverb * 0.75;
    input.connect(comp);
    comp.connect(dryGain);
    comp.connect(verb);
    verb.connect(wetGain);
    return { input, dryGain, wetGain };
  }

  function ensure() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) throw new Error("no-audio");
    ctx = new AudioCtx({ latencyHint: "interactive" });
    const built = graph(ctx);
    master = ctx.createGain();
    master.gain.value = volume;
    built.dryGain.connect(master);
    built.wetGain.connect(master);
    dry = built.input;
    wet = built.wetGain;
    master.connect(ctx.destination);
    if (ctx.createMediaStreamDestination) {
      media = ctx.createMediaStreamDestination();
      master.connect(media);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && ctx.state === "suspended") ctx.resume().catch(() => {});
    });
    return ctx;
  }

  function fadeOldest() {
    const old = active.shift();
    if (!old || !ctx) return;
    const now = ctx.currentTime;
    try {
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(Math.max(0.0001, old.gain.value), now);
      old.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    } catch (error) { /* already ended */ }
  }

  return {
    unlock() {
      const context = ensure();
      if (context.state !== "running") context.resume().catch(() => {});
      if (!silent) {
        silent = new Audio(SILENT);
        silent.loop = true;
        silent.setAttribute("playsinline", "");
      }
      silent.play().catch(() => {});
    },
    play(note, velocity = 0.8, when) {
      const context = ensure();
      const freq = freqOf(note);
      if (!freq || !dry) return;
      while (active.length >= 24) fadeOldest();
      const time = when == null ? context.currentTime : when;
      const bus = scheduleNote(context, dry, time, freq, velocity);
      active.push(bus);
      setTimeout(() => {
        const index = active.indexOf(bus);
        if (index >= 0) active.splice(index, 1);
      }, 3400);
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, Number(value)));
      if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
    },
    setReverb(value) {
      reverb = Math.max(0, Math.min(1, Number(value)));
      if (wet && ctx) wet.gain.setTargetAtTime(reverb * 0.75, ctx.currentTime, 0.04);
    },
    now() {
      return ctx ? ctx.currentTime : 0;
    },
    mediaStream() {
      ensure();
      return media ? media.stream : null;
    },
    async renderWav(events) {
      const last = events.reduce((max, event) => Math.max(max, event.t || 0), 0) / 1000;
      const seconds = Math.min(600, Math.max(1, last + 3));
      const rate = 44100;
      const offline = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
      const built = graph(offline);
      built.dryGain.connect(offline.destination);
      built.wetGain.connect(offline.destination);
      events.forEach((event) => {
        const freq = freqOf(event.note);
        if (!freq) return;
        scheduleNote(offline, built.input, event.t / 1000, freq, (event.velocity || 0.8) * volume);
      });
      return encodeWav(await offline.startRendering());
    }
  };
}
