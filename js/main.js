import { CONFIG } from "./config.js";
import { createAudio } from "./audio.js";
import { createKalimba, labelFor } from "./kalimba.js";
import { createPlayer, createRecorder } from "./recorder.js";
import { parseScore, withTempo, gridToEvents } from "./composer.js";
import { copyText, decodeEvents, downloadBlob, encodeEvents, shareFile, shareUrl, songUrl } from "./share.js";
import { exportLibrary, importLibrary, listSongs, newId, removeSong, saveSong } from "./storage.js";

const S = CONFIG.strings;
const audio = createAudio();
const recorder = createRecorder();
const sink = {
  play(note, velocity, when) {
    if (!settings.muted) audio.play(note, velocity, when);
  },
  now() { return audio.now(); }
};
const player = createPlayer(sink);

const settings = loadSettings();
let tab = "play";
let piece = null;
let loopOn = false;
let guide = false;
let follow = 0;
let bpm = 80;
let gridSteps = 16;
let notesMode = "grid";
let grid = new Set();
let scoreText = "C4 E4 G4 | E4 . C4";
let gift = null;
let lastHit = 0;
let videoRec = null;
let videoMode = "";
let videoCanvas = null;
let videoUrl = "";
let toastTimer = 0;
let watchId = 0;
let songsCache = [];

const welcome = document.querySelector("#welcome");
const app = document.querySelector("#app");
const panel = document.querySelector("#panel");
const modal = document.querySelector("#modal");
const toast = document.querySelector("#toast");
const giftBox = document.querySelector("#gift");
const clock = document.querySelector("#clock");
const bar = document.querySelector("#bar");
const buttons = {
  record: document.querySelector("#btnRecord"),
  pause: document.querySelector("#btnPause"),
  stop: document.querySelector("#btnStop"),
  play: document.querySelector("#btnPlay"),
  loop: document.querySelector("#btnLoop")
};

function loadSettings() {
  const base = { volume: 0.85, reverb: 0.28, labels: CONFIG.labelMode, quality: "full", muted: false };
  try {
    return Object.assign(base, JSON.parse(localStorage.getItem("niya-kalimba-settings") || "{}"));
  } catch (error) {
    return base;
  }
}

function saveSettings() {
  localStorage.setItem("niya-kalimba-settings", JSON.stringify(settings));
}

function tuningNow() {
  const list = CONFIG.tunings[CONFIG.defaultTuning] || [];
  return list.slice(0, CONFIG.tineCount);
}

function fa(value) {
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[digit]);
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return fa(minutes + ":" + seconds);
}

