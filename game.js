'use strict';
// =====================================================
//  미니 슈팅 - 게임 로직
//  순서: 설정 → 준비 → 효과음 → 게임 흐름 → 업데이트 → 그리기 → 입력 → 시작
// =====================================================

// ----- 설정값: 숫자를 바꿔 보면서 난이도를 조절해 보세요 -----
const CONFIG = {
  lives: 3,
  playerSpeed: 5.5,
  bulletSpeed: 9,
  fireCooldown: 12,       // 발사 간격 (프레임 단위, 60프레임 = 1초)
  invincibleFrames: 90,   // 맞은 뒤 무적 시간 (90프레임 = 1.5초)
  pointsPerLevel: 150,    // 이 점수마다 레벨이 올라요
  maxLevel: 10,
};
const BEST_KEY = 'mini-shooter-best';
const SOUND_KEY = 'mini-shooter-sound';

// ----- 준비: 화면 요소 찾기 -----
const $ = selector => document.querySelector(selector);
const canvas = $('#game');
const ctx = canvas.getContext('2d');
const ui = {
  score: $('#score'), level: $('#level'), best: $('#best'), lives: $('#lives'),
  startScreen: $('#start-screen'), pauseScreen: $('#pause-screen'), overScreen: $('#gameover-screen'),
  finalScore: $('#final-score'), newBest: $('#new-best'),
  pauseBtn: $('#pause-btn'), soundBtn: $('#sound-btn'),
};

// 고해상도(레티나) 화면에서 선명하게: 내부 해상도만 키우고 좌표계는 W×H 그대로 유지
const W = canvas.width, H = canvas.height;
const dpr = window.devicePixelRatio || 1;
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
bgGradient.addColorStop(0, '#0c1d36');
bgGradient.addColorStop(1, '#080f20');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 시크릿 모드 등에서는 localStorage가 막혀 있을 수 있어서 try/catch로 감싸요
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 게임은 계속 */ } },
};

// ----- 게임 상태 -----
// state: 'ready'(시작 전) | 'playing'(진행 중) | 'paused'(일시정지) | 'over'(종료)
let state = 'ready';
let player, bullets, enemies, particles, popups;
let score, lives, level, frame, lastShot;
let shake = 0, flash = 0, levelBanner = 0;
let best = Number(storage.get(BEST_KEY)) || 0;
const keys = new Set();
const stars = Array.from({ length: 75 }, () => ({
  x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.8 + 0.4,
}));

// ----- 효과음: Web Audio로 짧은 소리를 직접 만들어요 (소리 파일 필요 없음) -----
const sound = {
  ctx: null,
  enabled: storage.get(SOUND_KEY) !== 'off',

  // 브라우저는 사용자가 클릭하거나 키를 누른 뒤에만 소리를 낼 수 있게 해요
  unlock() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!this.ctx && AudioCtx) this.ctx = new AudioCtx();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  tone(freq, duration, type = 'square', volume = 0.05, slideTo) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  },

  shoot() { this.tone(880, 0.08, 'square', 0.025, 440); },
  hit() { this.tone(300, 0.06, 'square', 0.04); },
  explode() { this.tone(220, 0.25, 'sawtooth', 0.05, 40); },
  hurt() { this.tone(160, 0.35, 'triangle', 0.09, 50); },
  levelUp() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.04), i * 90)); },
  gameOver() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.08), i * 180)); },

  toggle() {
    this.enabled = !this.enabled;
    storage.set(SOUND_KEY, this.enabled ? 'on' : 'off');
    this.unlock();
    updateSoundButton();
  },
};

// ----- 게임 흐름 (화면 전환) -----
function resetGame() {
  player = { x: W / 2, y: H - 64, invincible: 0 };
  bullets = []; enemies = []; particles = []; popups = [];
  score = 0; lives = CONFIG.lives; level = 1; frame = 0;
  lastShot = -CONFIG.fireCooldown; // 시작하자마자 바로 쏠 수 있게
  shake = 0; flash = 0; levelBanner = 0;
  updateHud();
}

