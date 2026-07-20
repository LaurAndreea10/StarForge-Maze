'use strict';

/* ============================================================
   StarForge Maze
   Generator de labirint + stare de joc + randare canvas.
   Toate ID-urile din index.html sunt legate aici.
   ============================================================ */

const $ = (id) => document.getElementById(id);

const el = {
  canvas: $('gameCanvas'),
  soundButton: $('soundButton'),
  helpButton: $('helpButton'),
  themeButton: $('themeButton'),
  helpDialog: $('helpDialog'),
  closeHelpButton: $('closeHelpButton'),
  modeSelect: $('modeSelect'),
  difficultySelect: $('difficultySelect'),
  starsValue: $('starsValue'),
  starsTotal: $('starsTotal'),
  scoreValue: $('scoreValue'),
  comboValue: $('comboValue'),
  timeValue: $('timeValue'),
  livesValue: $('livesValue'),
  levelValue: $('levelValue'),
  bestValue: $('bestValue'),
  statusBadge: $('statusBadge'),
  objectiveText: $('objectiveText'),
  pauseButton: $('pauseButton'),
  restartButton: $('restartButton'),
  progressText: $('progressText'),
  progressTrack: $('progressTrack'),
  progressBar: $('progressBar'),
  pauseOverlay: $('pauseOverlay'),
  resumeButton: $('resumeButton'),
  resultOverlay: $('resultOverlay'),
  resultIcon: $('resultIcon'),
  resultTitle: $('resultTitle'),
  resultText: $('resultText'),
  resultScore: $('resultScore'),
  resultStars: $('resultStars'),
  resultMoves: $('resultMoves'),
  nextLevelButton: $('nextLevelButton'),
  playAgainButton: $('playAgainButton'),
  messageBox: $('messageBox'),
  energyValue: $('energyValue'),
  energyTrack: $('energyTrack'),
  energyBar: $('energyBar'),
  coinValue: $('coinValue'),
  keyValue: $('keyValue'),
  shieldValue: $('shieldValue'),
  missionStars: $('missionStars'),
  missionStarsText: $('missionStarsText'),
  missionKey: $('missionKey'),
  missionKeyText: $('missionKeyText'),
  missionPortal: $('missionPortal'),
  missionPortalText: $('missionPortalText'),
  undoTool: $('undoTool'),
  hintTool: $('hintTool')
};

const ctx = el.canvas.getContext('2d');
const toolButtons = Array.from(document.querySelectorAll('.tool-button[data-tool]'));

const DIFFICULTY = {
  easy:   { size: 11, time: 150, traps: 0.02, lives: 4, stars: 5 },
  normal: { size: 15, time: 110, traps: 0.05, lives: 3, stars: 7 },
  hard:   { size: 19, time: 85,  traps: 0.09, lives: 2, stars: 9 }
};

const TILE = { WALL: 0, FLOOR: 1 };
const STORAGE_KEY = 'starforge.best.v1';
const THEME_KEY = 'starforge.theme.v1';
const SOUND_KEY = 'starforge.sound.v1';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Stare ---------- */

const state = {
  grid: [],
  size: 15,
  player: { x: 1, y: 1 },
  portal: { x: 1, y: 1 },
  stars: [],
  crystals: [],
  traps: [],
  energyPickups: [],
  key: null,
  hasKey: false,
  starsCollected: 0,
  starsTarget: 0,
  score: 0,
  combo: 1,
  comboTimer: 0,
  lives: 3,
  level: 1,
  moves: 0,
  energy: 100,
  crystalCount: 0,
  keyCount: 0,
  shieldCount: 0,
  timeLeft: 110,
  running: false,
  paused: false,
  finished: false,
  activeTool: null,
  shieldTurns: 0,
  magnetTurns: 0,
  scanTurns: 0,
  hintPath: [],
  trail: [],
  history: [],
  best: 0,
  soundOn: true
};

/* ---------- Sunet (WebAudio, fara fisiere) ---------- */

let audioCtx = null;

