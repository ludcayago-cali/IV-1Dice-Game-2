
const SIZE = 10;
const BLOCK_COUNT = 18;
const ATTACK_DELAY_MS = 520;
const TURN_STEPS_MIN = 1;
const TURN_STEPS_MAX = 6;
const BOT_TEAM = 2;

const boardEl = document.getElementById("board");
const rollBtn = document.getElementById("rollBtn");
const endTurnBtn = document.getElementById("endTurnBtn");
const newRoundBtn = document.getElementById("newRoundBtn");
const resetMatchBtn = document.getElementById("resetMatchBtn");
const turnText = document.getElementById("turnText");
const phaseText = document.getElementById("phaseText");
const diceText = document.getElementById("diceText");
const roundText = document.getElementById("roundText");
const p1ScoreEl = document.getElementById("p1Score");
const p2ScoreEl = document.getElementById("p2Score");
const p1PosEl = document.getElementById("p1Pos");
const p2PosEl = document.getElementById("p2Pos");
const p1DiceEl = document.getElementById("p1Dice");
const p2DiceEl = document.getElementById("p2Dice");
const resultValueEl = document.getElementById("resultValue");
const resultPopup = document.getElementById("resultPopup");
const resultPopupText = document.getElementById("resultPopupText");
const resultPopupSubtext = document.getElementById("resultPopupSubtext");
const resultNextBtn = document.getElementById("resultNextBtn");

const TILESET = {
  actor: {
    p1: {
      idle: { left: "assets/golem1.gif", right: "assets/golem2.gif" },
      walk: { left: "assets/golemrun1.gif", right: "assets/golemrun2.gif" },
      hit: { left: "assets/golemhit1.gif", right: "assets/golemhit2.gif" },
      die: { left: "assets/golemdie1.gif", right: "assets/golemdie2.gif" },
      dead: { left: "assets/golemdead1.png", right: "assets/golemdead2.png" }
    },
    p2: "assets/red-removebg-preview.png",
  },
  ground: {
    floor1: "assets/tile-floor1.png",
    floor2: "assets/tile-floor2.png",
    grass1: "assets/tile-grass1.png",
    grass2: "assets/tile-grass2.png",
  },
  block: {
    crate: "assets/d-tile1.png",
    bush: "assets/d-tile2.png",
  }
};

const UNIT_TEMPLATES = [
  { key: "guardian", label: "G", name: "Guardian", maxHp: 16, damage: 3 },
  { key: "fighter", label: "F", name: "Fighter", maxHp: 12, damage: 4 },
  { key: "rogue", label: "R", name: "Rogue", maxHp: 10, damage: 5 },
];

const state = {
  board: [],
  units: [],
  turnTeam: 1,
  phase: "preRoll", // preRoll | activeTurn | gameOver
  turnCount: 1,
  winner: null,
  selectedUnitId: null,
  selectedTile: null,
  planningPath: [],
  validMoves: [],
  locked: false,
  turnSteps: null,
  teamRollUsed: { 1: false, 2: false },
  teamStepBudget: { 1: 0, 2: 0 },
  teamStepSpent: { 1: 0, 2: 0 },
  lastMessage: "Roll once, then each of your 3 units may use that many steps."
};

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function randInt(max) { return Math.floor(Math.random() * max); }
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function inBounds(row, col) { return row >= 0 && row < SIZE && col >= 0 && col < SIZE; }
function keyOf(row, col) { return `${row},${col}`; }
function manhattan(a, b) { return Math.abs(a.row - b.row) + Math.abs(a.col - b.col); }
function coordLabel(pos) { return `(${pos.row + 1},${pos.col + 1})`; }
function otherTeam(team) { return team === 1 ? 2 : 1; }

function mixedGroundFor(row, col) {
  const v = (row * 7 + col * 11) % 4;
  if (v === 0) return "floor1";
  if (v === 1) return "grass1";
  if (v === 2) return "floor2";
  return "grass2";
}

function createEmptyBoard() {
  return Array.from({ length: SIZE }, (_, row) =>
    Array.from({ length: SIZE }, (_, col) => ({
      row, col, blocked: false, ground: mixedGroundFor(row, col), blockType: null,
    }))
  );
}

function allTiles() {
  const out = [];
  for (let row = 0; row < SIZE; row++) for (let col = 0; col < SIZE; col++) out.push({ row, col });
  return out;
}