function setState(next) {
  state = next;
  document.body.dataset.state = state;
  ui.startScreen.hidden = state !== 'ready';
  ui.pauseScreen.hidden = state !== 'paused';
  ui.overScreen.hidden = state !== 'over';

  const canPause = state === 'playing' || state === 'paused';
  ui.pauseBtn.disabled = !canPause;
  ui.pauseBtn.textContent = state === 'paused' ? '▶' : '⏸';
  ui.pauseBtn.setAttribute('aria-label', state === 'paused' ? '계속하기' : '일시정지');

  // 키보드 사용자가 바로 Enter를 누를 수 있게 화면의 버튼에 포커스
  const screen = { ready: ui.startScreen, paused: ui.pauseScreen, over: ui.overScreen }[state];
  if (screen) screen.querySelector('button').focus({ preventScroll: true });
}

function startGame() {
  if (state === 'playing') return;
  sound.unlock();
  resetGame();
  setState('playing');
}

function togglePause() {
  if (state === 'playing') setState('paused');
  else if (state === 'paused') setState('playing');
}

function endGame() {
  const isNewBest = score > best;
  if (isNewBest) {
    best = score;
    storage.set(BEST_KEY, best);
  }
  // 남은 적은 모두 터뜨리고 총알은 정리
  enemies.forEach(e => burst(e.x, e.y, '#ff5470', 10, 3));
  enemies = []; bullets = [];
  ui.finalScore.textContent = score;
  ui.newBest.hidden = !isNewBest;
  updateHud();
  sound.gameOver();
  setState('over');
}

function updateHud() {
  ui.score.textContent = score;
  ui.level.textContent = level;
  ui.best.textContent = best;
  ui.lives.textContent = '❤️'.repeat(lives) + '🖤'.repeat(CONFIG.lives - lives);
  ui.lives.setAttribute('aria-label', `목숨 ${lives}개`);
}

// 숫자가 바뀔 때 살짝 커졌다 돌아오는 효과
function bump(el) {
  el.classList.remove('bump');
  void el.offsetWidth; // 애니메이션을 처음부터 다시 재생하기 위한 트릭
  el.classList.add('bump');
}

function updateSoundButton() {
  ui.soundBtn.textContent = sound.enabled ? '🔊' : '🔇';
  ui.soundBtn.setAttribute('aria-label', sound.enabled ? '소리 끄기' : '소리 켜기');
}

// ----- 업데이트: 1프레임마다 게임 세상을 한 걸음 진행 -----
function update() {
  updateStars();
  updateEffects();
  if (state !== 'playing') return;

  frame++;
  if (player.invincible > 0) player.invincible--;

  // 이동과 발사
  if (keys.has('ArrowLeft') || keys.has('KeyA')) player.x -= CONFIG.playerSpeed;
  if (keys.has('ArrowRight') || keys.has('KeyD')) player.x += CONFIG.playerSpeed;
  player.x = Math.max(22, Math.min(W - 22, player.x));
  if (keys.has('Space')) shoot();

  bullets.forEach(b => b.y -= CONFIG.bulletSpeed);
  bullets = bullets.filter(b => b.y > -10);

  // 레벨이 오를수록 적이 더 자주 나와요
  const spawnRate = Math.round(Math.max(24, 56 - (level - 1) * 3.5));
  if (frame % spawnRate === 0) spawnEnemy();
  enemies.forEach(e => {
    e.y += e.speed;
    if (e.hitFlash > 0) e.hitFlash--;
  });

  checkCollisions();
}

function shoot() {
  if (frame - lastShot < CONFIG.fireCooldown) return;
  bullets.push({ x: player.x, y: player.y - 20 });
  lastShot = frame;
  sound.shoot();
}

function spawnEnemy() {
  // 레벨 3부터 두 번 맞혀야 하는 단단한 적이 섞여 나와요
  const tough = level >= 3 && Math.random() < Math.min(0.35, (level - 2) * 0.07);
  const r = tough ? 22 + Math.random() * 5 : 15 + Math.random() * 7;
  const speed = (2 + Math.random() * 1.5 + (level - 1) * 0.35) * (tough ? 0.75 : 1);
  enemies.push({ x: r + Math.random() * (W - r * 2), y: -r, r, speed, tough, hp: tough ? 2 : 1, hitFlash: 0 });
}

