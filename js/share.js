function toBase64Url(bytes) {
  let text = "";
  bytes.forEach((byte) => { text += String.fromCharCode(byte); });
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(text) {
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function encodeEvents(events) {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const bytes = [1];
  let clock = 0;
  sorted.forEach((event) => {
    let delta = Math.max(0, Math.round((event.t - clock) / 10));
    clock += delta * 10;
    while (delta > 65535) {
      bytes.push(255, 255, 255, 0);
      delta -= 65535;
    }
    const index = event.i == null ? 0 : event.i & 255;
    const velocity = Math.max(0, Math.min(127, Math.round((event.velocity || 0.8) * 127)));
    bytes.push(index, (delta >> 8) & 255, delta & 255, velocity);
  });
  return toBase64Url(bytes);
}

export function decodeEvents(code) {
  const bytes = fromBase64Url(code);
  if (!bytes.length || bytes[0] !== 1) throw new Error("bad-song");
  const events = [];
  let time = 0;
  for (let i = 1; i + 3 < bytes.length; i += 4) {
    const index = bytes[i];
    const delta = (bytes[i + 1] << 8) | bytes[i + 2];
    time += delta * 10;
    if (index === 255) continue;
    events.push({ t: time, i: index, velocity: bytes[i + 3] / 127 });
  }
  return events;
}

export function songUrl(code) {
  const url = new URL(window.location.href);
  url.hash = "s=" + code;
  return url.toString();
}

export async function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export async function shareUrl(url, title) {
  if (navigator.share) {
    await navigator.share({ title, text: title, url });
    return true;
  }
  return false;
}

export async function shareFile(blob, filename, title) {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return true;
  }
  return false;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