function makeUnit(team, slot, template, row, col) {
  return {
    id: `t${team}_${template.key}_${slot}`,
    team,
    slot,
    role: template.key,
    roleLabel: template.label,
    roleName: template.name,
    row,
    col,
    hp: template.maxHp,
    maxHp: template.maxHp,
    damage: template.damage,
    alive: true,
    facing: team === 1 ? "right" : "left",
    anim: "idle",
    targetShake: false,
    usedSteps: 0,
    movedThisTurn: false,
    attackedThisTurn: false,
  };
}

function getProtectedSpawnTilesForTeam(team) {
  const candidates = [];
  if (team === 1) {
    for (let row = 0; row <= 2; row++) {
      for (let col = 0; col <= 3; col++) candidates.push({ row, col });
    }
  } else {
    for (let row = SIZE - 3; row < SIZE; row++) {
      for (let col = SIZE - 4; col < SIZE; col++) candidates.push({ row, col });
    }
  }
  return shuffle(candidates);
}

function buildRandomSpawns() {
  const p1Tiles = getProtectedSpawnTilesForTeam(1);
  const p2Tiles = getProtectedSpawnTilesForTeam(2);
  return {
    p1: p1Tiles.slice(0, 3),
    p2: p2Tiles.slice(0, 3),
  };
}

function buildUnits() {
  const spawns = buildRandomSpawns();
  return [
    makeUnit(1, 1, UNIT_TEMPLATES[0], spawns.p1[0].row, spawns.p1[0].col),
    makeUnit(1, 2, UNIT_TEMPLATES[1], spawns.p1[1].row, spawns.p1[1].col),
    makeUnit(1, 3, UNIT_TEMPLATES[2], spawns.p1[2].row, spawns.p1[2].col),
    makeUnit(2, 1, UNIT_TEMPLATES[0], spawns.p2[0].row, spawns.p2[0].col),
    makeUnit(2, 2, UNIT_TEMPLATES[1], spawns.p2[1].row, spawns.p2[1].col),
    makeUnit(2, 3, UNIT_TEMPLATES[2], spawns.p2[2].row, spawns.p2[2].col),
  ];
}

function buildBoard(units) {
  const board = createEmptyBoard();
  const occupied = new Set(units.map(u => keyOf(u.row, u.col)));
  const blockedCandidates = shuffle(
    allTiles().filter(({ row, col }) => {
      if (occupied.has(keyOf(row, col))) return false;
      if (row <= 2 && col <= 3) return false;
      if (row >= SIZE - 3 && col >= SIZE - 4) return false;
      return true;
    })
  ).slice(0, BLOCK_COUNT);

  for (const tile of blockedCandidates) {
    board[tile.row][tile.col].blocked = true;
    board[tile.row][tile.col].blockType = Math.random() < 0.5 ? "crate" : "bush";
  }
  return board;
}

function getUnitById(id) { return state.units.find(u => u.id === id) || null; }
function getAliveUnits(team = null) { return state.units.filter(u => u.alive && (team == null || u.team === team)); }
function teamAliveCount(team) { return getAliveUnits(team).length; }
function teamTotalHp(team) { return getAliveUnits(team).reduce((sum, unit) => sum + unit.hp, 0); }
function getSelectedUnit() { return getUnitById(state.selectedUnitId); }
function isBotTurn() { return state.turnTeam === BOT_TEAM; }

function getUnitAt(row, col, ignoreUnitId = null) {
  return state.units.find(u => u.alive && u.id !== ignoreUnitId && u.row === row && u.col === col) || null;
}

function updateFacingTowardEnemy(unit) {
  const enemies = getAliveUnits(otherTeam(unit.team));
  if (!enemies.length) return;
  const nearest = [...enemies].sort((a, b) => manhattan(unit, a) - manhattan(unit, b))[0];
  if (nearest.col > unit.col) unit.facing = "right";
  else if (nearest.col < unit.col) unit.facing = "left";
}

function spriteForUnit(unit) {
  if (unit.team === 1) {
    const anim = TILESET.actor.p1[unit.anim] ? unit.anim : "idle";
    const facing = unit.facing === "left" ? "left" : "right";
    return TILESET.actor.p1[anim][facing];
  }
  return TILESET.actor.p2;
}