function showToast(text) {
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function setProgress(elapsed, duration) {
  clock.textContent = formatTime(elapsed);
  const ratio = duration > 0 ? Math.max(0, Math.min(1, elapsed / duration)) : 0;
  bar.style.width = (ratio * 100) + "%";
}

function fileName(name, ext) {
  const clean = String(name || "niyayesh").replace(/[\\/:*?"<>|]+/g, " ").trim() || "niyayesh";
  return clean + "." + ext;
}

function hydrate(events) {
  const notes = tuningNow();
  return (events || []).map((event) => ({
    t: Math.max(0, Math.round(event.t || 0)),
    i: event.i,
    velocity: event.velocity == null ? 0.8 : event.velocity,
    note: event.note || notes[event.i]
  })).filter((event) => event.note && event.i >= 0 && event.i < notes.length);
}

function applyView() {
  kalimba.setView({
    labels: settings.labels,
    tuning: tuningNow(),
    engraving: CONFIG.engraving,
    quality: settings.quality,
    keys: CONFIG.keyMap
  });
}

const kalimba = createKalimba(document.querySelector("#kalimba"), {
  count: CONFIG.tineCount,
  tuning: tuningNow(),
  labels: settings.labels,
  engraving: CONFIG.engraving,
  quality: settings.quality,
  keys: CONFIG.keyMap,
  onPlay(index, along) { playTine(index, along); }
});

const hooks = {
  onNote(event) {
    kalimba.pulse(event.i, labelFor(event.note, settings.labels));
    if (guide) kalimba.setGuide(event.i);
  },
  onFrame(info) {
    setProgress(info.elapsed, info.duration);
    if (guide && player.playing) kalimba.setGuide(info.next);
    if (tab === "notes" && player.playing) markColumn(info.elapsed);
    if (info.done) {
      paintTransport();
      if (videoRec && videoRec.state === "recording" && videoMode === "song") finishVideo();
    }
  }
};

function playTine(index, along) {
  const note = tuningNow()[index];
  if (!note) return;
  const now = performance.now();
  let velocity = 0.48 + Math.sin(Math.max(0, Math.min(1, along == null ? 0.6 : along)) * Math.PI) * 0.42;
  if (now - lastHit < 110) velocity *= 0.88;
  lastHit = now;
  velocity = Math.max(0.32, Math.min(1, velocity));
  kalimba.pulse(index, labelFor(note, settings.labels));
  if (!settings.muted) {
    try {
      audio.unlock();
      audio.play(note, velocity);
    } catch (error) {
      showToast(S.noAudio);
    }
  }
  recorder.push(note, velocity, index);
    if (guide && piece && !player.playing) {
    const target = piece.events[follow];
    if (target && target.i === index) {
      follow += 1;
      const next = piece.events[follow];
      kalimba.setGuide(next ? next.i : -1);
    }
  }
}

function paintTransport() {
  const recording = recorder.recording;
  buttons.record.classList.toggle("rec", recording && !recorder.paused);
  buttons.pause.textContent = (recording && recorder.paused) || (player.playing && player.paused) ? S.resume : S.pause;
  buttons.loop.classList.toggle("on", loopOn);
  buttons.loop.setAttribute("aria-pressed", loopOn ? "true" : "false");
}

function watchRecord() {
  cancelAnimationFrame(watchId);
  const tick = () => {
    if (!recorder.recording) return;
    const elapsed = recorder.now();
    setProgress(elapsed, Math.max(elapsed, 1000));
    watchId = requestAnimationFrame(tick);
  };
  watchId = requestAnimationFrame(tick);
}

function startRecord() {
  if (videoRec && videoRec.state === "recording") {
    showToast(S.videoBusy);
    return;
  }
  try { audio.unlock(); } catch (error) { showToast(S.noAudio); }
  player.stop();
  recorder.start();
  watchRecord();
  paintTransport();
}

function pauseToggle() {
  if (recorder.recording) {
    if (recorder.paused) recorder.resume();
    else recorder.pause();
    paintTransport();
    return;
  }
  if (!player.playing && !player.paused) return;
  if (player.paused) player.play();
  else player.pause();
  paintTransport();
}

function stopAll() {
  if (videoRec && videoRec.state === "recording") {
    finishVideo();
    return;
  }
  if (recorder.recording) {
    const events = hydrate(recorder.stop());
    paintTransport();
    setProgress(0, 1);
    if (!events.length) {
      showToast(S.nothing);
      return;
    }
    piece = {
      name: S.defaultSong,
      events,
      source: "live",
      bpm,
      duration: events[events.length - 1].t
    };
    follow = 0;
    openSave();
    return;
  }
  if (player.playing || player.paused) player.stop();
  paintTransport();
}

function playCurrent() {
  if (recorder.recording) return;
  if (!piece || !piece.events.length) {
    showToast(S.needSong);
    return;
  }
  try { audio.unlock(); } catch (error) { showToast(S.noAudio); return; }
  player.load(piece.events, hooks);
  player.loop = loopOn;
  follow = 0;
  player.play();
  paintTransport();
}

function adopt(song) {
  piece = {
    id: song.id,
    name: song.name,
    createdAt: song.createdAt,
    duration: song.duration,
    events: hydrate(song.events),
    source: song.source || "live",
    bpm: song.bpm || bpm
  };
  if (song.bpm) bpm = song.bpm;
  follow = 0;
  if (guide && piece.events[0]) kalimba.setGuide(piece.events[0].i);
}

async function persist(item) {
  const events = hydrate(item.events);
  const song = {
    id: item.id || newId(),
    name: item.name || S.defaultSong,
    createdAt: item.createdAt || Date.now(),
    duration: events.length ? events[events.length - 1].t : 0,
    events,
    source: item.source || "live",
    bpm: item.bpm || bpm
  };
  await saveSong(song);
  piece = song;
  return song;
}

function button(label, run, kind) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "btn" + (kind ? " " + kind : "");
  node.textContent = label;
  node.addEventListener("click", run);
  return node;
}

function closeModal() {
  modal.hidden = true;
  modal.innerHTML = "";
  if (videoUrl) {
    URL.revokeObjectURL(videoUrl);
    videoUrl = "";
  }
}

function openModal(title, build) {
  closeModal();
  modal.hidden = false;
  const card = document.createElement("div");
  card.className = "card";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const body = document.createElement("div");
  const actions = document.createElement("div");
  actions.className = "row";
  card.append(heading, body, actions);
  modal.appendChild(card);
  build(body, actions);
  modal.onclick = (event) => {
    if (event.target === modal) closeModal();
  };
}

function openSave() {
  openModal(CONFIG.songCardTitle, (body, actions) => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = piece.name || S.defaultSong;
    body.appendChild(input);
    actions.append(
      button(S.save, async () => {
        piece.name = input.value.trim() || S.defaultSong;
        try {
          await persist(piece);
          closeModal();
          showToast(S.saved);
          if (tab === "songs" || tab === "play") paintPanel();
        } catch (error) {
          showToast(S.noSave);
        }
      }),
      button(S.cancel, closeModal, "ghost")
    );
  });
}

function openLink(events) {
  const ready = hydrate(events);
  if (!ready.length) {
    showToast(S.needSong);
    return;
  }
  let url = "";
  try {
    url = songUrl(encodeEvents(ready));
  } catch (error) {
    showToast(S.badLink);
    return;
  }
  openModal(S.link, (body, actions) => {
    if (url.length > 1800) {
      const warn = document.createElement("p");
      warn.className = "warn";
      warn.textContent = S.linkLong;
      body.appendChild(warn);
    }
    const input = document.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.value = url;
    input.dir = "ltr";
    body.appendChild(input);
    actions.append(
      button(S.copy, async () => {
        try {
          await copyText(url);
          showToast(S.copied);
        } catch (error) {
          showToast(S.noShare);
        }
      }),
      button(S.share, async () => {
        try {
          const shared = await shareUrl(url, CONFIG.giftText);
          if (!shared) showToast(S.noShare);
        } catch (error) {
          if (!error || error.name !== "AbortError") showToast(S.noShare);
        }
      }, "ghost")
    );
  });
}

async function downloadWav(events, name) {
  const ready = hydrate(events);
  if (!ready.length) {
    showToast(S.needSong);
    return;
  }
  showToast(S.rendering);
  try {
    audio.unlock();
    const blob = await audio.renderWav(ready);
    downloadBlob(blob, fileName(name, "wav"));
  } catch (error) {
    showToast(S.noAudio);
  }
}

async function shareWav(events, name) {
  const ready = hydrate(events);
  if (!ready.length) {
    showToast(S.needSong);
    return;
  }
  showToast(S.rendering);
  try {
    audio.unlock();
    const blob = await audio.renderWav(ready);
    const shared = await shareFile(blob, fileName(name, "wav"), name || CONFIG.brand);
    if (!shared) {
      downloadBlob(blob, fileName(name, "wav"));
      showToast(S.noShare);
    }
  } catch (error) {
    if (error && error.name === "AbortError") return;
    showToast(S.noShare);
  }
}

function videoSupported() {
  return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
}

function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
  const types = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((type) => {
    try { return MediaRecorder.isTypeSupported(type); } catch (error) { return false; }
  }) || "";
}