function checkCollisions() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    // 총알에 맞았는지
    const hitIndex = bullets.findIndex(b => Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4);
    if (hitIndex !== -1) {
      bullets.splice(hitIndex, 1);
      e.hp--;
      e.hitFlash = 6;
      if (e.hp > 0) {
        sound.hit();
        burst(e.x, e.y, '#ffd28a', 6, 2);
        continue;
      }
      enemies.splice(i, 1);
      burst(e.x, e.y, e.tough ? '#ffb347' : '#ff5470', 18, 4);
      sound.explode();
      addScore(e.tough ? 25 : 10, e.x, e.y);
      continue;
    }

    // 플레이어와 부딪혔거나(무적이 아닐 때) 바닥까지 내려왔는지
    const hitPlayer = player.invincible === 0
      && Math.abs(e.x - player.x) < e.r + 16 && Math.abs(e.y - player.y) < e.r + 15;
    if (hitPlayer || e.y - e.r > H) {
      enemies.splice(i, 1);
      if (hitPlayer) burst(e.x, e.y, '#ff5470', 18, 4);
      if (loseLife()) break; // 게임이 끝났으면 나머지 적은 확인하지 않아요
    }
  }
}

function addScore(points, x, y) {
  score += points;
  popups.push({ x, y, text: `+${points}`, life: 40 });
  bump(ui.score);

  const newLevel = Math.min(CONFIG.maxLevel, 1 + Math.floor(score / CONFIG.pointsPerLevel));
  if (newLevel > level) {
    level = newLevel;
    levelBanner = 90;
    sound.levelUp();
    bump(ui.level);
  }
  updateHud();
}

// 목숨을 하나 잃어요. 게임이 끝났으면 true를 돌려줘요
function loseLife() {
  lives = Math.max(0, lives - 1);
  player.invincible = CONFIG.invincibleFrames;
  shake = reduceMotion ? 0 : 14;
  flash = 1;
  sound.hurt();
  updateHud();
  bump(ui.lives);
  if (lives === 0) {
    burst(player.x, player.y, '#50d9ff', 40, 6);
    endGame();
    return true;
  }
  return false;
}

// 폭발 파티클 만들기
function burst(x, y, color, count, power) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * power + 1;
    const life = 30 + Math.random() * 20;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color });
  }
}

function updateStars() {
  stars.forEach(s => {
    s.y += s.s;
    if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
  });
}

function updateEffects() {
  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.96; p.vy *= 0.96; p.life--; });
  particles = particles.filter(p => p.life > 0);
  popups.forEach(p => { p.y -= 0.8; p.life--; });
  popups = popups.filter(p => p.life > 0);
  if (shake > 0) shake--;
  if (flash > 0) flash = Math.max(0, flash - 0.05);
  if (levelBanner > 0) levelBanner--;
}