function cloneUnitPositions() {
  return state.units.map(u => ({ id: u.id, alive: u.alive, row: u.row, col: u.col, team: u.team }));
}

function getRemainingStepsForUnit(unit) {
  if (state.turnSteps == null) return 0;
  return Math.max(0, state.turnSteps - unit.usedSteps);
}

function getAdjacentMovesForUnit(unit, tempPositions = null) {
  const positions = tempPositions || cloneUnitPositions();
  const self = positions.find(p => p.id === unit.id);
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const moves = [];
  for (const [dr, dc] of dirs) {
    const nr = self.row + dr;
    const nc = self.col + dc;
    if (!inBounds(nr, nc)) continue;
    if (state.board[nr][nc].blocked) continue;
    const occupied = positions.find(p => p.alive && p.id !== unit.id && p.row === nr && p.col === nc);
    if (occupied) continue;
    moves.push({ row: nr, col: nc });
  }
  return moves;
}

function getPlanningOrigin() {
  const unit = getSelectedUnit();
  if (!unit) return null;
  return state.planningPath.length ? state.planningPath[state.planningPath.length - 1] : { row: unit.row, col: unit.col };
}

function refreshPlanningMoves() {
  const unit = getSelectedUnit();
  if (!unit || state.phase !== "activeTurn" || state.locked || state.turnSteps == null) {
    state.validMoves = [];
    return;
  }
  const remaining = getRemainingStepsForUnit(unit) - state.planningPath.length;
  if (remaining <= 0) {
    state.validMoves = [];
    return;
  }
  const positions = cloneUnitPositions();
  const self = positions.find(p => p.id === unit.id);
  const origin = getPlanningOrigin();
  self.row = origin.row;
  self.col = origin.col;
  state.validMoves = getAdjacentMovesForUnit(unit, positions);
}

function getAdjacentEnemies(unit) {
  return getAliveUnits(otherTeam(unit.team)).filter(enemy => manhattan(unit, enemy) === 1);
}

function getAttackTarget(unit) {
  const adjacent = getAdjacentEnemies(unit);
  if (!adjacent.length) return null;
  return [...adjacent].sort((a, b) => a.hp - b.hp || a.slot - b.slot)[0];
}

function getSameBlockNeighbors(row, col, type) {
  const isSame = (r, c) =>
    inBounds(r, c) &&
    state.board[r][c].blocked &&
    state.board[r][c].blockType === type;

  return { up: isSame(row - 1, col), down: isSame(row + 1, col) };
}

function getCrateStackType(row, col) {
  const n = getSameBlockNeighbors(row, col, "crate");
  if (n.up && n.down) return "crate-middle";
  if (n.down && !n.up) return "crate-top";
  if (n.up && !n.down) return "crate-bottom";
  return "crate-single";
}

function resetUnitTurnFlags(team) {
  for (const unit of getAliveUnits(team)) {
    unit.usedSteps = 0;
    unit.movedThisTurn = false;
    unit.attackedThisTurn = false;
    unit.anim = "idle";
    unit.targetShake = false;
    updateFacingTowardEnemy(unit);
  }
}

function startMatch() {
  const units = buildUnits();
  state.units = units;
  state.board = buildBoard(units);
  state.turnTeam = 1;
  state.phase = "preRoll";
  state.turnCount = 1;
  state.winner = null;
  state.selectedUnitId = null;
  state.selectedTile = null;
  state.planningPath = [];
  state.validMoves = [];
  state.locked = false;
  state.turnSteps = null;
  state.teamRollUsed = { 1: false, 2: false };
  state.teamStepBudget = { 1: 0, 2: 0 };
  state.teamStepSpent = { 1: 0, 2: 0 };
  state.lastMessage = "Roll once, then each of your 3 units may use that many steps.";
  resetUnitTurnFlags(1);
  resetUnitTurnFlags(2);
  resultPopup.classList.add("hidden");
  renderAll();
}

