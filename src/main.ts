import "./style.css";

type GameState = "start" | "playing" | "gameover";
type PowerKind = "slow" | "big" | "fire";

type Vec = { x: number; y: number };
type Particle = Vec & { vx: number; vy: number; life: number; max: number; color: string; size: number };
type Popup = Vec & { text: string; life: number; max: number; color: string };
type Powerup = Vec & { kind: PowerKind; radius: number; spin: number };

const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
if (!canvasElement) throw new Error("Canvas #game is missing");
const canvas: HTMLCanvasElement = canvasElement;

const canvasContext = canvas.getContext("2d", { alpha: false });
if (!canvasContext) throw new Error("2D canvas context is unavailable");
const ctx: CanvasRenderingContext2D = canvasContext;

const DPR_MAX = 2;
const BASE_W = 390;
const BASE_H = 844;
const PLAYER_Y = 0.83;
const AI_Y = 0.15;
const POWER_COLORS: Record<PowerKind, string> = {
  slow: "#71f6ff",
  big: "#d9ff5a",
  fire: "#ff4f9e"
};
const POWER_LABELS: Record<PowerKind, string> = {
  slow: "SLOW",
  big: "BIG",
  fire: "FIRE"
};

let width = BASE_W;
let height = BASE_H;
let scale = 1;
let last = performance.now();
let state: GameState = "start";
let score = 0;
let rally = 0;
let combo = 1;
let highScore = Number(localStorage.getItem("neon-rally-highscore") || 0);
let shake = 0;
let shakePhase = 0;
let flash = 0;
let spawnTimer = 4;
let slowTimer = 0;
let bigTimer = 0;
let fireTimer = 0;
let smashQueued = false;
let pointerDown = false;
let pointerX = BASE_W / 2;
let lastTap = 0;

const player = { x: BASE_W / 2, y: BASE_H * PLAYER_Y, w: 86, h: 16, targetX: BASE_W / 2 };
const ai = { x: BASE_W / 2, y: BASE_H * AI_Y, w: 92, h: 13 };
const ball = { x: BASE_W / 2, y: BASE_H * 0.62, vx: 92, vy: -410, r: 8, spin: 0, fire: 0 };
const ballTrail: Array<Vec & { life: number; max: number; radius: number }> = [];
const particles: Particle[] = [];
const popups: Popup[] = [];
const powerups: Powerup[] = [];

class Beeps {
  private audio?: AudioContext;

