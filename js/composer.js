const SOLFE = { دو: "C", ر: "D", می: "E", مي: "E", فا: "F", سل: "G", لا: "A", سی: "B", سي: "B" };
const DEGREE = "CDEFGAB";

function normalize(token) {
  const text = token.trim();
  const latin = text.match(/^([A-Ga-g])(\d)$/);
  if (latin) return latin[1].toUpperCase() + latin[2];
  const solfe = text.match(/^(دو|ر|می|مي|فا|سل|لا|سی|سي)(\d)?$/);
  if (solfe) return SOLFE[solfe[1]] + (solfe[2] || "4");
  const number = text.match(/^([1-7])(\d)?$/);
  if (number) return DEGREE[Number(number[1]) - 1] + (number[2] || "4");
  return null;
}

export function parseScore(text, tuning) {
  const errors = [];
  const events = [];
  if (!String(text || "").trim()) return { events, errors, steps: 0 };
  let step = 0;
  String(text).trim().split(/\s+/).forEach((token) => {
    if (token === "|") return;
    if (token === "." || token === "·" || token === "سکوت") {
      step += 1;
      return;
    }
    const notes = [];
    const failed = token.split("+").some((part) => {
      const note = normalize(part);
      const index = note ? tuning.findIndex((item) => item.toUpperCase() === note.toUpperCase()) : -1;
      if (!note || index < 0) return true;
      notes.push({ step, i: index, note: tuning[index] });
      return false;
    });
    if (failed || !notes.length) {
      errors.push(token);
      return;
    }
    events.push(...notes);
    step += 1;
  });
  return { events, errors, steps: step };
}

export function withTempo(events, bpm) {
  const step = 60000 / Math.max(40, Math.min(200, bpm || 80));
  return events.map((event) => ({
    t: Math.round(event.step * step),
    i: event.i,
    note: event.note,
    velocity: event.velocity || 0.84
  }));
}

export function gridToEvents(cells, bpm, tuning) {
  const step = 60000 / Math.max(40, Math.min(200, bpm || 80));
  return [...cells].map((key) => {
    const [row, column] = key.split(",").map(Number);
    return { t: Math.round(column * step), i: row, note: tuning[row], velocity: 0.84 };
  }).sort((a, b) => a.t - b.t || a.i - b.i);
}