function finishVideo() {
  if (!videoRec || videoRec.state === "inactive") return;
  const rec = videoRec;
  videoRec = null;
  if (player.playing || player.paused) player.stop();
  try { rec.stop(); } catch (error) { showToast(S.noRecorder); }
}

function beginVideo(mode, events) {
  if (!videoSupported()) {
    showToast(S.noRecorder);
    return;
  }
  if (videoRec && videoRec.state === "recording") return;
  try { audio.unlock(); } catch (error) { showToast(S.noAudio); return; }
  videoCanvas = document.createElement("canvas");
  videoCanvas.width = 720;
  videoCanvas.height = 1280;
  videoCanvas.setAttribute("aria-hidden", "true");
  videoCanvas.style.cssText = "position:fixed;left:-2000px;top:0;width:1px;height:1px;pointer-events:none";
  document.body.appendChild(videoCanvas);
  const ctx = videoCanvas.getContext("2d");
  let stream;
  try {
    const captured = videoCanvas.captureStream(30);
    const tracks = [...captured.getVideoTracks()];
    const media = audio.mediaStream();
    if (media) tracks.push(...media.getAudioTracks());
    stream = new MediaStream(tracks);
  } catch (error) {
    showToast(S.noRecorder);
    return;
  }
  const mime = pickMime();
  let rec;
  try {
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch (error) {
    showToast(S.noRecorder);
    return;
  }
  const chunks = [];
  videoRec = rec;
  videoMode = mode;
  rec.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
  rec.onstop = () => {
    stream.getVideoTracks().forEach((track) => track.stop());
    if (videoCanvas) videoCanvas.remove();
    videoRec = null;
    videoMode = "";
    player.loop = loopOn;
    paintTransport();
    const blob = new Blob(chunks, { type: rec.mimeType || mime || "video/webm" });
    if (!blob.size) {
      showToast(S.noRecorder);
      return;
    }
    showVideo(blob);
  };
  const draw = () => {
    if (!videoRec || videoRec.state === "inactive") return;
    kalimba.renderTo(ctx, 720, 1280);
    requestAnimationFrame(draw);
  };
  try {
    kalimba.renderTo(ctx, 720, 1280);
    rec.start(250);
  } catch (error) {
    videoRec = null;
    videoCanvas.remove();
    showToast(S.noRecorder);
    return;
  }
  player.loop = mode === "song" ? false : loopOn;
  draw();
  showToast(S.videoBusy);
  if (mode === "song" && events) {
    player.load(events, hooks);
    player.loop = false;
    player.play();
  }
}

function showVideo(blob) {
  const type = blob.type || "";
  const ext = type.includes("mp4") ? "mp4" : "webm";
  openModal(S.videoReady, (body, actions) => {
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    videoUrl = URL.createObjectURL(blob);
    video.src = videoUrl;
    body.appendChild(video);
    actions.append(
      button(S.download, () => downloadBlob(blob, fileName(piece && piece.name, ext))),
      button(S.share, async () => {
        try {
          const shared = await shareFile(blob, fileName(piece && piece.name, ext), CONFIG.brand);
          if (!shared) {
            downloadBlob(blob, fileName(piece && piece.name, ext));
            showToast(S.noShare);
          }
        } catch (error) {
          if (!error || error.name !== "AbortError") showToast(S.noShare);
        }
      }, "ghost")
    );
  });
}

function markColumn(elapsed) {
  const step = 60000 / Math.max(40, Math.min(200, bpm));
  const column = Math.floor(elapsed / step);
  panel.querySelectorAll(".cell.now").forEach((cell) => cell.classList.remove("now"));
  panel.querySelectorAll('[data-col="' + column + '"]').forEach((cell) => cell.classList.add("now"));
}

function paintPlay(root) {
  if (piece && piece.name) {
    const title = document.createElement("h2");
    title.textContent = piece.name;
    root.appendChild(title);
  }
  const keys = document.createElement("div");
  keys.className = "keys";
  tuningNow().forEach((note, index) => {
    const key = document.createElement("button");
    key.type = "button";
    key.dataset.act = "tine";
    key.dataset.i = String(index);
    key.textContent = (CONFIG.keyMap[index] || "") + " " + labelFor(note, settings.labels);
    if (settings.labels !== "solfege") key.style.fontFamily = "Tahoma, sans-serif";
    keys.appendChild(key);
  });
  root.appendChild(keys);
  const row = document.createElement("div");
  row.className = "row";
  const guideButton = document.createElement("button");
  guideButton.type = "button";
  guideButton.className = "btn ghost" + (guide ? " on" : "");
  guideButton.dataset.act = "guide";
  guideButton.textContent = S.guide;
  const videoButton = document.createElement("button");
  videoButton.type = "button";
  videoButton.className = "btn";
  videoButton.dataset.act = "video-live";
  videoButton.textContent = "🎬 " + S.videoLive;
  if (!videoSupported()) videoButton.disabled = true;
  row.append(guideButton, videoButton);
  if (piece && piece.events.length) {
    const songVideo = document.createElement("button");
    songVideo.type = "button";
    songVideo.className = "btn ghost";
    songVideo.dataset.act = "video-song";
    songVideo.textContent = "🎬 " + S.videoSong;
    if (!videoSupported()) songVideo.disabled = true;
    row.appendChild(songVideo);
  }
  if (piece && !piece.id) {
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "btn";
    saveButton.dataset.act = "save-current";
    saveButton.textContent = S.save;
    row.appendChild(saveButton);
  }
  if (piece && piece.events.length) {
    ["download", "share", "link"].forEach((act) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "btn ghost";
      node.dataset.act = act;
      node.textContent = S[act === "download" ? "download" : act === "share" ? "share" : "link"];
      row.appendChild(node);
    });
  }
  root.appendChild(row);
  if (!videoSupported()) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = S.noRecorder;
    root.appendChild(note);
  }
}

