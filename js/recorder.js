export function createRecorder() {
  let events = [];
  let recording = false;
  let paused = false;
  let started = 0;
  let pausedFor = 0;
  let pauseMark = 0;

  function now() {
    if (!recording) return 0;
    const extra = paused ? performance.now() - pauseMark : 0;
    return Math.max(0, performance.now() - started - pausedFor - extra);
  }

  return {
    get recording() { return recording; },
    get paused() { return paused; },
    get events() { return events; },
    now,
    start() {
      events = [];
      recording = true;
      paused = false;
      started = performance.now();
      pausedFor = 0;
    },
    pause() {
      if (!recording || paused) return;
      paused = true;
      pauseMark = performance.now();
    },
    resume() {
      if (!recording || !paused) return;
      pausedFor += performance.now() - pauseMark;
      paused = false;
    },
    stop() {
      const taken = events.map((event) => ({ ...event }));
      recording = false;
      paused = false;
      return taken;
    },
    push(note, velocity, i) {
      if (!recording || paused) return;
      events.push({ t: Math.round(now()), note, velocity, i });
    }
  };
}

export function createPlayer(audio) {
  let events = [];
  let playing = false;
  let paused = false;
  let origin = 0;
  let frozen = 0;
  let loop = false;
  let raf = 0;
  let onFrame = () => {};
  let onNote = () => {};
  let heard = 0;
  let seen = 0;

  function elapsed() {
    if (!playing) return 0;
    if (paused) return frozen;
    return performance.now() - origin;
  }

  function duration() {
    if (!events.length) return 0;
    return events[events.length - 1].t + 1600;
  }

  function arm(from) {
    origin = performance.now() - from;
    heard = 0;
    while (heard < events.length && events[heard].t < from - 30) heard += 1;
    seen = heard;
  }

  function frame() {
    if (!playing) return;
    const at = elapsed();
    if (!paused) {
      const horizon = at + 90;
      while (heard < events.length && events[heard].t <= horizon) {
        const event = events[heard];
        heard += 1;
        if (event.t < at - 180) continue;
        const when = audio.now() + Math.max(0, (event.t - at) / 1000);
        audio.play(event.note, event.velocity, when);
      }
      while (seen < events.length && events[seen].t <= at + 20) {
        const event = events[seen];
        seen += 1;
        if (event.t >= at - 60) onNote(event);
      }
    }
    let next = -1;
    for (let i = seen; i < events.length; i += 1) {
      if (events[i].t >= at - 10) { next = events[i].i; break; }
    }
    onFrame({ elapsed: at, duration: duration(), next, done: false });
    if (!paused && at >= duration()) {
      if (loop && events.length) {
        arm(0);
      } else {
        playing = false;
        onFrame({ elapsed: duration(), duration: duration(), next: -1, done: true });
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    get playing() { return playing; },
    get paused() { return paused; },
    get loop() { return loop; },
    set loop(value) { loop = !!value; },
    load(next, hooks) {
      events = [...next].sort((a, b) => a.t - b.t);
      const bag = typeof hooks === "function" ? { onFrame: hooks } : (hooks || {});
      onFrame = bag.onFrame || (() => {});
      onNote = bag.onNote || (() => {});
      playing = false;
      paused = false;
      heard = 0;
      seen = 0;
      cancelAnimationFrame(raf);
    },
    play() {
      if (!events.length || !audio) return;
      if (paused) {
        origin = performance.now() - frozen;
        paused = false;
      } else {
        arm(0);
      }
      playing = true;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
    pause() {
      if (!playing || paused) return;
      frozen = elapsed();
      paused = true;
    },
    stop() {
      playing = false;
      paused = false;
      cancelAnimationFrame(raf);
      onFrame({ elapsed: 0, duration: duration(), next: -1, done: true });
    },
    duration
  };
}
