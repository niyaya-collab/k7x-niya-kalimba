const SOLFE = { C: "دو", D: "ر", E: "می", F: "فا", G: "سل", A: "لا", B: "سی" };
const DEGREE = { C: "1", D: "2", E: "3", F: "4", G: "5", A: "6", B: "7" };

export function labelParts(note, mode) {
  if (!note || mode === "off") return { text: "", dots: 0 };
  const match = String(note).match(/^([A-G])(\d)$/i);
  if (!match) return { text: String(note), dots: 0 };
  const letter = match[1].toUpperCase();
  const octave = Number(match[2]);
  if (mode === "letters") return { text: letter + octave, dots: 0 };
  if (mode === "solfege") return { text: SOLFE[letter] || letter, dots: 0 };
  return { text: DEGREE[letter] || letter, dots: Math.max(0, Math.min(2, octave - 4)) };
}

export function labelFor(note, mode) {
  const parts = labelParts(note, mode);
  if (!parts.text) return "";
  return parts.text + (parts.dots ? "·".repeat(parts.dots) : "");
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function metrics(w, h, count) {
  const bodyW = Math.min(w * 0.8, h * 0.56);
  const bodyH = Math.min(h * 0.9, bodyW * 1.5);
  const x = (w - bodyW) / 2;
  const y = (h - bodyH) / 2;
  const bridge = y + bodyH * 0.355;
  const center = (count - 1) / 2 || 1;
  const spread = bodyW * 0.74;
  const tines = [];
  for (let i = 0; i < count; i += 1) {
    const dist = Math.abs(i - center) / center;
    const tilt = ((i - center) / center) * 0.16;
    const length = (bridge - (y + bodyH * 0.055)) * (1 - Math.pow(dist, 1.25) * 0.5);
    const tx = x + bodyW / 2 + ((i - center) / center) * (spread / 2);
    const width = Math.max(3, bodyW * 0.03 - dist * bodyW * 0.004);
    const tipX = tx + Math.sin(tilt) * length;
    const tipY = bridge - Math.cos(tilt) * length;
    tines.push({
      i, x: tx, bridge, tilt, length, w: width, tipX, tipY,
      bottom: bridge + bodyH * 0.05
    });
  }
  return { x, y, bodyW, bodyH, bridge, tines, radius: Math.max(16, bodyW * 0.05) };
}

function pointOnTine(tine, t) {
  const x = tine.x + Math.sin(tine.tilt) * tine.length * (1 - t);
  const y = tine.bridge - Math.cos(tine.tilt) * tine.length * (1 - t);
  return { x, y };
}

function distToTine(px, py, tine) {
  const tip = { x: tine.tipX, y: tine.tipY };
  const base = { x: tine.x, y: tine.bottom };
  const dx = base.x - tip.x;
  const dy = base.y - tip.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - tip.x) * dx + (py - tip.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = tip.x + dx * t;
  const y = tip.y + dy * t;
  return { dist: Math.hypot(px - x, py - y), along: t };
}

function drawLeaf(ctx, x, y, scale, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(18, 8, 8, 0.88)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(16, -14, 34, 0);
  ctx.quadraticCurveTo(16, 14, 0, 0);
  ctx.fill();
  ctx.restore();
}

function drawSprig(ctx, x, y, scale, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "rgba(18, 8, 8, 0.88)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(20, -8, 46, -2);
  ctx.stroke();
  drawLeaf(ctx, 16, -6, 0.7, -0.6);
  drawLeaf(ctx, 30, 0, 0.85, 0.5);
  drawLeaf(ctx, 44, -4, 0.6, -0.2);
  ctx.restore();
}

function drawHeart(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.32);
  ctx.bezierCurveTo(-size * 0.95, -size * 0.25, -size * 0.35, -size * 0.95, 0, -size * 0.38);
  ctx.bezierCurveTo(size * 0.35, -size * 0.95, size * 0.95, -size * 0.25, 0, size * 0.32);
  ctx.fill();
  ctx.restore();
}