// ----- 그리기 -----
function draw() {
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.fillStyle = bgGradient;
  ctx.fillRect(-20, -20, W + 40, H + 40); // 화면이 흔들려도 가장자리가 비지 않게 넉넉히

  drawStars();
  drawBullets();
  drawEnemies();
  drawParticles();
  if (state !== 'over') drawShip();
  drawPopups();
  ctx.restore();

  // 맞았을 때 화면이 붉게 번쩍
  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 60, 90, ${flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (levelBanner > 0 && state === 'playing') drawLevelBanner();
}

function drawStars() {
  ctx.fillStyle = '#b9d8ff';
  stars.forEach(s => {
    ctx.globalAlpha = 0.35 + s.s / 3;
    ctx.fillRect(s.x, s.y, s.s, s.s);
  });
  ctx.globalAlpha = 1;
}

function drawBullets() {
  ctx.fillStyle = '#8df6ff';
  ctx.shadowColor = '#55eaff';
  ctx.shadowBlur = 10;
  bullets.forEach(b => ctx.fillRect(b.x - 2, b.y - 9, 4, 15));
  ctx.shadowBlur = 0;
}

function drawEnemies() {
  enemies.forEach(e => {
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.tough ? '#ff9f43' : '#ff5470';
    ctx.shadowColor = e.tough ? '#ff8a00' : '#ff334f';
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    if (e.tough) { // 단단한 적은 테두리 링
      ctx.strokeStyle = '#ffe0b3'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r - 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#641c3b'; // 눈
    ctx.beginPath();
    ctx.arc(e.x - 5, e.y - 2, 2, 0, Math.PI * 2);
    ctx.arc(e.x + 5, e.y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawShip() {
  // 무적 시간에는 깜빡여요
  if (player.invincible > 0 && Math.floor(player.invincible / 5) % 2 === 0) ctx.globalAlpha = 0.3;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = '#50d9ff';
  ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(19, 15); ctx.lineTo(0, 8); ctx.lineTo(-19, 15); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d9fbff';
  ctx.beginPath(); ctx.ellipse(0, 0, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffb84d'; // 엔진 불꽃
  ctx.beginPath(); ctx.moveTo(-6, 14); ctx.lineTo(0, 26 + Math.random() * 7); ctx.lineTo(6, 14); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  });
  ctx.globalAlpha = 1;
}

function drawPopups() {
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = '#ffe28a';
  popups.forEach(p => {
    ctx.globalAlpha = p.life / 40;
    ctx.fillText(p.text, p.x, p.y);
  });
  ctx.globalAlpha = 1;
}

function drawLevelBanner() {
  ctx.globalAlpha = Math.min(1, levelBanner / 20);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(`LEVEL ${level}`, W / 2, H / 2 - 60);
  ctx.globalAlpha = 1;
}

// ----- 게임 루프: 고정 60fps 스텝 -----
// 모니터 주사율(120/144Hz 등)과 상관없이 1초에 update()가 60번 실행돼요
const STEP = 1000 / 60;
let lastTime = null, acc = 0;
function loop(t) {
  if (lastTime !== null) acc += Math.min(t - lastTime, 100);
  lastTime = t;
  if (state === 'paused') acc = 0; // 일시정지 동안 쌓인 시간은 버려요
  while (acc >= STEP) { update(); acc -= STEP; }
  draw();
  requestAnimationFrame(loop);
}

// ----- 입력 -----
// e.code는 물리 키 기준이라 한/영 전환·CapsLock 상태와 무관하게 동작해요
const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'Space'];
window.addEventListener('keydown', e => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;

  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') sound.toggle();
  else if (state === 'ready' && (e.code === 'Enter' || e.code === 'Space')) startGame();
  else if (state === 'over' && (e.code === 'Enter' || e.code === 'KeyR')) startGame();
});
window.addEventListener('keyup', e => keys.delete(e.code));

// 다른 창/탭으로 가면 눌린 키를 모두 풀고 자동으로 일시정지
function onFocusLost() {
  keys.clear();
  if (state === 'playing') setState('paused');
}
window.addEventListener('blur', onFocusLost);
document.addEventListener('visibilitychange', () => { if (document.hidden) onFocusLost(); });

// 터치 버튼: 누르고 있는 동안 해당 키를 누른 것처럼 처리
document.querySelectorAll('#touch-controls [data-key]').forEach(button => {
  const key = button.dataset.key;
  button.addEventListener('pointerdown', e => {
    e.preventDefault();
    sound.unlock();
    button.setPointerCapture(e.pointerId);
    keys.add(key);
  });
  const release = e => { e.preventDefault(); keys.delete(key); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', () => keys.delete(key));
});

$('#start-btn').addEventListener('click', startGame);
$('#restart-btn').addEventListener('click', startGame);
$('#resume-btn').addEventListener('click', togglePause);
ui.pauseBtn.addEventListener('click', togglePause);
ui.soundBtn.addEventListener('click', () => sound.toggle());

// ----- 시작 -----
resetGame();
updateSoundButton();
setState('ready');
requestAnimationFrame(loop);