function paintGrid(root) {
  const steps = document.createElement("select");
  steps.dataset.field = "steps";
  [16, 32, 48, 64].forEach((count) => {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = fa(count);
    if (count === gridSteps) option.selected = true;
    steps.appendChild(option);
  });
  root.appendChild(field(S.steps, steps));
  const wrap = document.createElement("div");
  wrap.className = "grid-wrap";
  const table = document.createElement("div");
  table.className = "grid";
  table.style.setProperty("--steps", String(gridSteps));
  const corner = document.createElement("div");
  corner.className = "gh";
  table.appendChild(corner);
  for (let column = 0; column < gridSteps; column += 1) {
    const head = document.createElement("div");
    head.className = "gh";
    head.textContent = fa(column + 1);
    table.appendChild(head);
  }
  tuningNow().forEach((note, row) => {
    const label = document.createElement("div");
    label.className = "gh";
    label.textContent = labelFor(note, settings.labels) || note;
    table.appendChild(label);
    for (let column = 0; column < gridSteps; column += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell" + (grid.has(row + "," + column) ? " on" : "");
      cell.dataset.act = "cell";
      cell.dataset.key = row + "," + column;
      cell.dataset.col = String(column);
      cell.setAttribute("aria-label", note);
      table.appendChild(cell);
    }
  });
  wrap.appendChild(table);
  root.appendChild(wrap);
  const row = document.createElement("div");
  row.className = "row";
  row.append(
    actionButton("grid-play", S.listen),
    actionButton("grid-stop", S.stop),
    actionButton("grid-clear", S.clear),
    actionButton("grid-save", S.save)
  );
  root.appendChild(row);
}