function renderTileEngine() {
  boardEl.innerHTML = "";

  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const cellData = state.board[row][col];
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.type = "button";

      const ground = document.createElement("div");
      ground.className = "layer ground";
      ground.style.backgroundImage = `url('${TILESET.ground[cellData.ground]}')`;
      cell.appendChild(ground);

      if (state.validMoves.some(m => m.row === row && m.col === col)) {
        const fx = document.createElement("div");
        fx.className = "layer fx valid";
        cell.appendChild(fx);
      }
      if (state.planningPath.some(m => m.row === row && m.col === col)) {
        const fx = document.createElement("div");
        fx.className = "layer fx path";
        cell.appendChild(fx);
      }
      if (state.selectedTile && state.selectedTile.row === row && state.selectedTile.col === col) {
        const fx = document.createElement("div");
        fx.className = "layer fx selected";
        cell.appendChild(fx);
      }

      if (cellData.blocked) {
        const block = document.createElement("div");
        let extra = "";
        if (cellData.blockType === "crate") extra = getCrateStackType(row, col);
        block.className = `layer block ${cellData.blockType} ${extra}`.trim();
        block.style.backgroundImage = `url('${TILESET.block[cellData.blockType]}')`;
        cell.appendChild(block);
      }

      const unit = getUnitAt(row, col);
      if (unit) {
        const actor = document.createElement("div");
        actor.className = `layer actor unit team-${unit.team} ${unit.targetShake ? "target-hit" : ""} ${state.selectedUnitId === unit.id ? "unit-selected" : ""}`.trim();
        actor.style.backgroundImage = `url('${spriteForUnit(unit)}')`;

        const hp = document.createElement("div");
        hp.className = `unit-hp team-${unit.team}`;
        hp.textContent = `${unit.hp}`;

        const role = document.createElement("div");
        role.className = `unit-role team-${unit.team}`;
        role.textContent = unit.roleLabel;

        const step = document.createElement("div");
        step.className = `unit-step team-${unit.team}`;
        step.textContent = state.turnSteps == null ? "-" : `${unit.usedSteps}/${state.turnSteps}`;

        actor.appendChild(hp);
        actor.appendChild(role);
        actor.appendChild(step);
        cell.appendChild(actor);
      }

      cell.addEventListener("click", () => onTileClick(row, col));
      boardEl.appendChild(cell);
    }
  }
}

function renderUI() {
  const selected = getSelectedUnit();
  turnText.textContent = state.winner ? `${state.winner === 1 ? "Player" : "Bot"} Wins` : `${state.turnTeam === 1 ? "Player" : "Bot"} Turn`;

  if (state.phase === "preRoll") {
    phaseText.textContent = state.turnTeam === 1
      ? "Roll once. That value applies to all 3 of your units."
      : "Bot is preparing its turn.";
  } else if (state.phase === "activeTurn") {
    if (!selected) {
      phaseText.textContent = state.turnTeam === 1
        ? "Select one of your units. End Turn is always available."
        : "Bot is thinking...";
    } else {
      const remaining = Math.max(0, getRemainingStepsForUnit(selected) - state.planningPath.length);
      phaseText.textContent = `${selected.roleName}: used ${selected.usedSteps}/${state.turnSteps} step(s). ${remaining} left for this unit.`;
    }
  } else {
    phaseText.textContent = state.lastMessage;
  }

  roundText.textContent = `Turn ${state.turnCount}`;
  diceText.textContent = state.turnSteps == null
    ? "Dice: -"
    : `Dice: ${state.turnSteps} | Team spent: ${state.teamStepSpent[state.turnTeam]}`;
  p1ScoreEl.textContent = String(teamAliveCount(1));
  p2ScoreEl.textContent = String(teamAliveCount(2));
  p1PosEl.textContent = `HP ${teamTotalHp(1)}`;
  p2PosEl.textContent = `HP ${teamTotalHp(2)}`;
  p1DiceEl.textContent = state.turnTeam === 1 ? `Steps ${state.turnSteps ?? "-"}` : "Awaiting";
  p2DiceEl.textContent = state.turnTeam === 2 ? `Steps ${state.turnSteps ?? "-"}` : "Awaiting";
  resultValueEl.textContent = state.turnSteps == null ? "-" : String(state.turnSteps);

  rollBtn.disabled = !(state.phase === "preRoll" && !state.locked && state.turnTeam === 1);
  endTurnBtn.disabled = !!state.locked || state.phase === "gameOver" || isBotTurn();
  newRoundBtn.disabled = true;
}

function renderAll() {
  renderTileEngine();
  renderUI();
}