function drawDeer(ctx, cx, cy, size) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size, size);
  ctx.fillStyle = "#1a0c0a";
  ctx.beginPath();
  ctx.ellipse(0, 0.08, 0.34, 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0.36, 0.15, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.16, -0.08);
  ctx.quadraticCurveTo(-0.28, -0.32, -0.08, -0.22);
  ctx.quadraticCurveTo(-0.12, -0.1, -0.08, -0.02);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0.16, -0.08);
  ctx.quadraticCurveTo(0.28, -0.32, 0.08, -0.22);
  ctx.quadraticCurveTo(0.12, -0.1, 0.08, -0.02);
  ctx.fill();
  ctx.strokeStyle = "#1a0c0a";
  ctx.lineWidth = 0.045;
  ctx.lineCap = "round";
  [-1, 1].forEach((dir) => {
    ctx.beginPath();
    ctx.moveTo(dir * 0.12, -0.16);
    ctx.quadraticCurveTo(dir * 0.28, -0.42, dir * 0.16, -0.7);
    ctx.moveTo(dir * 0.2, -0.36);
    ctx.quadraticCurveTo(dir * 0.42, -0.46, dir * 0.46, -0.66);
    ctx.moveTo(dir * 0.18, -0.52);
    ctx.quadraticCurveTo(dir * 0.34, -0.62, dir * 0.28, -0.8);
    ctx.stroke();
  });
  ctx.restore();
}