function paintScore(root) {
  const area = document.createElement("textarea");
  area.dir = "ltr";
  area.value = scoreText;
  area.dataset.field = "score";
  root.appendChild(field(S.text, area));
  const row = document.createElement("div");
  row.className = "row";
  row.append(actionButton("to-grid", S.toGrid), actionButton("score-play", S.listen));
  root.appendChild(row);
}

function paintNotes(root) {
  root.appendChild(field(S.tempo, range("bpm", bpm, 40, 200)));
  const row = document.createElement("div");
  row.className = "row";
  row.append(actionButton("mode-grid", S.grid), actionButton("mode-text", S.text));
  root.appendChild(row);
  if (notesMode === "grid") paintGrid(root);
  else paintScore(root);
}

function paintSongs(root) {
  const warn = document.createElement("p");
  warn.className = "note";
  warn.textContent = CONFIG.storageNote;
  root.appendChild(warn);
  const tools = document.createElement("div");
  tools.className = "row";
  tools.append(actionButton("backup", S.backup), actionButton("restore", S.restore));
  root.appendChild(tools);
  if (!songsCache.length) {
    const empty = document.createElement("p");
    empty.textContent = S.empty;
    root.appendChild(empty);
    return;
  }
  songsCache.forEach((song) => {
    const card = document.createElement("article");
    card.className = "song";
    const title = document.createElement("h3");
    title.textContent = song.name;
    const meta = document.createElement("p");
    meta.textContent = formatTime(song.duration || 0);
    const actions = document.createElement("div");
    actions.className = "song-actions";
    [["use", S.listen], ["rename", S.rename], ["delete", S.remove], ["wav", S.download], ["send", S.share], ["url", S.link], ["film", "🎬"]].forEach(([act, label]) => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "btn ghost";
      node.dataset.act = act;
      node.dataset.id = song.id;
      node.textContent = label;
      if (act === "film" && !videoSupported()) node.disabled = true;
      actions.appendChild(node);
    });
    card.append(title, meta, actions);
    root.appendChild(card);
  });
}