function selectUnit(unit) {
  if (!unit || !unit.alive || unit.team !== state.turnTeam || state.locked) return;
  state.selectedUnitId = unit.id;
  state.selectedTile = { row: unit.row, col: unit.col };

  if (state.phase === "preRoll") {
    renderAll();
    return;
  }

  state.planningPath = [];
  updateFacingTowardEnemy(unit);
  state.lastMessage = `${unit.roleName} ready.`;
  refreshPlanningMoves();
  renderAll();
}

function rollDice() {
  if (state.phase !== "preRoll" || state.locked) return;
  state.turnSteps = randInt(TURN_STEPS_MAX) + TURN_STEPS_MIN;
  state.teamRollUsed[state.turnTeam] = true;
  state.teamStepBudget[state.turnTeam] = state.turnSteps * teamAliveCount(state.turnTeam);
  state.teamStepSpent[state.turnTeam] = 0;
  resetUnitTurnFlags(state.turnTeam);
  state.phase = "activeTurn";
  state.planningPath = [];
  state.validMoves = [];
  state.lastMessage = `${state.turnTeam === 1 ? "Player" : "Bot"} rolled ${state.turnSteps}.`;
  renderAll();
}

async function animateStep(unit, row, col) {
  unit.row = row;
  unit.col = col;
  unit.anim = unit.team === 1 ? "walk" : "idle";
  updateFacingTowardEnemy(unit);
  state.selectedTile = { row, col };
  renderAll();
  await delay(170);
}

async function executePlannedPath() {
  const unit = getSelectedUnit();
  if (!unit) return;
  const route = [...state.planningPath];
  state.validMoves = [];
  renderAll();

  for (const step of route) {
    await delay(75);
    await animateStep(unit, step.row, step.col);
  }

  unit.usedSteps += route.length;
  if (route.length > 0) unit.movedThisTurn = true;
  state.teamStepSpent[state.turnTeam] += route.length;

  state.planningPath = [];
  unit.anim = "idle";
  renderAll();
  await resolveAttack(unit);
}

function removeDeadUnits() {
  for (const unit of state.units) {
    if (unit.alive && unit.hp <= 0) {
      unit.alive = false;
      if (state.selectedUnitId === unit.id) state.selectedUnitId = null;
    }
  }
}

function checkGameOver() {
  const team1Alive = teamAliveCount(1);
  const team2Alive = teamAliveCount(2);
  if (!team1Alive) return 2;
  if (!team2Alive) return 1;
  return null;
}

async function resolveAttack(unit) {
  const target = getAttackTarget(unit);
  if (!target) {
    refreshPlanningMoves();
    renderAll();
    return;
  }

  state.locked = true;
  updateFacingTowardEnemy(unit);

  if (unit.team === 1) unit.anim = "hit";
  target.targetShake = true;
  renderAll();
  await delay(ATTACK_DELAY_MS);

  target.hp = Math.max(0, target.hp - unit.damage);
  target.targetShake = false;
  unit.attackedThisTurn = true;

  if (target.hp <= 0) {
    target.anim = target.team === 1 ? "die" : "idle";
    renderAll();
    await delay(300);
    target.hp = 0;
    removeDeadUnits();
  }

  unit.anim = "idle";
  renderAll();
  await delay(160);

  const winner = checkGameOver();
  if (winner) {
    finishGame(winner);
    return;
  }

  state.locked = false;
  refreshPlanningMoves();
  renderAll();
}

function finishGame(winner) {
  state.winner = winner;
  state.phase = "gameOver";
  state.locked = true;
  state.validMoves = [];
  state.planningPath = [];
  state.lastMessage = `${winner === 1 ? "Player" : "Bot"} eliminated all enemy units.`;
  renderAll();

  resultPopupText.textContent = `${winner === 1 ? "PLAYER" : "BOT"} WINS`;
  resultPopupSubtext.textContent = "All enemy units were defeated.";
  resultNextBtn.textContent = "New Match";
  resultPopup.classList.remove("hidden");
}

function endTurn() {
  if (state.phase === "gameOver" || state.locked) return;
  state.turnTeam = otherTeam(state.turnTeam);
  state.phase = "preRoll";
  state.turnCount += 1;
  state.selectedUnitId = null;
  state.selectedTile = null;
  state.planningPath = [];
  state.validMoves = [];
  state.turnSteps = null;
  state.locked = false;
  state.lastMessage = `${state.turnTeam === 1 ? "Player" : "Bot"}: roll once, then move units.`;
  resetUnitTurnFlags(state.turnTeam);
  renderAll();

  if (isBotTurn()) {
    runBotTurn();
  }
}