function drawRose(ctx, x, y, radius) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#7ea36a";
  ctx.beginPath();
  ctx.ellipse(radius * 0.85, radius * 0.55, radius * 0.42, radius * 0.18, 0.7, 0, Math.PI * 2);
  ctx.fill();
  for (let ring = 0; ring < 2; ring += 1) {
    const count = ring === 0 ? 5 : 4;
    const dist = ring === 0 ? radius * 0.42 : radius * 0.2;
    const rx = ring === 0 ? radius * 0.34 : radius * 0.2;
    const ry = ring === 0 ? radius * 0.52 : radius * 0.3;
    for (let i = 0; i < count; i += 1) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * i) / count + ring);
      const paint = ctx.createRadialGradient(0, -dist, 2, 0, -dist, ry);
      paint.addColorStop(0, ring === 0 ? "#ffd0e2" : "#ff9cbf");
      paint.addColorStop(0.7, ring === 0 ? "#ff5f9a" : "#e84a7f");
      paint.addColorStop(1, "#d43b70");
      ctx.fillStyle = paint;
      ctx.beginPath();
      ctx.ellipse(0, -dist, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.fillStyle = "#ffe7a3";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8df";
  ctx.beginPath();
  ctx.arc(-radius * 0.04, -radius * 0.04, radius * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPetal(ctx, x, y, size, rot, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.55, size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function engrave(ctx, box, text) {
  const raw = text || "";
  const parts = raw.split(/♥|❤/);
  const size = Math.max(18, box.bodyW * 0.062);
  const font = /[\u0600-\u06FF]/.test(raw)
    ? `${size}px Vazirmatn, Tahoma, sans-serif`
    : `${size}px "Segoe Script", "Brush Script MT", cursive`;
  ctx.font = font;
  ctx.fillStyle = "#f3d2b0";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const heart = size * 0.72;
  let width = 0;
  parts.forEach((part, index) => {
    width += ctx.measureText(part).width;
    if (index < parts.length - 1) width += heart + 4;
  });
  let cursor = box.x + (box.bodyW - width) / 2;
  const baseline = box.y + box.bodyH * 0.86;
  parts.forEach((part, index) => {
    ctx.fillText(part, cursor, baseline);
    cursor += ctx.measureText(part).width;
    if (index < parts.length - 1) {
      drawHeart(ctx, cursor + heart * 0.45, baseline, heart * 0.7, "#f0a0b8");
      cursor += heart + 4;
    }
  });
}

export function renderScene(ctx, w, h, state, background) {
  const count = state.count;
  const box = metrics(w, h, count);
  ctx.clearRect(0, 0, w, h);
  if (background) {
    const sky = ctx.createLinearGradient(0, 0, w * 0.2, h);
    sky.addColorStop(0, "#ffe3ec");
    sky.addColorStop(0.45, "#f3e4ff");
    sky.addColorStop(1, "#fff5f8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    [[0.2, 0.18, 0.16], [0.78, 0.12, 0.12], [0.12, 0.72, 0.1]].forEach(([nx, ny, r]) => {
      const glow = ctx.createRadialGradient(nx * w, ny * h, 0, nx * w, ny * h, r * w);
      glow.addColorStop(0, "rgba(255,255,255,0.45)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(nx * w, ny * h, r * w, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  state.petals.forEach((petal, index) => {
    if (state.quality === "low" && index > 5) return;
    if (!background && index % 2 === 0) return;
    drawPetal(ctx, petal.nx * w, petal.ny * h, petal.size * w, petal.rot, petal.color);
  });

  ctx.save();
  ctx.shadowColor = "rgba(59, 27, 24, 0.28)";
  ctx.shadowBlur = state.quality === "low" ? 8 : 28;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, box.x, box.y, box.bodyW, box.bodyH, box.radius);
  const wood = ctx.createLinearGradient(box.x, box.y, box.x + box.bodyW, box.y + box.bodyH);
  wood.addColorStop(0, "#7a4036");
  wood.addColorStop(0.38, "#5a2d27");
  wood.addColorStop(1, "#3b1b18");
  ctx.fillStyle = wood;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, box.x, box.y, box.bodyW, box.bodyH, box.radius);
  ctx.clip();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = "#2a100e";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 16; i += 1) {
    const gy = box.y + 16 + i * (box.bodyH / 16);
    ctx.beginPath();
    ctx.moveTo(box.x, gy);
    ctx.bezierCurveTo(box.x + box.bodyW * 0.35, gy + 7, box.x + box.bodyW * 0.65, gy - 6, box.x + box.bodyW, gy + 3);
    ctx.stroke();
  }
  const sheen = ctx.createLinearGradient(box.x, box.y, box.x + box.bodyW * 0.4, box.y);
  sheen.addColorStop(0, "rgba(255, 220, 200, 0.16)");
  sheen.addColorStop(1, "rgba(255, 220, 200, 0)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = sheen;
  ctx.fillRect(box.x, box.y, box.bodyW, box.bodyH);
  ctx.restore();

  const deerW = box.bodyW * 0.42;
  const deerX = box.x + box.bodyW / 2;
  const deerY = box.y + box.bodyH * 0.6;
  drawSprig(ctx, box.x + box.bodyW * 0.16, deerY + box.bodyH * 0.02, box.bodyW / 280, -0.5);
  drawSprig(ctx, box.x + box.bodyW * 0.78, deerY, box.bodyW / 280, 2.6);
  if (state.deer) {
    const dh = deerW * ((state.deer.naturalHeight || 280) / (state.deer.naturalWidth || 240));
    ctx.drawImage(state.deer, deerX - deerW / 2, deerY - dh * 0.55, deerW, dh);
  } else {
    drawDeer(ctx, deerX, deerY, deerW * 0.85);
  }
  engrave(ctx, box, state.engraving);

  box.tines.forEach((tine) => {
    const glow = state.glow[tine.i] || 0;
    const guide = state.guide === tine.i;
    if (glow < 0.03 && !guide) return;
    ctx.save();
    ctx.translate(tine.x, tine.bridge);
    ctx.rotate(tine.tilt);
    ctx.globalAlpha = guide ? 0.45 : glow * 0.4;
    const paint = ctx.createLinearGradient(0, -tine.length, 0, 0);
    paint.addColorStop(0, guide ? "#ffd27a" : "#ffd0e2");
    paint.addColorStop(1, "rgba(255,95,154,0)");
    ctx.fillStyle = paint;
    ctx.beginPath();
    ctx.ellipse(0, -tine.length * 0.45, tine.w * 2.1, tine.length * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  box.tines.forEach((tine) => {
    const wobble = state.reduced ? 0 : Math.sin(state.time * 30 + tine.i) * (state.vib[tine.i] || 0) * tine.w * 0.85;
    ctx.save();
    ctx.translate(tine.x + wobble, tine.bridge);
    ctx.rotate(tine.tilt);
    const metal = ctx.createLinearGradient(-tine.w, 0, tine.w, 0);
    metal.addColorStop(0, "#aeb6c0");
    metal.addColorStop(0.28, "#f7f9fb");
    metal.addColorStop(0.5, "#ffffff");
    metal.addColorStop(0.74, "#d5dce4");
    metal.addColorStop(1, "#b4bcc6");
    ctx.fillStyle = metal;
    const top = -tine.length;
    const stub = box.bodyH * 0.045;
    const half = tine.w / 2;
    ctx.beginPath();
    ctx.moveTo(-half, stub);
    ctx.lineTo(-half, top + half);
    ctx.quadraticCurveTo(-half, top, 0, top);
    ctx.quadraticCurveTo(half, top, half, top + half);
    ctx.lineTo(half, stub);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(90, 100, 112, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (state.labels !== "off") {
      const parts = labelParts(state.tuning[tine.i], state.labels);
      if (parts.text) {
        const size = Math.max(8, Math.min(half * 1.55, 15));
        const y = top + Math.max(size * 1.45, tine.length * 0.16);
        ctx.fillStyle = "#3a424c";
        ctx.font = "700 " + size + "px " + (state.labels === "solfege" ? "Vazirmatn, Tahoma, sans-serif" : "Tahoma, sans-serif");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(parts.text, 0, y);
        for (let d = 0; d < parts.dots; d += 1) {
          ctx.beginPath();
          const dx = (d - (parts.dots - 1) / 2) * size * 0.36;
          ctx.arc(dx, y - size * 0.82, Math.max(1, size * 0.08), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    if (state.keys && state.keys[tine.i] && box.bodyW > 460) {
      ctx.fillStyle = "rgba(243, 210, 176, 0.92)";
      ctx.font = "13px Vazirmatn, Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(state.keys[tine.i], tine.x, tine.bottom + 6);
    }
  });

  const bridgeH = Math.max(8, box.bodyW * 0.034);
  const left = box.tines[0];
  const right = box.tines[box.tines.length - 1];
  const barX = left.x - left.w;
  const barW = right.x - left.x + left.w + right.w;
  const bar = ctx.createLinearGradient(0, box.bridge - bridgeH, 0, box.bridge + bridgeH);
  bar.addColorStop(0, "#f8fafc");
  bar.addColorStop(0.45, "#c5ced6");
  bar.addColorStop(1, "#9aa3ad");
  ctx.fillStyle = bar;
  roundRect(ctx, barX, box.bridge - bridgeH / 2, barW, bridgeH, bridgeH / 2);
  ctx.fill();
  [barX + bridgeH, barX + barW - bridgeH].forEach((sx) => {
    ctx.beginPath();
    ctx.fillStyle = "#dfe5eb";
    ctx.arc(sx, box.bridge, bridgeH * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = "#8d97a1";
    ctx.arc(sx, box.bridge, bridgeH * 0.16, 0, Math.PI * 2);
    ctx.fill();
  });

  const roseR = box.bodyW * 0.17;
  const roseX = box.x + box.bodyW - roseR * 0.35;
  const roseY = box.y + roseR * 0.15;
  if (state.rose) {
    const rw = roseR * 2.3;
    ctx.drawImage(state.rose, roseX - rw * 0.55, roseY - rw * 0.45, rw, rw);
  } else {
    drawRose(ctx, roseX, roseY, roseR);
  }

  if (state.quality !== "low") {
    state.sparks.forEach((spark) => {
      const tine = box.tines[spark.i];
      if (!tine) return;
      const x = tine.tipX + spark.vx * spark.age * w;
      const y = tine.tipY + spark.vy * spark.age * h;
      ctx.globalAlpha = Math.max(0, spark.life);
      ctx.fillStyle = spark.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.5, w * 0.006), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  if (state.banner && state.banner.life > 0.02 && state.banner.text) {
    ctx.globalAlpha = Math.min(1, state.banner.life);
    ctx.fillStyle = "#b83266";
    ctx.font = "700 22px Vazirmatn, Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(state.banner.text, w / 2, 12);
    ctx.globalAlpha = 1;
  }
  return box;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function createKalimba(canvas, options) {
  const count = options.count || 17;
  const state = {
    count,
    time: 0,
    vib: Array(count).fill(0),
    glow: Array(count).fill(0),
    sparks: [],
    petals: [],
    labels: options.labels || "numbers",
    tuning: options.tuning || [],
    engraving: options.engraving || "",
    guide: -1,
    quality: options.quality || "full",
    keys: options.keys || [],
    deer: null,
    rose: null,
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    banner: { text: "", life: 0 }
  };
  for (let i = 0; i < 14; i += 1) {
    state.petals.push({
      nx: Math.random(),
      ny: Math.random(),
      size: 0.012 + Math.random() * 0.012,
      rot: Math.random() * Math.PI,
      speed: 0.02 + Math.random() * 0.028,
      drift: 0.008 + Math.random() * 0.016,
      color: Math.random() > 0.45 ? "rgba(255,133,173,0.5)" : "rgba(255,210,224,0.55)"
    });
  }
  let cssW = 1;
  let cssH = 1;
  let layout = null;
  let running = false;
  let last = performance.now();
  const pointers = new Map();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  motion.addEventListener?.("change", () => { state.reduced = motion.matches; });
  loadImage("assets/deer.svg").then((image) => { state.deer = image; });
  loadImage("assets/rose.png").then((image) => { state.rose = image; });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, rect.width);
    cssH = Math.max(1, rect.height);
    const dpr = state.quality === "low" ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.reduced) state.time += dt;
    for (let i = 0; i < count; i += 1) {
      state.vib[i] *= Math.exp(-dt * 3.3);
      state.glow[i] *= Math.exp(-dt * 2.3);
    }
    state.banner.life *= Math.exp(-dt * 1.4);
    state.sparks = state.sparks.filter((spark) => {
      spark.age += dt;
      spark.life -= dt;
      return spark.life > 0;
    });
    if (!state.reduced) {
      state.petals.forEach((petal) => {
        petal.ny += petal.speed * dt;
        petal.nx += Math.sin(state.time * 0.35 + petal.rot) * petal.drift * dt;
        petal.rot += dt * 0.15;
        if (petal.ny > 1.12) {
          petal.ny = -0.08;
          petal.nx = Math.random();
        }
      });
    }
    const ctx = canvas.getContext("2d");
    if (cssW < 2 || cssH < 2) {
      requestAnimationFrame(frame);
      return;
    }
    const dpr = canvas.width / cssW;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout = renderScene(ctx, cssW, cssH, state, false);
    requestAnimationFrame(frame);
  }

  function pick(event) {
    if (!layout) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestDist = 1e9;
    layout.tines.forEach((tine) => {
      const hit = distToTine(x, y, tine);
      const slop = Math.max(12, tine.w * 0.95);
      if (hit.dist <= slop && hit.dist < bestDist) {
        bestDist = hit.dist;
        best = { index: tine.i, along: hit.along };
      }
    });
    return best;
  }

  function pointerDown(event) {
    if (event.cancelable) event.preventDefault();
    const fired = new Set();
    pointers.set(event.pointerId, fired);
    const hit = pick(event);
    if (hit) {
      fired.add(hit.index);
      options.onPlay(hit.index, hit.along);
    }
    try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* already captured */ }
  }

  function pointerMove(event) {
    const fired = pointers.get(event.pointerId);
    if (!fired) return;
    const hit = pick(event);
    if (!hit || fired.has(hit.index)) return;
    fired.add(hit.index);
    options.onPlay(hit.index, hit.along);
  }

  canvas.addEventListener("pointerdown", pointerDown, { passive: false });
  canvas.addEventListener("pointermove", pointerMove, { passive: false });
  canvas.addEventListener("pointerup", (event) => pointers.delete(event.pointerId));
  canvas.addEventListener("pointercancel", (event) => pointers.delete(event.pointerId));
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

  return {
    start() {
      resize();
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    },
    resize,
    pulse(index, text) {
      if (index < 0 || index >= count) return;
      state.vib[index] = 1;
      state.glow[index] = 1;
      state.banner = { text: text || "", life: 1 };
      if (state.quality === "low" || state.reduced) return;
      for (let n = 0; n < 5; n += 1) {
        state.sparks.push({
          i: index,
          age: 0,
          vx: (Math.random() - 0.5) * 0.18,
          vy: -0.12 - Math.random() * 0.16,
          life: 0.7 + Math.random() * 0.35,
          color: Math.random() > 0.5 ? "#ff85ad" : "#ffd27a"
        });
      }
    },
    setGuide(index) { state.guide = index; },
    setView(patch) { Object.assign(state, patch); },
    renderTo(ctx, w, h) { renderScene(ctx, w, h, state, true); }
  };
}