function paintSettings(root) {
  root.append(
    field(S.volume, range("volume", Math.round(settings.volume * 100), 0, 100)),
    field(S.reverb, range("reverb", Math.round(settings.reverb * 100), 0, 100))
  );
  const labels = document.createElement("select");
  labels.dataset.field = "labels";
  [["numbers", S.numbers], ["letters", S.letters], ["solfege", S.solfege], ["off", S.off]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (settings.labels === value) option.selected = true;
    labels.appendChild(option);
  });
  root.appendChild(field(S.labels, labels));
  const quality = document.createElement("select");
  quality.dataset.field = "quality";
  [["full", S.full], ["low", S.low]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (settings.quality === value) option.selected = true;
    quality.appendChild(option);
  });
  root.appendChild(field(S.quality, quality));
  const mute = document.createElement("label");
  mute.className = "check";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.dataset.field = "muted";
  box.checked = !!settings.muted;
  const caption = document.createElement("span");
  caption.textContent = S.mute;
  mute.append(box, caption);
  root.appendChild(mute);
}

function field(label, input) {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const span = document.createElement("span");
  span.textContent = label;
  wrap.append(span, input);
  return wrap;
}

function range(fieldName, value, min, max) {
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.dataset.field = fieldName;
  return input;
}

function actionButton(act, label) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "btn" + (act.startsWith("mode") ? " ghost" : "");
  node.dataset.act = act;
  node.textContent = label;
  return node;
}

function paintPanel() {
  panel.innerHTML = "";
  const root = document.createElement("div");
  if (tab === "play") paintPlay(root);
  else if (tab === "notes") paintNotes(root);
  else if (tab === "songs") paintSongs(root);
  else paintSettings(root);
  panel.appendChild(root);
}

async function refreshSongs() {
  try {
    songsCache = await listSongs();
  } catch (error) {
    songsCache = [];
    showToast(S.noSave);
  }
}

function findSong(id) {
  return songsCache.find((song) => song.id === id);
}

function currentEvents() {
  if (notesMode === "grid") return gridToEvents(grid, bpm, tuningNow());
  const parsed = parseScore(scoreText, tuningNow());
  if (parsed.errors.length) return { error: parsed.errors[0] };
  if (!parsed.events.length) return { error: "empty" };
  return withTempo(parsed.events, bpm);
}