function reconstructFirstStep(parent, endKey) {
  let cur = endKey;
  let prev = parent[cur];
  while (prev && prev !== "START") {
    cur = prev;
    prev = parent[cur];
  }
  const [r, c] = cur.split(",").map(Number);
  return { row: r, col: c };
}

function findPathToAnyTarget(startUnit, targetCells, maxSteps) {
  const startKey = keyOf(startUnit.row, startUnit.col);
  const queue = [{ row: startUnit.row, col: startUnit.col, d: 0 }];
  const seen = new Set([startKey]);
  const parent = { [startKey]: "START" };

  while (queue.length) {
    const cur = queue.shift();
    const curKey = keyOf(cur.row, cur.col);

    if (!(cur.row === startUnit.row && cur.col === startUnit.col) &&
        targetCells.some(t => t.row === cur.row && t.col === cur.col)) {
      const firstStep = reconstructFirstStep(parent, curKey);
      return { distance: cur.d, firstStep, destination: { row: cur.row, col: cur.col } };
    }

    if (cur.d >= maxSteps) continue;

    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      const nk = keyOf(nr, nc);
      if (!inBounds(nr, nc)) continue;
      if (seen.has(nk)) continue;
      if (state.board[nr][nc].blocked) continue;

      const occupied = getAliveUnits().find(u => u.id !== startUnit.id && u.row === nr && u.col === nc);
      if (occupied) continue;

      seen.add(nk);
      parent[nk] = curKey;
      queue.push({ row: nr, col: nc, d: cur.d + 1 });
    }
  }

  return null;
}

function getEnemyAdjacentTargetCells(enemyTeam) {
  const targets = [];
  for (const enemy of getAliveUnits(enemyTeam)) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of dirs) {
      const row = enemy.row + dr;
      const col = enemy.col + dc;
      if (!inBounds(row, col)) continue;
      if (state.board[row][col].blocked) continue;
      const occupied = getAliveUnits().find(u => u.row === row && u.col === col);
      if (occupied) continue;
      targets.push({ row, col, enemyId: enemy.id });
    }
  }
  return targets;
}

function scoreBotUnit(unit) {
  let score = 0;
  const attackTarget = getAttackTarget(unit);
  if (attackTarget) {
    score += 5000;
    score += (attackTarget.hp <= unit.damage ? 2000 : 0);
    score += (12 - attackTarget.hp) * 40;
  }

  const remaining = getRemainingStepsForUnit(unit);
  score += remaining * 10;

  const enemies = getAliveUnits(1);
  if (enemies.length) {
    const nearest = enemies.reduce((best, enemy) => {
      const d = manhattan(unit, enemy);
      return !best || d < best.d ? { enemy, d } : best;
    }, null);
    score += (20 - Math.min(nearest.d, 20)) * 15;
  }

  if (!unit.movedThisTurn) score += 40;
  if (!unit.attackedThisTurn) score += 20;

  return score;
}

function chooseBestBotAction() {
  const botUnits = getAliveUnits(BOT_TEAM).filter(u => getRemainingStepsForUnit(u) > 0 || getAttackTarget(u));
  if (!botUnits.length) return null;

  let best = null;
  const targetCells = getEnemyAdjacentTargetCells(1);

  for (const unit of botUnits) {
    const immediateTarget = getAttackTarget(unit);
    if (immediateTarget) {
      const score = 10000 + (immediateTarget.hp <= unit.damage ? 3000 : 0) + (12 - immediateTarget.hp) * 50 + scoreBotUnit(unit);
      if (!best || score > best.score) best = { type: "attack", unitId: unit.id, score };
      continue;
    }

    const steps = getRemainingStepsForUnit(unit);
    if (steps <= 0) continue;

    const path = findPathToAnyTarget(unit, targetCells, steps);
    if (path) {
      const enemy = getUnitById(targetCells.find(t => t.row === path.destination.row && t.col === path.destination.col)?.enemyId || "");
      let score = 4000 - path.distance * 100 + scoreBotUnit(unit);
      if (enemy) score += (12 - enemy.hp) * 20;
      if (!best || score > best.score) best = { type: "moveTowardAttack", unitId: unit.id, firstStep: path.firstStep, score };
      continue;
    }

    // fallback: take any step that reduces nearest-enemy distance
    const options = getAdjacentMovesForUnit(unit);
    if (options.length) {
      const bestMove = options
        .map(opt => {
          const enemies = getAliveUnits(1);
          const before = Math.min(...enemies.map(e => manhattan(unit, e)));
          const after = Math.min(...enemies.map(e => Math.abs(opt.row - e.row) + Math.abs(opt.col - e.col)));
          let score = 1000 + (before - after) * 120 + scoreBotUnit(unit);
          const center = Math.floor(SIZE / 2);
          score += (SIZE - Math.abs(opt.row - center)) * 2;
          score += (SIZE - Math.abs(opt.col - center)) * 2;
          score += randInt(8);
          return { opt, score };
        })
        .sort((a, b) => b.score - a.score)[0];
      if (!best || bestMove.score > best.score) {
        best = { type: "moveCloser", unitId: unit.id, firstStep: bestMove.opt, score: bestMove.score };
      }
    }
  }

  return best;
}