  play(type: "hit" | "score" | "power" | "miss" | "smash") {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    this.audio ??= new AudioCtor();
    const now = this.audio.currentTime;
    const osc = this.audio.createOscillator();
    const gain = this.audio.createGain();
    const freqs = {
      hit: [360, 720],
      score: [520, 980],
      power: [240, 680],
      miss: [120, 80],
      smash: [180, 1120]
    }[type];
    osc.type = type === "miss" ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(freqs[0], now);
    osc.frequency.exponentialRampToValueAtTime(freqs[1], now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === "smash" ? 0.08 : 0.045, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(this.audio.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const audio = new Beeps();

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  width = rect.width;
  height = rect.height;
  scale = Math.min(width / BASE_W, height / BASE_H);
  player.y = height * PLAYER_Y;
  ai.y = height * AI_Y;
  player.w = 86 * scale + (bigTimer > 0 ? 42 * scale : 0);
  player.h = 16 * scale;
  ai.w = 92 * scale;
  ai.h = 13 * scale;
  ball.r = 8 * scale;
}

function reset(startPlaying = true) {
  score = 0;
  rally = 0;
  combo = 1;
  shake = 0;
  flash = 0;
  spawnTimer = 2.8;
  slowTimer = 0;
  bigTimer = 0;
  fireTimer = 0;
  smashQueued = false;
  powerups.length = 0;
  ballTrail.length = 0;
  particles.length = 0;
  popups.length = 0;
  player.x = width / 2;
  player.targetX = width / 2;
  ai.x = width / 2;
  serve(-1);
  state = startPlaying ? "playing" : "start";
  document.body.classList.toggle("playing", state === "playing");
}

function serve(direction: 1 | -1) {
  ball.x = width / 2;
  ball.y = direction < 0 ? height * 0.62 : height * 0.38;
  const speed = 385 * scale;
  ball.vx = rand(-95, 95) * scale;
  ball.vy = direction * speed;
  ball.spin = rand(-18, 18) * scale;
  ball.fire = 0;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function startOrRestart() {
  audio.play("score");
  reset(true);
}

function onPointerDown(event: PointerEvent) {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  pointerDown = true;
  pointerX = event.clientX - canvas.getBoundingClientRect().left;
  player.targetX = pointerX;
  const now = performance.now();
  if (state !== "playing") {
    startOrRestart();
    return;
  }
  if (now - lastTap < 260 || Math.abs(ball.y - player.y) < 135 * scale) {
    smashQueued = true;
    addPopup(player.x, player.y - 34 * scale, "SMASH READY", "#ff4f9e");
  }
  lastTap = now;
}

function onPointerMove(event: PointerEvent) {
  if (!pointerDown && event.pointerType !== "mouse") return;
  pointerX = event.clientX - canvas.getBoundingClientRect().left;
  player.targetX = pointerX;
}

function onPointerUp(event: PointerEvent) {
  pointerDown = false;
  try {
    canvas.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
}

function keyboard(event: KeyboardEvent) {
  if (event.code === "Space" || event.code === "Enter") {
    event.preventDefault();
    state === "playing" ? (smashQueued = true) : startOrRestart();
  }
  if (event.code === "ArrowLeft") player.targetX -= 42 * scale;
  if (event.code === "ArrowRight") player.targetX += 42 * scale;
}

function update(rawDt: number) {
  const dt = Math.min(rawDt, 0.033);
  if (state !== "playing") {
    updateEffects(dt);
    return;
  }

  slowTimer = Math.max(0, slowTimer - dt);
  bigTimer = Math.max(0, bigTimer - dt);
  fireTimer = Math.max(0, fireTimer - dt);
  ball.fire = fireTimer;
  const timeScale = slowTimer > 0 ? 0.62 : 1;
  const gameDt = dt * timeScale;

  player.w = 86 * scale + (bigTimer > 0 ? 42 * scale : 0);
  player.targetX = clamp(player.targetX, 34 * scale, width - 34 * scale);
  player.x += (player.targetX - player.x) * (1 - Math.exp(-24 * dt));
  player.x = clamp(player.x, player.w / 2 + 12 * scale, width - player.w / 2 - 12 * scale);

  const aiDifficulty = clamp(0.64 + rally * 0.012, 0.64, 0.94);
  const predictedX = clamp(ball.x + ball.vx * 0.12, ai.w / 2 + 12 * scale, width - ai.w / 2 - 12 * scale);
  ai.x += (predictedX - ai.x) * (1 - Math.exp(-aiDifficulty * 7.2 * dt));

  ball.vx += ball.spin * gameDt * 6.5;
  ballTrail.push({ x: ball.x, y: ball.y, life: 0.18, max: 0.18, radius: ball.r });
  if (ballTrail.length > 12) ballTrail.shift();
  ball.x += ball.vx * gameDt;
  ball.y += ball.vy * gameDt;
  ball.spin *= 0.994;

  if (ball.x < 18 * scale + ball.r || ball.x > width - 18 * scale - ball.r) {
    ball.x = clamp(ball.x, 18 * scale + ball.r, width - 18 * scale - ball.r);
    ball.vx *= -0.92;
    ball.spin *= -0.55;
    shake = Math.max(shake, 4 * scale);
    burst(ball.x, ball.y, "#71f6ff", 7);
    audio.play("hit");
  }

  checkRacket(player, -1);
  checkRacket(ai, 1);
  collectPowerups();
  updatePowerups(gameDt);
  updateEffects(dt);

  spawnTimer -= gameDt;
  if (spawnTimer <= 0) {
    spawnTimer = rand(5.2, 8.6);
    spawnPowerup();
  }

  if (ball.y > height + 42 * scale) endGame();
  if (ball.y < -52 * scale) {
    score += 25 * combo;
    addPopup(width / 2, height * 0.28, `ACE +${25 * combo}`, "#d9ff5a");
    serve(1);
  }
}

function checkRacket(racket: typeof player | typeof ai, dir: 1 | -1) {
  const isPlayer = dir < 0;
  const movingToward = isPlayer ? ball.vy > 0 : ball.vy < 0;
  if (!movingToward) return;
  const halfW = racket.w / 2;
  const withinX = ball.x > racket.x - halfW - ball.r && ball.x < racket.x + halfW + ball.r;
  const withinY = Math.abs(ball.y - racket.y) < racket.h / 2 + ball.r + 4 * scale;
  if (!withinX || !withinY) return;

  const offset = clamp((ball.x - racket.x) / halfW, -1, 1);
  const speedBoost = clamp(1 + rally * 0.008, 1, 1.34);
  const smash = isPlayer && smashQueued;
  const baseSpeed = (isPlayer ? 430 : 385) * scale * speedBoost * (smash || fireTimer > 0 ? 1.24 : 1);
  ball.y = racket.y + dir * (racket.h / 2 + ball.r + 2 * scale);
  ball.vy = dir * baseSpeed;
  ball.vx = offset * 310 * scale + (isPlayer ? (player.x - player.targetX) * -0.4 : rand(-30, 30) * scale);
  ball.spin = offset * 88 * scale + rand(-12, 12) * scale;

  if (isPlayer) {
    rally += 1;
    combo = 1 + Math.floor(rally / 8);
    const gained = (smash ? 16 : 10) * combo;
    score += gained;
    addPopup(ball.x, ball.y - 22 * scale, `+${gained}`, smash ? "#ff4f9e" : "#f6fbff");
    if (smash) flash = 0.32;
  }

  smashQueued = false;
  shake = Math.max(shake, (smash ? 10 : 5) * scale);
  burst(ball.x, ball.y, smash || fireTimer > 0 ? "#ff4f9e" : "#71f6ff", smash ? 24 : 14);
  audio.play(smash ? "smash" : "hit");
}

function endGame() {
  state = "gameover";
  document.body.classList.remove("playing");
  highScore = Math.max(highScore, score);
  localStorage.setItem("neon-rally-highscore", String(highScore));
  burst(ball.x, height - 60 * scale, "#ff4f9e", 42);
  addPopup(width / 2, height * 0.53, "RALLY LOST", "#ff4f9e");
  audio.play("miss");
}

function spawnPowerup() {
  const kinds: PowerKind[] = ["slow", "big", "fire"];
  powerups.push({
    kind: kinds[Math.floor(Math.random() * kinds.length)],
    x: rand(62 * scale, width - 62 * scale),
    y: rand(height * 0.31, height * 0.66),
    radius: 17 * scale,
    spin: rand(0, Math.PI * 2)
  });
}

function collectPowerups() {
  for (let i = powerups.length - 1; i >= 0; i -= 1) {
    const p = powerups[i];
    const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (dist > p.radius + ball.r) continue;
    powerups.splice(i, 1);
    if (p.kind === "slow") slowTimer = 5.2;
    if (p.kind === "big") bigTimer = 6.2;
    if (p.kind === "fire") fireTimer = 5.5;
    score += 35 * combo;
    addPopup(p.x, p.y, `${POWER_LABELS[p.kind]} +${35 * combo}`, POWER_COLORS[p.kind]);
    burst(p.x, p.y, POWER_COLORS[p.kind], 34);
    audio.play("power");
  }
}

function updatePowerups(dt: number) {
  for (const p of powerups) p.spin += dt * 3;
}

function updateEffects(dt: number) {
  shakePhase += dt * 42;
  shake = Math.max(0, shake - dt * 28 * scale);
  flash = Math.max(0, flash - dt);
  for (let i = ballTrail.length - 1; i >= 0; i -= 1) {
    ballTrail[i].life -= dt;
    if (ballTrail[i].life <= 0) ballTrail.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 210 * scale * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = popups.length - 1; i >= 0; i -= 1) {
    const p = popups[i];
    p.life -= dt;
    p.y -= 32 * scale * dt;
    if (p.life <= 0) popups.splice(i, 1);
  }
}

function burst(x: number, y: number, color: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(50, 260) * scale;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.28, 0.72),
      max: 0.72,
      color,
      size: rand(1.5, 4.2) * scale
    });
  }
}

function addPopup(x: number, y: number, text: string, color: string) {
  popups.push({ x, y, text, life: 0.85, max: 0.85, color });
}

function draw() {
  const sx = shake ? Math.sin(shakePhase * 1.9) * shake : 0;
  const sy = shake ? Math.cos(shakePhase * 2.3) * shake * 0.72 : 0;
  ctx.save();
  ctx.translate(sx, sy);
  drawCourt();
  drawPowerups();
  drawRacket(ai, "#71f6ff", "#0ff");
  drawRacket(player, bigTimer > 0 ? "#d9ff5a" : "#ff4f9e", bigTimer > 0 ? "#d9ff5a" : "#ff2f9c");
  drawBallTrail();
  drawBall();
  drawParticles();
  drawHud();
  if (state !== "playing") drawOverlay();
  if (flash > 0) {
    ctx.globalAlpha = Math.min(0.22, flash);
    ctx.fillStyle = "#ff4f9e";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

function drawCourt() {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, "#0b1230");
  g.addColorStop(0.52, "#12173c");
  g.addColorStop(1, "#090b1d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(113, 246, 255, 0.55)";
  ctx.lineWidth = 2 * scale;
  ctx.shadowColor = "#18e7ff";
  ctx.shadowBlur = 14 * scale;
  const margin = 27 * scale;
  const top = 92 * scale;
  const bottom = height - 84 * scale;
  roundedStroke(margin, top, width - margin * 2, bottom - top, 8 * scale);
  line(width / 2, top, width / 2, bottom);
  line(margin, height / 2, width - margin, height / 2);
  line(margin + 54 * scale, top, margin + 54 * scale, bottom);
  line(width - margin - 54 * scale, top, width - margin - 54 * scale, bottom);
  ctx.strokeStyle = "rgba(255, 79, 158, 0.62)";
  line(margin, player.y + 30 * scale, width - margin, player.y + 30 * scale);
  line(margin, ai.y - 28 * scale, width - margin, ai.y - 28 * scale);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (let y = 105 * scale; y < height - 85 * scale; y += 28 * scale) {
    line(30 * scale, y, width - 30 * scale, y);
  }
  ctx.restore();
}

function drawRacket(racket: typeof player | typeof ai, fill: string, glow: string) {
  ctx.save();
  ctx.translate(racket.x, racket.y);
  ctx.shadowColor = glow;
  ctx.shadowBlur = 18 * scale;
  ctx.fillStyle = fill;
  roundRect(-racket.w / 2, -racket.h / 2, racket.w, racket.h, 7 * scale);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  roundRect(-racket.w * 0.18, -racket.h * 0.5, racket.w * 0.36, racket.h, 4 * scale);
  ctx.fill();
  ctx.restore();
}

function drawBallTrail() {
  if (ballTrail.length === 0) return;
  ctx.save();
  ctx.shadowColor = fireTimer > 0 ? "#ff4f9e" : "#71f6ff";
  ctx.shadowBlur = 14 * scale;
  for (const point of ballTrail) {
    const alpha = Math.max(0, point.life / point.max) * 0.28;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fireTimer > 0 ? "#ff4f9e" : "#d9ff5a";
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.radius * (0.55 + alpha), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawBall() {
  ctx.save();
  ctx.shadowColor = fireTimer > 0 ? "#ff2f3f" : "#d9ff5a";
  ctx.shadowBlur = (fireTimer > 0 ? 26 : 17) * scale;
  const gradient = ctx.createRadialGradient(ball.x - ball.r * 0.35, ball.y - ball.r * 0.35, 1, ball.x, ball.y, ball.r * 1.5);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.32, fireTimer > 0 ? "#ffd15a" : "#eaff80");
  gradient.addColorStop(1, fireTimer > 0 ? "#ff2f3f" : "#49e68f");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPowerups() {
  for (const p of powerups) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.shadowColor = POWER_COLORS[p.kind];
    ctx.shadowBlur = 16 * scale;
    ctx.strokeStyle = POWER_COLORS[p.kind];
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = `${Math.max(9, 9 * scale)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.kind === "slow" ? "S" : p.kind === "big" ? "B" : "F", 0, 1 * scale);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8 * scale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10 * scale;
    ctx.font = `800 ${Math.max(13, 17 * scale)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  ctx.save();
  ctx.fillStyle = "#f6fbff";
  ctx.shadowColor = "#71f6ff";
  ctx.shadowBlur = 10 * scale;
  ctx.font = `900 ${Math.max(26, 34 * scale)}px ui-sans-serif, system-ui`;
  ctx.textAlign = "left";
  ctx.fillText(String(score), 24 * scale, 45 * scale);
  ctx.font = `700 ${Math.max(11, 13 * scale)}px ui-sans-serif, system-ui`;
  ctx.fillStyle = "rgba(246,251,255,0.72)";
  ctx.fillText(`RALLY ${rally}  x${combo}`, 26 * scale, 66 * scale);
  ctx.textAlign = "right";
  ctx.fillText(`BEST ${highScore}`, width - 24 * scale, 43 * scale);
  drawTimers();
  ctx.restore();
}

function drawTimers() {
  const active = [
    ["SLOW", slowTimer, POWER_COLORS.slow],
    ["BIG", bigTimer, POWER_COLORS.big],
    ["FIRE", fireTimer, POWER_COLORS.fire]
  ] as const;
  let y = 63 * scale;
  ctx.textAlign = "right";
  for (const [label, timer, color] of active) {
    if (timer <= 0) continue;
    ctx.fillStyle = color;
    ctx.fillText(`${label} ${timer.toFixed(1)}`, width - 24 * scale, y);
    y += 18 * scale;
  }
}

function drawOverlay() {
  ctx.save();
  ctx.fillStyle = "rgba(5, 7, 18, 0.72)";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.shadowColor = "#18e7ff";
  ctx.shadowBlur = 22 * scale;
  ctx.fillStyle = "#f6fbff";
  ctx.font = `900 ${Math.max(36, 48 * scale)}px ui-sans-serif, system-ui`;
  const title = state === "start" ? "NEON RALLY" : "GAME OVER";
  ctx.fillText(title, width / 2, height * 0.34);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(246,251,255,0.78)";
  ctx.font = `700 ${Math.max(14, 17 * scale)}px ui-sans-serif, system-ui`;
  if (state === "start") {
    ctx.fillText("Drag the racket. Tap near impact for a smash.", width / 2, height * 0.41);
    ctx.fillText("Collect SLOW, BIG, and FIRE powerups.", width / 2, height * 0.445);
  } else {
    ctx.fillText(`Score ${score}  |  Best ${highScore}`, width / 2, height * 0.41);
    ctx.fillText(`Longest rally this run: ${rally}`, width / 2, height * 0.445);
  }
  ctx.fillStyle = "#ff4f9e";
  ctx.shadowColor = "#ff4f9e";
  ctx.shadowBlur = 16 * scale;
  ctx.font = `900 ${Math.max(15, 18 * scale)}px ui-sans-serif, system-ui`;
  ctx.fillText("TAP TO PLAY", width / 2, height * 0.535);
  ctx.restore();
}

function roundedStroke(x: number, y: number, w: number, h: number, r: number) {
  roundRect(x, y, w, h, r);
  ctx.stroke();
}

function roundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function line(x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

const STEP = 1 / 120;
let accumulator = 0;

function loop(now: number) {
  const frameTime = Math.min((now - last) / 1000, 0.05);
  last = now;
  accumulator += frameTime;
  let steps = 0;
  while (accumulator >= STEP && steps < 8) {
    update(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 8) accumulator = 0;
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", keyboard);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);

resize();
reset(false);
requestAnimationFrame(loop);