async function onAct(act, id) {
  if (act === "tine") {
    playTine(Number(id), 0.62);
    return;
  }
  if (act === "cell") return;
  if (act === "guide") {
    guide = !guide;
    follow = 0;
    if (guide && piece && piece.events[0]) kalimba.setGuide(piece.events[0].i);
    else kalimba.setGuide(-1);
    paintPanel();
    return;
  }
  if (act === "video-live") {
    beginVideo("live");
    return;
  }
  if (act === "video-song") {
    if (!piece || !piece.events.length) { showToast(S.needSong); return; }
    beginVideo("song", piece.events);
    return;
  }
  if (act === "save-current") {
    openSave();
    return;
  }
  if (act === "download") return downloadWav(piece.events, piece.name);
  if (act === "share") return shareWav(piece.events, piece.name);
  if (act === "link") return openLink(piece.events);
  if (act === "mode-grid") { notesMode = "grid"; paintPanel(); return; }
  if (act === "mode-text") { notesMode = "text"; paintPanel(); return; }
  if (act === "grid-clear") { grid = new Set(); paintPanel(); return; }
  if (act === "grid-stop" || act === "score-stop") { player.stop(); paintTransport(); return; }
  if (act === "grid-play" || act === "score-play") {
    const chosen = act === "grid-play" ? gridToEvents(grid, bpm, tuningNow()) : currentEvents();
    if (chosen.error === "empty" || (!chosen.error && !chosen.length)) { showToast(S.emptyScore); return; }
    if (chosen.error) { showToast(S.badToken + ": " + chosen.error); return; }
    piece = { name: S.defaultSong, events: chosen, source: "composer", bpm };
    playCurrent();
    return;
  }
  if (act === "grid-save") {
    const events = gridToEvents(grid, bpm, tuningNow());
    if (!events.length) { showToast(S.emptyScore); return; }
    piece = { name: S.defaultSong, events, source: "composer", bpm };
    openSave();
    return;
  }
  if (act === "to-grid") {
    const parsed = parseScore(scoreText, tuningNow());
    if (parsed.errors.length) { showToast(S.badToken + ": " + parsed.errors[0]); return; }
    if (!parsed.events.length) { showToast(S.emptyScore); return; }
    grid = new Set(parsed.events.map((event) => event.i + "," + event.step));
    gridSteps = Math.min(64, Math.max(16, Math.ceil((parsed.steps || 16) / 16) * 16));
    notesMode = "grid";
    paintPanel();
    return;
  }
  if (act === "backup") {
    try {
      const data = await exportLibrary();
      downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), "niyayesh-kalimba.json");
    } catch (error) {
      showToast(S.noSave);
    }
    return;
  }
  if (act === "restore") {
    document.querySelector("#restore").click();
    return;
  }
  const song = findSong(id);
  if (!song) return;
  if (act === "use") {
    adopt(song);
    playCurrent();
    return;
  }
  if (act === "rename") {
    openModal(S.rename, (body, actions) => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = song.name;
      body.appendChild(input);
      actions.append(button(S.save, async () => {
        song.name = input.value.trim() || S.defaultSong;
        try {
          await saveSong(song);
          if (piece && piece.id === song.id) piece.name = song.name;
          closeModal();
          paintPanel();
        } catch (error) {
          showToast(S.noSave);
        }
      }), button(S.cancel, closeModal, "ghost"));
    });
    return;
  }
  if (act === "delete") {
    openModal(S.remove, (body, actions) => {
      const text = document.createElement("p");
      text.textContent = S.confirmDelete;
      const name = document.createElement("p");
      name.textContent = song.name;
      body.append(text, name);
      actions.append(button(S.yes, async () => {
        try {
          await removeSong(song.id);
          if (piece && piece.id === song.id) piece = null;
          closeModal();
          await refreshSongs();
          paintPanel();
        } catch (error) {
          showToast(S.noSave);
        }
      }, "danger"), button(S.no, closeModal, "ghost"));
    });
    return;
  }
  if (act === "wav") return downloadWav(song.events, song.name);
  if (act === "send") return shareWav(song.events, song.name);
  if (act === "url") return openLink(song.events);
  if (act === "film") {
    adopt(song);
    beginVideo("song", piece.events);
  }
}

function onPanelInput(event) {
  const fieldName = event.target.dataset.field;
  if (!fieldName) return;
  if (fieldName === "bpm") bpm = Number(event.target.value);
  if (fieldName === "volume") {
    settings.volume = Number(event.target.value) / 100;
    audio.setVolume(settings.volume);
    saveSettings();
  }
  if (fieldName === "reverb") {
    settings.reverb = Number(event.target.value) / 100;
    audio.setReverb(settings.reverb);
    saveSettings();
  }
  if (fieldName === "labels") {
    settings.labels = event.target.value;
    saveSettings();
    applyView();
    paintPanel();
  }
  if (fieldName === "quality") {
    settings.quality = event.target.value;
    saveSettings();
    applyView();
    kalimba.resize();
  }
  if (fieldName === "muted") {
    settings.muted = event.target.checked;
    saveSettings();
  }
  if (fieldName === "steps") {
    gridSteps = Number(event.target.value);
    paintPanel();
  }
  if (fieldName === "score") scoreText = event.target.value;
}