function beep(freq, duration = 0.08, type = 'sine', gain = 0.05) {
  if (!state.soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    vol.gain.value = gain;
    vol.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(vol).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (_) { /* audio indisponibil */ }
}

const SFX = {
  move:    () => beep(220, 0.04, 'square', 0.02),
  star:    () => beep(880, 0.12, 'triangle', 0.06),
  crystal: () => beep(660, 0.09, 'sine', 0.05),
  key:     () => beep(1040, 0.16, 'triangle', 0.06),
  trap:    () => beep(120, 0.22, 'sawtooth', 0.06),
  tool:    () => beep(520, 0.07, 'sine', 0.04),
  win:     () => { beep(660, 0.1); setTimeout(() => beep(880, 0.1), 90); setTimeout(() => beep(1180, 0.2), 190); },
  lose:    () => { beep(220, 0.18, 'sawtooth', 0.06); setTimeout(() => beep(140, 0.3, 'sawtooth', 0.06), 150); }
};

/* ---------- Generator labirint (recursive backtracker) ---------- */

function generateMaze(size) {
  const grid = Array.from({ length: size }, () => new Array(size).fill(TILE.WALL));
  const stack = [{ x: 1, y: 1 }];
  grid[1][1] = TILE.FLOOR;

  const dirs = [{ x: 0, y: -2 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: -2, y: 0 }];

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = [];

    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && grid[ny][nx] === TILE.WALL) {
        options.push({ nx, ny, wx: cur.x + d.x / 2, wy: cur.y + d.y / 2 });
      }
    }

    if (!options.length) {
      stack.pop();
      continue;
    }

    const pick = options[Math.floor(Math.random() * options.length)];
    grid[pick.wy][pick.wx] = TILE.FLOOR;
    grid[pick.ny][pick.nx] = TILE.FLOOR;
    stack.push({ x: pick.nx, y: pick.ny });
  }

  // Cateva bucle, ca sa nu fie labirint perfect (mai jucabil).
  // Spargem doar pereti care unesc doua zone deja existente de podea,
  // altfel putem crea celule izolate unde ar cadea stele inaccesibile.
  const inner = size - 4;
  if (inner >= 1) {
    const loops = Math.floor(size / 2);
    for (let i = 0; i < loops; i++) {
      const x = 2 + Math.floor(Math.random() * inner);
      const y = 2 + Math.floor(Math.random() * inner);
      if (grid[y][x] !== TILE.WALL) continue;

      const horizontal = grid[y][x - 1] === TILE.FLOOR && grid[y][x + 1] === TILE.FLOOR;
      const vertical = grid[y - 1][x] === TILE.FLOOR && grid[y + 1][x] === TILE.FLOOR;

      if (horizontal || vertical) grid[y][x] = TILE.FLOOR;
    }
  }

  return grid;
}

function floorCells(grid) {
  const cells = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid.length; x++) {
      if (grid[y][x] === TILE.FLOOR) cells.push({ x, y });
    }
  }
  return cells;
}

function bfs(grid, from, to) {
  const size = grid.length;
  const key = (p) => p.y * size + p.x;
  const queue = [from];
  const prev = new Map([[key(from), null]]);
  const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      let node = cur;
      while (node) {
        path.unshift(node);
        node = prev.get(key(node));
      }
      return path;
    }
    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (grid[ny][nx] !== TILE.FLOOR) continue;
      const nk = ny * size + nx;
      if (prev.has(nk)) continue;
      prev.set(nk, cur);
      queue.push({ x: nx, y: ny });
    }
  }
  return [];
}

// BFS care evita celulele din `blocked` (set de chei y*size+x).
// Folosit pentru garantia de traseu sigur si pentru indiciu ocolind capcanele.
function bfsAvoiding(grid, from, to, blocked) {
  const size = grid.length;
  const key = (p) => p.y * size + p.x;
  if (blocked.has(key(to))) return [];
  const queue = [from];
  const prev = new Map([[key(from), null]]);
  const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

  while (queue.length) {
    const cur = queue.shift();
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      let node = cur;
      while (node) { path.unshift(node); node = prev.get(key(node)); }
      return path;
    }
    for (const d of dirs) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (grid[ny][nx] !== TILE.FLOOR) continue;
      const nk = ny * size + nx;
      if (prev.has(nk) || blocked.has(nk)) continue;
      prev.set(nk, cur);
      queue.push({ x: nx, y: ny });
    }
  }
  return [];
}