async function botSelectAndMove(unit, step) {
  selectUnit(unit);
  await delay(150);
  state.planningPath = [step];
  state.selectedTile = { row: step.row, col: step.col };
  renderAll();
  await delay(140);
  await executePlannedPath();
}

async function runBotTurn() {
  if (!isBotTurn() || state.winner) return;

  state.lastMessage = "Bot is thinking...";
  state.locked = true;
  renderAll();
  await delay(450);

  state.locked = false;
  rollDice();
  state.locked = true;
  state.lastMessage = `Bot rolled ${state.turnSteps}.`;
  renderAll();
  await delay(400);

  let safety = 20;
  while (state.turnTeam === BOT_TEAM && state.phase === "activeTurn" && !state.winner && safety-- > 0) {
    const action = chooseBestBotAction();
    if (!action) break;

    const unit = getUnitById(action.unitId);
    if (!unit || !unit.alive) break;

    if (action.type === "attack") {
      selectUnit(unit);
      await delay(120);
      await resolveAttack(unit);
      await delay(180);
      state.locked = true;
      continue;
    }

    if (action.type === "moveTowardAttack" || action.type === "moveCloser") {
      await botSelectAndMove(unit, action.firstStep);
      await delay(180);
      state.locked = true;
      continue;
    }

    break;
  }

  state.locked = false;
  if (state.turnTeam === BOT_TEAM && !state.winner) {
    endTurn();
  }
}

async function onTileClick(row, col) {
  if (state.locked || state.winner || isBotTurn()) return;
  const unitAtTile = getUnitAt(row, col);

  if (state.phase === "preRoll") {
    if (unitAtTile && unitAtTile.team === state.turnTeam) selectUnit(unitAtTile);
    return;
  }

  if (state.phase !== "activeTurn") return;

  if (unitAtTile && unitAtTile.team === state.turnTeam && !state.planningPath.length) {
    selectUnit(unitAtTile);
    return;
  }

  const selected = getSelectedUnit();
  if (!selected) return;
  if (!state.validMoves.some(m => m.row === row && m.col === col)) return;

  state.planningPath.push({ row, col });
  state.selectedTile = { row, col };

  const remainingAfterThis = Math.max(0, getRemainingStepsForUnit(selected) - state.planningPath.length);
  if (remainingAfterThis <= 0) {
    renderAll();
    await executePlannedPath();
    return;
  }

  refreshPlanningMoves();
  renderAll();
}

rollBtn.addEventListener("click", () => {
  if (isBotTurn()) return;
  rollDice();
});

endTurnBtn.addEventListener("click", async () => {
  if (state.phase === "gameOver" || state.locked || isBotTurn()) return;

  if (state.phase === "activeTurn" && state.planningPath.length) {
    await executePlannedPath();
    return;
  }

  endTurn();
});

newRoundBtn.addEventListener("click", () => {});
resetMatchBtn.addEventListener("click", startMatch);
resultNextBtn.addEventListener("click", startMatch);

document.addEventListener("keydown", (e) => {
  if (state.phase !== "activeTurn" || state.locked || isBotTurn()) return;
  const keyMap = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
    W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
  };
  if (!(e.key in keyMap)) return;
  e.preventDefault();
  const origin = getPlanningOrigin();
  if (!origin) return;
  const [dr, dc] = keyMap[e.key];
  onTileClick(origin.row + dr, origin.col + dc);
});

startMatch();