function readHash() {
  let hash = location.hash.replace(/^#/, "");
  try { hash = decodeURIComponent(hash); } catch (error) { /* hash is already plain */ }
  if (!hash.startsWith("s=")) return null;
  try {
    return hydrate(decodeEvents(hash.slice(2)));
  } catch (error) {
    showToast(S.badLink);
    return null;
  }
}

function paintSweet(index) {
  const lines = CONFIG.lines || [];
  if (!lines.length) return;
  const line = lines[index % lines.length];
  document.querySelectorAll(".sweet").forEach((node) => { node.textContent = line; });
}

function fillChrome() {
  document.querySelector("#welcomeTitle").textContent = CONFIG.welcomeTitle;
  document.querySelector("#welcomeText").textContent = CONFIG.welcomeText;
  paintSweet(0);
  document.querySelector("#startBtn").textContent = CONFIG.startLabel;
  document.querySelector("#brand").textContent = CONFIG.brand;
  document.title = CONFIG.brand;
  const tabs = [S.play, S.notes, S.songs, S.settings];
  document.querySelectorAll("[data-tab]").forEach((node, index) => {
    node.textContent = tabs[index];
  });
  buttons.record.textContent = "● " + S.record;
  buttons.pause.textContent = S.pause;
  buttons.stop.textContent = "⏹ " + S.stop;
  buttons.play.textContent = "▶ " + S.listen;
  buttons.loop.textContent = "↺ " + S.loop;
  giftBox.textContent = CONFIG.giftText;
}

document.querySelector("#startBtn").addEventListener("click", () => {
  try { audio.unlock(); } catch (error) { showToast(S.noAudio); }
  welcome.hidden = true;
  app.hidden = false;
  document.body.dataset.screen = tab;
  kalimba.start();
  if (gift && gift.length) {
    giftBox.hidden = false;
    piece = { name: CONFIG.giftText, events: gift, source: "live", bpm };
    playCurrent();
  }
});

document.querySelectorAll("[data-tab]").forEach((node) => {
  node.addEventListener("click", async () => {
    tab = node.dataset.tab;
    document.body.dataset.screen = tab;
    document.querySelectorAll("[data-tab]").forEach((item) => item.classList.toggle("on", item === node));
    if (tab === "songs") await refreshSongs();
    paintPanel();
    kalimba.resize();
  });
});

buttons.record.addEventListener("click", startRecord);
buttons.pause.addEventListener("click", pauseToggle);
buttons.stop.addEventListener("click", stopAll);
buttons.play.addEventListener("click", playCurrent);
buttons.loop.addEventListener("click", () => {
  loopOn = !loopOn;
  player.loop = loopOn;
  paintTransport();
});

panel.addEventListener("click", (event) => {
  const cell = event.target.closest("[data-act='cell']");
  if (cell) {
    const key = cell.dataset.key;
    if (grid.has(key)) {
      grid.delete(key);
      cell.classList.remove("on");
    } else {
      grid.add(key);
      cell.classList.add("on");
    }
    return;
  }
  const node = event.target.closest("[data-act]");
  if (!node) return;
  Promise.resolve(onAct(node.dataset.act, node.dataset.i || node.dataset.id)).catch(() => showToast(S.noSave));
});

panel.addEventListener("input", onPanelInput);
panel.addEventListener("change", onPanelInput);

document.querySelector("#restore").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    await importLibrary(data);
    await refreshSongs();
    paintPanel();
    showToast(S.restored);
  } catch (error) {
    showToast(S.noSave);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (welcome && !welcome.hidden) return;
  const index = CONFIG.keyMap.indexOf(event.key.toUpperCase());
  if (index < 0 || index >= tuningNow().length) return;
  event.preventDefault();
  playTine(index, 0.62);
});

window.addEventListener("hashchange", () => {
  const next = readHash();
  if (!next || !next.length) return;
  gift = next;
  giftBox.hidden = false;
  piece = { name: CONFIG.giftText, events: next, source: "live", bpm };
  if (app.hidden) return;
  playCurrent();
});

audio.setVolume(settings.volume);
audio.setReverb(settings.reverb);
fillChrome();
let sweetAt = 0;
setInterval(() => {
  sweetAt += 1;
  paintSweet(sweetAt);
}, 8000);
gift = readHash();
paintPanel();
paintTransport();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