/* ---------- Construire nivel ---------- */

function buildLevel(keepScore = false) {
  const cfg = DIFFICULTY[el.difficultySelect.value];
  const mode = el.modeSelect.value;

  state.size = cfg.size;
  state.grid = generateMaze(cfg.size);

  const cells = floorCells(state.grid).filter((c) => !(c.x === 1 && c.y === 1));
  shuffle(cells);

  state.player = { x: 1, y: 1 };
  state.portal = cells.pop() || { x: 1, y: 1 };

  const starCount = Math.min(cfg.stars + Math.floor(state.level / 2), cells.length);
  state.stars = cells.splice(0, starCount);
  state.crystals = cells.splice(0, Math.min(4, cells.length));
  state.energyPickups = cells.splice(0, Math.min(3, cells.length));
  state.key = cells.pop() || null;

  const trapCount = Math.floor(cells.length * cfg.traps);
  state.traps = cells.splice(0, trapCount);

  // Garantie de traseu sigur: trebuie sa existe drum start -> cheie -> portal
  // FARA a calca vreo capcana. Daca nu exista, scot capcanele care blocheaza,
  // pe rand, pana cand traseul devine posibil. Rezolva situatia "× fara alternativa".
  ensureSafeRoute();

  state.starsTarget = state.stars.length;
  state.starsCollected = 0;
  state.hasKey = false;
  state.moves = 0;
  state.energy = 100;
  state.combo = 1;
  state.comboTimer = 0;
  state.hintPath = [];
  state.history = [];
  state.activeTool = null;
  state.shieldTurns = 0;
  state.magnetTurns = 0;
  state.scanTurns = 0;
  state.finished = false;
  state.paused = false;

  state.timeLeft = mode === 'survival' ? cfg.time * 2 : cfg.time;
  if (mode === 'challenge') state.timeLeft = Math.round(cfg.time * 0.7);

  if (!keepScore) {
    state.score = 0;
    state.level = 1;
    state.crystalCount = 0;
    state.keyCount = 0;
    state.shieldCount = 0;
  }

  state.lives = mode === 'survival' ? 1 : cfg.lives;
  state.running = true;
  state.trail = [];

  hideOverlays();
  setStatus('Misiune activă', '');
  el.objectiveText.textContent = 'Colectează toate stelele.';
  message('Misiune începută. Găsește prima steluță.');
  toolButtons.forEach((b) => b.setAttribute('aria-pressed', 'false'));
  syncUI();
  draw();
}

// Asigura ca exista un drum start -> cheie -> portal fara capcane.
// Scoate iterativ capcanele de pe traseul cel mai scurt pana devine liber.
function ensureSafeRoute() {
  const size = state.grid.length;
  const keyOf = (p) => p.y * size + p.x;
  const waypoints = [state.player];
  if (state.key) waypoints.push(state.key);
  waypoints.push(state.portal);

  for (let guard = 0; guard < 200; guard++) {
    const trapSet = new Set(state.traps.map(keyOf));
    let blockedSegment = null;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const path = bfsAvoiding(state.grid, waypoints[i], waypoints[i + 1], trapSet);
      if (!path.length) { blockedSegment = [waypoints[i], waypoints[i + 1]]; break; }
    }

    if (!blockedSegment) return; // traseu sigur gasit

    // Traseul ignorand capcanele; scot prima capcana intalnita pe el.
    const raw = bfs(state.grid, blockedSegment[0], blockedSegment[1]);
    const onPath = raw.find((c) => trapSet.has(keyOf(c)));
    if (!onPath) return; // nimic de scos (nu ar trebui sa se ajunga aici)
    const idx = state.traps.findIndex((t) => t.x === onPath.x && t.y === onPath.y);
    if (idx !== -1) state.traps.splice(idx, 1);
    else return;
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------- Mișcare ---------- */

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function move(direction) {
  if (!state.running || state.paused || state.finished) return;

  const d = DIRECTIONS[direction];
  if (!d) return;

  const nx = state.player.x + d.x;
  const ny = state.player.y + d.y;

  if (nx < 0 || ny < 0 || nx >= state.size || ny >= state.size) return;
  if (state.grid[ny][nx] !== TILE.FLOOR) {
    message('Perete. Încearcă altă direcție.');
    return;
  }

  state.history.push({
    player: { ...state.player },
    score: state.score,
    starsCollected: state.starsCollected,
    stars: state.stars.map((s) => ({ ...s })),
    crystals: state.crystals.map((c) => ({ ...c })),
    energyPickups: state.energyPickups.map((e) => ({ ...e })),
    traps: state.traps.map((t) => ({ ...t })),
    lives: state.lives,
    hasKey: state.hasKey,
    energy: state.energy,
    combo: state.combo,
    trail: state.trail.slice()
  });
  if (state.history.length > 40) state.history.shift();

  state.trail.push({ x: state.player.x, y: state.player.y });
  if (state.trail.length > 24) state.trail.shift();

  state.player = { x: nx, y: ny };
  state.moves += 1;
  state.hintPath = [];
  SFX.move();

  if (state.shieldTurns > 0) state.shieldTurns -= 1;
  if (state.magnetTurns > 0) state.magnetTurns -= 1;
  if (state.scanTurns > 0) state.scanTurns -= 1;

  collect();
  if (state.magnetTurns > 0) magnetPull();
  checkTraps();
  checkPortal();
  syncUI();
  draw();
}

function at(list, x, y) {
  return list.findIndex((p) => p.x === x && p.y === y);
}

function collect() {
  const { x, y } = state.player;

  const si = at(state.stars, x, y);
  if (si !== -1) {
    state.stars.splice(si, 1);
    state.starsCollected += 1;
    state.combo = Math.min(state.combo + 1, 9);
    state.comboTimer = 6;
    state.score += 100 * state.combo;
    SFX.star();
    message(`Stea colectată! Combo x${state.combo}.`);
    pulse(el.starsValue);
  }

  const ci = at(state.crystals, x, y);
  if (ci !== -1) {
    state.crystals.splice(ci, 1);
    state.crystalCount += 1;
    state.score += 50;
    SFX.crystal();
    message('Cristal recuperat. +50 puncte.');
  }

  const ei = at(state.energyPickups, x, y);
  if (ei !== -1) {
    state.energyPickups.splice(ei, 1);
    state.energy = Math.min(100, state.energy + 30);
    SFX.crystal();
    message('Energie recuperată. +30%.');
  }

  if (state.key && state.key.x === x && state.key.y === y) {
    state.key = null;
    state.hasKey = true;
    state.keyCount += 1;
    state.score += 150;
    SFX.key();
    message('Cheie recuperată. Portalul poate fi deblocat.');
  }
}

function magnetPull() {
  const { x, y } = state.player;
  const radius = 2;
  for (let i = state.stars.length - 1; i >= 0; i--) {
    const s = state.stars[i];
    if (Math.abs(s.x - x) <= radius && Math.abs(s.y - y) <= radius) {
      state.stars.splice(i, 1);
      state.starsCollected += 1;
      state.score += 80;
      SFX.star();
    }
  }
}

function checkTraps() {
  const idx = at(state.traps, state.player.x, state.player.y);
  if (idx === -1) return;

  if (state.shieldTurns > 0 || state.shieldCount > 0) {
    if (state.shieldTurns <= 0) state.shieldCount -= 1;
    state.traps.splice(idx, 1);
    message('Scutul a absorbit capcana.');
    SFX.tool();
    return;
  }

  state.traps.splice(idx, 1);
  state.lives -= 1;
  state.combo = 1;
  state.score = Math.max(0, state.score - 60);
  SFX.trap();
  pulse(el.livesValue);
  message('Capcană! Ai pierdut o viață.');

  if (state.lives <= 0) {
    finish(false, 'Nucleul a cedat. Misiune eșuată.');
  }
}

function checkPortal() {
  const onPortal = state.player.x === state.portal.x && state.player.y === state.portal.y;
  if (!onPortal) return;

  if (state.starsCollected < state.starsTarget) {
    message(`Portal blocat. Mai ai ${state.starsTarget - state.starsCollected} stele.`);
    return;
  }
  if (!state.hasKey) {
    message('Portal blocat. Ai nevoie de cheie.');
    return;
  }

  const timeBonus = Math.round(state.timeLeft * 5);
  state.score += 500 + timeBonus;
  finish(true, `Portal activat. Bonus de timp: ${timeBonus} puncte.`);
}

/* ---------- Unelte ---------- */

function spendEnergy(cost) {
  if (state.energy < cost) {
    message('Energie insuficientă.');
    return false;
  }
  state.energy -= cost;
  return true;
}

function useTool(name, cost, button) {
  if (!state.running || state.paused || state.finished) return;
  if (!spendEnergy(cost)) { syncUI(); return; }

  SFX.tool();

  if (name === 'scan') {
    state.scanTurns = 8;
    message('Scanner activ. Capcanele sunt vizibile 8 mișcări.');
  } else if (name === 'shield') {
    state.shieldTurns = 10;
    state.shieldCount += 1;
    message('Scut activ pentru 10 mișcări.');
  } else if (name === 'magnet') {
    state.magnetTurns = 6;
    message('Magnet activ. Atrage stelele din apropiere.');
  } else if (name === 'teleport') {
    const cells = floorCells(state.grid);
    const target = cells[Math.floor(Math.random() * cells.length)];
    state.player = { x: target.x, y: target.y };
    collect();
    checkTraps();
    checkPortal();
    message('Teleportare efectuată.');
  }

  if (button) {
    button.setAttribute('aria-pressed', 'true');
    setTimeout(() => button.setAttribute('aria-pressed', 'false'), 1200);
  }

  syncUI();
  draw();
}

function undo() {
  if (!state.history.length) {
    message('Nu mai există mișcări de anulat.');
    return;
  }
  const prev = state.history.pop();
  state.player = prev.player;
  state.score = prev.score;
  state.starsCollected = prev.starsCollected;
  state.stars = prev.stars;
  state.crystals = prev.crystals;
  state.energyPickups = prev.energyPickups;
  state.traps = prev.traps;
  state.lives = prev.lives;
  state.hasKey = prev.hasKey;
  state.energy = prev.energy;
  state.combo = prev.combo;
  state.trail = prev.trail;
  state.moves = Math.max(0, state.moves - 1);
  SFX.tool();
  message('Mișcare anulată.');
  syncUI();
  draw();
}

function hint() {
  if (!spendEnergy(10)) { syncUI(); return; }
  const target = state.stars.length
    ? state.stars[0]
    : (state.key || state.portal);
  const size = state.grid.length;
  const trapSet = new Set(state.traps.map((t) => t.y * size + t.x));
  let path = bfsAvoiding(state.grid, state.player, target, trapSet);
  if (!path.length) path = bfs(state.grid, state.player, target); // fallback
  state.hintPath = path;
  SFX.tool();
  message('Indiciu afișat. Traseul ocolește capcanele cunoscute.');
  syncUI();
  draw();
}

/* ---------- Final ---------- */

function finish(won, text) {
  state.running = false;
  state.finished = true;

  if (state.score > state.best) {
    state.best = state.score;
    try { localStorage.setItem(STORAGE_KEY, String(state.best)); } catch (_) {}
  }

  el.resultIcon.textContent = won ? '★' : '✕';
  el.resultTitle.textContent = won ? 'Misiune completă' : 'Misiune eșuată';
  el.resultText.textContent = text;
  el.resultScore.textContent = state.score;
  el.resultStars.textContent = `${state.starsCollected}/${state.starsTarget}`;
  el.resultMoves.textContent = state.moves;
  el.nextLevelButton.hidden = !won;
  el.resultOverlay.classList.remove('hidden');

  setStatus(won ? 'Misiune completă' : 'Misiune eșuată', won ? '' : 'over');
  won ? SFX.win() : SFX.lose();
  syncUI();

  const focusTarget = won ? el.nextLevelButton : el.playAgainButton;
  setTimeout(() => focusTarget.focus(), 50);
}

function nextLevel() {
  state.level += 1;
  buildLevel(true);
}

/* ---------- UI ---------- */

function setStatus(text, variant) {
  el.statusBadge.textContent = text;
  el.statusBadge.className = 'status-badge' + (variant ? ` ${variant}` : '');
}

function message(text) {
  el.messageBox.textContent = text;
}

function pulse(node) {
  if (reducedMotion) return;
  const card = node.closest('.stat-card');
  if (!card) return;
  card.classList.remove('pulse');
  void card.offsetWidth;
  card.classList.add('pulse');
}

function formatTime(seconds) {
  const m = String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0');
  const s = String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function syncUI() {
  el.starsValue.textContent = state.starsCollected;
  el.starsTotal.textContent = state.starsTarget;
  el.scoreValue.textContent = state.score;
  el.comboValue.textContent = state.combo > 1 && state.comboTimer > 0
    ? `x${state.combo} (${state.comboTimer}s)`
    : `x${state.combo}`;
  el.timeValue.textContent = formatTime(state.timeLeft);
  el.levelValue.textContent = state.level;
  el.bestValue.textContent = state.best;

  el.livesValue.textContent = '❤'.repeat(Math.max(0, state.lives)) || '—';
  el.livesValue.setAttribute('aria-label', `${Math.max(0, state.lives)} vieți`);
  el.livesValue.closest('.stat-card').classList.toggle('danger', state.lives <= 1);
  el.timeValue.closest('.stat-card').classList.toggle('danger', state.timeLeft <= 15);

  const progress = state.starsTarget
    ? Math.round((state.starsCollected / state.starsTarget) * 100)
    : 0;
  el.progressText.textContent = `${progress}%`;
  el.progressBar.style.width = `${progress}%`;
  el.progressTrack.setAttribute('aria-valuenow', String(progress));

  const energy = Math.round(state.energy);
  el.energyValue.textContent = `${energy}%`;
  el.energyBar.style.width = `${energy}%`;
  el.energyTrack.setAttribute('aria-valuenow', String(energy));

  el.coinValue.textContent = state.crystalCount;
  el.keyValue.textContent = state.keyCount;
  el.shieldValue.textContent = state.shieldCount;

  el.missionStarsText.textContent = `${state.starsCollected} din ${state.starsTarget}`;
  el.missionStars.classList.toggle('completed', state.starsCollected >= state.starsTarget && state.starsTarget > 0);

  el.missionKeyText.textContent = state.hasKey ? 'Capturată' : 'Necapturată';
  el.missionKey.classList.toggle('completed', state.hasKey);

  const portalReady = state.hasKey && state.starsCollected >= state.starsTarget;
  el.missionPortalText.textContent = portalReady ? 'Deblocat' : 'Blocat';
  el.missionPortal.classList.toggle('completed', portalReady);

  toolButtons.forEach((btn) => {
    btn.disabled = !state.running || state.paused || state.energy < Number(btn.dataset.cost);
  });
  el.hintTool.disabled = !state.running || state.paused || state.energy < 10;
  el.undoTool.disabled = !state.running || state.paused || !state.history.length;
}

function hideOverlays() {
  el.pauseOverlay.classList.add('hidden');
  el.resultOverlay.classList.add('hidden');
  el.pauseButton.setAttribute('aria-pressed', 'false');
}

/* ---------- Randare ---------- */

function draw() {
  // Dimensiunea vine din grid-ul real, nu din state.size — elimina orice desync.
  if (!state.grid || !state.grid.length) return;
  const size = state.grid.length;
  const cell = el.canvas.width / size;
  const css = getComputedStyle(document.documentElement);
  const color = (name, fallback) => (css.getPropertyValue(name) || fallback).trim();

  ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
  ctx.fillStyle = color('--canvas-bg', '#080c15');
  ctx.fillRect(0, 0, el.canvas.width, el.canvas.height);

  // pereti
  ctx.fillStyle = color('--panel-2', '#121a2c');
  for (let y = 0; y < size; y++) {
    const row = state.grid[y];
    if (!row) continue;
    for (let x = 0; x < size; x++) {
      if (row[x] === TILE.WALL) ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  // urma parcursa (breadcrumb) — se estompeaza spre coada
  if (state.trail && state.trail.length && !reducedMotion) {
    for (let i = 0; i < state.trail.length; i++) {
      const p = state.trail[i];
      const alpha = 0.04 + (i / state.trail.length) * 0.12;
      ctx.fillStyle = `rgba(140, 102, 255, ${alpha.toFixed(3)})`;
      ctx.fillRect(p.x * cell + cell * 0.3, p.y * cell + cell * 0.3, cell * 0.4, cell * 0.4);
    }
  }

  // indiciu
  if (state.hintPath.length) {
    ctx.fillStyle = 'rgba(140, 102, 255, 0.22)';
    for (const p of state.hintPath) ctx.fillRect(p.x * cell, p.y * cell, cell, cell);
  }

  const glyph = (x, y, char, fill, scale = 0.6) => {
    ctx.fillStyle = fill;
    ctx.font = `${Math.floor(cell * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, x * cell + cell / 2, y * cell + cell / 2 + 1);
  };

  const beat = reducedMotion ? 1 : 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 350));

  // portal — pulseaza cand e gata de activat
  const portalReady = state.hasKey && state.starsCollected >= state.starsTarget;
  if (portalReady && !reducedMotion) {
    ctx.globalAlpha = 0.25 * beat;
    ctx.fillStyle = color('--success', '#55e6a5');
    ctx.fillRect(state.portal.x * cell, state.portal.y * cell, cell, cell);
    ctx.globalAlpha = 1;
  }
  glyph(state.portal.x, state.portal.y, '⬡', portalReady ? color('--success', '#55e6a5') : color('--muted', '#8d9ab4'), 0.75);

  // capcane — vizibile cu scanner sau cand sunt adiacente; cele adiacente palpaie ca avertisment
  for (const t of state.traps) {
    const dist = Math.abs(t.x - state.player.x) + Math.abs(t.y - state.player.y);
    const near = dist <= 1;
    if (state.scanTurns > 0 || near) {
      if (near && !reducedMotion) ctx.globalAlpha = beat;
      glyph(t.x, t.y, '×', color('--danger', '#ff6178'), 0.7);
      ctx.globalAlpha = 1;
    }
  }

  for (const s of state.stars) glyph(s.x, s.y, '★', color('--warning', '#ffcc66'));
  for (const c of state.crystals) glyph(c.x, c.y, '◆', color('--accent-2', '#3fd3ff'), 0.5);
  for (const e of state.energyPickups) glyph(e.x, e.y, '✚', color('--success', '#55e6a5'), 0.5);
  if (state.key) glyph(state.key.x, state.key.y, '⚿', color('--accent-2', '#3fd3ff'), 0.65);

  // jucator
  const px = state.player.x * cell + cell / 2;
  const py = state.player.y * cell + cell / 2;
  ctx.beginPath();
  ctx.arc(px, py, cell * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = color('--accent', '#8c66ff');
  ctx.fill();

  if (state.shieldTurns > 0) {
    ctx.beginPath();
    ctx.arc(px, py, cell * 0.44, 0, Math.PI * 2);
    ctx.strokeStyle = color('--accent-2', '#3fd3ff');
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/* ---------- Bucla de timp ---------- */

let lastTick = performance.now();

function tick(now) {
  const delta = (now - lastTick) / 1000;

  if (delta >= 1) {
    lastTick = now;
    if (state.running && !state.paused && !state.finished) {
      state.timeLeft -= 1;
      state.energy = Math.min(100, state.energy + 1);

      if (state.comboTimer > 0) {
        state.comboTimer -= 1;
        if (state.comboTimer === 0) state.combo = 1;
      }

      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        finish(false, 'Timpul a expirat.');
      }
      syncUI();
    }
  }

  // Redesenare continua pentru animatii (portal pulsant, capcana adiacenta).
  // Sarita cand jocul e oprit sau utilizatorul a cerut mai putina miscare.
  if (!reducedMotion && state.running && !state.paused && !state.finished) {
    draw();
  }

  requestAnimationFrame(tick);
}

/* ---------- Pauză / restart ---------- */

function togglePause(force) {
  if (!state.running || state.finished) return;
  state.paused = typeof force === 'boolean' ? force : !state.paused;
  el.pauseOverlay.classList.toggle('hidden', !state.paused);
  el.pauseButton.setAttribute('aria-pressed', String(state.paused));
  setStatus(state.paused ? 'În pauză' : 'Misiune activă', state.paused ? 'paused' : '');
  message(state.paused ? 'Joc întrerupt.' : 'Joc reluat.');
  if (state.paused) setTimeout(() => el.resumeButton.focus(), 50);
  else el.canvas.focus();
  syncUI();
}

/* ---------- Tema si sunet ---------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  el.themeButton.textContent = theme === 'light' ? '☀' : '☾';
  el.themeButton.setAttribute('aria-label', theme === 'light' ? 'Comută pe tema închisă' : 'Comută pe tema deschisă');
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  draw();
}

function applySound(on) {
  state.soundOn = on;
  el.soundButton.textContent = on ? '🔊' : '🔇';
  el.soundButton.setAttribute('aria-pressed', String(on));
  el.soundButton.setAttribute('aria-label', on ? 'Sunet pornit' : 'Sunet oprit');
  try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch (_) {}
}

/* ---------- Evenimente ---------- */

document.addEventListener('keydown', (event) => {
  const tag = event.target.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || el.helpDialog.open) return;

  const key = event.key.toLowerCase();
  const map = {
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right'
  };

  if (map[key]) {
    event.preventDefault();
    move(map[key]);
    return;
  }

  if (key === 'p') { event.preventDefault(); togglePause(); }
  if (key === 'r') { event.preventDefault(); buildLevel(false); }
  if (key === 'u') { event.preventDefault(); undo(); }
  if (key === 'h') { event.preventDefault(); hint(); }

  const toolIndex = ['1', '2', '3', '4'].indexOf(event.key);
  if (toolIndex !== -1) {
    event.preventDefault();
    const btn = toolButtons[toolIndex];
    if (btn && !btn.disabled) useTool(btn.dataset.tool, Number(btn.dataset.cost), btn);
  }
});

// Butoane tactile — pointer events, cu .pressed explicit
document.querySelectorAll('.move-button').forEach((btn) => {
  const dir = btn.dataset.direction;
  const press = (e) => {
    e.preventDefault();
    btn.classList.add('pressed');
    move(dir);
  };
  const release = () => btn.classList.remove('pressed');

  btn.addEventListener('pointerdown', press);
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});

// Swipe pe canvas
let touchStart = null;
el.canvas.addEventListener('pointerdown', (e) => {
  touchStart = { x: e.clientX, y: e.clientY };
  el.canvas.focus();
});
el.canvas.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
  else move(dy > 0 ? 'down' : 'up');
});

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => useTool(btn.dataset.tool, Number(btn.dataset.cost), btn));
});

el.undoTool.addEventListener('click', undo);
el.hintTool.addEventListener('click', hint);
el.pauseButton.addEventListener('click', () => togglePause());
el.resumeButton.addEventListener('click', () => togglePause(false));
el.restartButton.addEventListener('click', () => buildLevel(false));
el.playAgainButton.addEventListener('click', () => buildLevel(false));
el.nextLevelButton.addEventListener('click', nextLevel);
el.modeSelect.addEventListener('change', () => buildLevel(false));
el.difficultySelect.addEventListener('change', () => buildLevel(false));

el.helpButton.addEventListener('click', () => {
  togglePause(true);
  el.helpDialog.showModal();
});
el.closeHelpButton.addEventListener('click', () => el.helpDialog.close());
el.helpDialog.addEventListener('close', () => el.canvas.focus());

el.themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
});

el.soundButton.addEventListener('click', () => applySound(!state.soundOn));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.running && !state.finished) togglePause(true);
});

/* ---------- Init ---------- */

(function init() {
  let savedTheme = 'dark';
  let savedSound = true;
  try {
    state.best = Number(localStorage.getItem(STORAGE_KEY)) || 0;
    savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    savedSound = localStorage.getItem(SOUND_KEY) !== '0';
  } catch (_) {}

  applyTheme(savedTheme);
  applySound(savedSound);
  buildLevel(false);
  requestAnimationFrame(tick);
})();
