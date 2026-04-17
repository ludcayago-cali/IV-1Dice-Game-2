
const SIZE = 10;
const BLOCK_COUNT = 18;
const ATTACK_DELAY_MS = 520;

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
      idle: {
        left: "assets/golem1.gif",
        right: "assets/golem2.gif",
      },
      walk: {
        left: "assets/golemrun1.gif",
        right: "assets/golemrun2.gif",
      },
      hit: {
        left: "assets/golemhit1.gif",
        right: "assets/golemhit2.gif",
      },
      die: {
        left: "assets/golemdie1.gif",
        right: "assets/golemdie2.gif",
      },
      dead: {
        left: "assets/golemdead1.png",
        right: "assets/golemdead2.png",
      }
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
  phase: "select", // select | move | gameOver
  dice: null,
  movesRemaining: 0,
  turnCount: 1,
  winner: null,
  validMoves: [],
  planningPath: [],
  selectedTile: null,
  selectedUnitId: null,
  locked: false,
  lastMessage: "Select a unit.",
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
      row,
      col,
      blocked: false,
      ground: mixedGroundFor(row, col),
      blockType: null,
    }))
  );
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
  };
}

function buildUnits() {
  return [
    makeUnit(1, 1, UNIT_TEMPLATES[0], 0, 0),
    makeUnit(1, 2, UNIT_TEMPLATES[1], 0, 1),
    makeUnit(1, 3, UNIT_TEMPLATES[2], 0, 2),
    makeUnit(2, 1, UNIT_TEMPLATES[0], SIZE - 1, SIZE - 1),
    makeUnit(2, 2, UNIT_TEMPLATES[1], SIZE - 1, SIZE - 2),
    makeUnit(2, 3, UNIT_TEMPLATES[2], SIZE - 1, SIZE - 3),
  ];
}

function allTiles() {
  const out = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) out.push({ row, col });
  }
  return out;
}

function buildBoard() {
  const board = createEmptyBoard();
  const blockedCandidates = shuffle(
    allTiles().filter(({ row, col }) => {
      // keep a protected deployment strip on each side
      if (row <= 1 && col <= 3) return false;
      if (row >= SIZE - 2 && col >= SIZE - 4) return false;
      return true;
    })
  ).slice(0, BLOCK_COUNT);

  for (const tile of blockedCandidates) {
    board[tile.row][tile.col].blocked = true;
    board[tile.row][tile.col].blockType = Math.random() < 0.5 ? "crate" : "bush";
  }
  return board;
}

function getUnitById(id) {
  return state.units.find(u => u.id === id) || null;
}

function getAliveUnits(team = null) {
  return state.units.filter(u => u.alive && (team == null || u.team === team));
}

function getUnitAt(row, col, ignoreUnitId = null) {
  return state.units.find(u => u.alive && u.id !== ignoreUnitId && u.row === row && u.col === col) || null;
}

function isTileBlocked(row, col) {
  return !inBounds(row, col) || state.board[row][col].blocked;
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

function teamAliveCount(team) {
  return getAliveUnits(team).length;
}

function teamTotalHp(team) {
  return getAliveUnits(team).reduce((sum, unit) => sum + unit.hp, 0);
}

function getSelectedUnit() {
  return getUnitById(state.selectedUnitId);
}

function cloneUnitPositions() {
  return state.units.map(u => ({
    id: u.id,
    alive: u.alive,
    row: u.row,
    col: u.col,
  }));
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
  if (!unit || state.phase !== "move" || state.movesRemaining <= 0) {
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

  return {
    up: isSame(row - 1, col),
    down: isSame(row + 1, col),
  };
}

function getCrateStackType(row, col) {
  const n = getSameBlockNeighbors(row, col, "crate");
  if (n.up && n.down) return "crate-middle";
  if (n.down && !n.up) return "crate-top";
  if (n.up && !n.down) return "crate-bottom";
  return "crate-single";
}

function resetUnitAnimations() {
  for (const unit of state.units) {
    unit.anim = "idle";
    unit.targetShake = false;
    if (unit.alive) updateFacingTowardEnemy(unit);
  }
}

function startMatch() {
  state.board = buildBoard();
  state.units = buildUnits();
  state.turnTeam = 1;
  state.phase = "select";
  state.dice = null;
  state.movesRemaining = 0;
  state.turnCount = 1;
  state.winner = null;
  state.validMoves = [];
  state.planningPath = [];
  state.selectedTile = null;
  state.selectedUnitId = null;
  state.locked = false;
  state.lastMessage = "Select a Team 1 unit.";
  resetUnitAnimations();
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

        actor.appendChild(hp);
        actor.appendChild(role);
        cell.appendChild(actor);
      }

      cell.addEventListener("click", () => onTileClick(row, col));
      boardEl.appendChild(cell);
    }
  }
}

function renderUI() {
  const selected = getSelectedUnit();
  turnText.textContent = state.winner
    ? `Team ${state.winner} Wins`
    : `Team ${state.turnTeam} Turn`;

  if (state.phase === "select") {
    phaseText.textContent = selected
      ? `${selected.roleName} selected. Roll to move.`
      : `Select one of Team ${state.turnTeam}'s units.`;
  } else if (state.phase === "move") {
    phaseText.textContent = `${selected ? selected.roleName : "Unit"} route: ${state.planningPath.length}/${state.dice}`;
  } else {
    phaseText.textContent = state.lastMessage;
  }

  roundText.textContent = `Turn ${state.turnCount}`;
  diceText.textContent = state.dice == null ? "Dice: -" : `Dice: ${state.dice} | Planned: ${state.planningPath.length}/${state.dice}`;
  p1ScoreEl.textContent = String(teamAliveCount(1));
  p2ScoreEl.textContent = String(teamAliveCount(2));
  p1PosEl.textContent = `HP ${teamTotalHp(1)}`;
  p2PosEl.textContent = `HP ${teamTotalHp(2)}`;
  p1DiceEl.textContent = state.turnTeam === 1 && selected ? `${selected.roleLabel} ${coordLabel(selected)}` : "Awaiting";
  p2DiceEl.textContent = state.turnTeam === 2 && selected ? `${selected.roleLabel} ${coordLabel(selected)}` : "Awaiting";
  resultValueEl.textContent = state.dice == null ? "-" : String(state.dice);

  rollBtn.disabled = !(state.phase === "select" && !!selected && !state.locked);
  endTurnBtn.disabled = !(state.phase === "move" && !state.locked);
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
  state.planningPath = [];
  state.validMoves = [];
  state.dice = null;
  state.movesRemaining = 0;
  state.phase = "select";
  updateFacingTowardEnemy(unit);
  state.lastMessage = `${unit.roleName} ready. Roll to move.`;
  renderAll();
}

function rollDice() {
  const unit = getSelectedUnit();
  if (!unit || state.phase !== "select" || state.locked) return;
  state.dice = randInt(6) + 1;
  state.movesRemaining = state.dice;
  state.planningPath = [];
  state.phase = "move";
  unit.anim = "idle";
  refreshPlanningMoves();
  renderAll();
}

async function animateStep(unit, row, col) {
  unit.row = row;
  unit.col = col;
  unit.anim = unit.team === 1 ? "walk" : "idle";
  updateFacingTowardEnemy(unit);
  state.selectedTile = { row, col };
  renderAll();
  await delay(180);
}

async function executePlannedPath() {
  const unit = getSelectedUnit();
  if (!unit) return;
  const route = [...state.planningPath];
  state.validMoves = [];
  renderAll();

  for (const step of route) {
    await delay(90);
    await animateStep(unit, step.row, step.col);
  }

  state.planningPath = [];
  state.movesRemaining = 0;
  unit.anim = "idle";
  renderAll();
  await resolveAttackAndTurnEnd(unit);
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

async function resolveAttackAndTurnEnd(unit) {
  const target = getAttackTarget(unit);

  if (target) {
    state.locked = true;
    updateFacingTowardEnemy(unit);

    if (unit.team === 1) {
      unit.anim = "hit";
    }
    target.targetShake = true;
    renderAll();
    await delay(ATTACK_DELAY_MS);

    target.hp = Math.max(0, target.hp - unit.damage);
    target.targetShake = false;

    if (target.hp <= 0) {
      target.anim = target.team === 1 ? "die" : "idle";
      renderAll();
      await delay(320);
      target.hp = 0;
      removeDeadUnits();
    }

    unit.anim = "idle";
    renderAll();
    await delay(180);
  }

  const winner = checkGameOver();
  if (winner) {
    finishGame(winner);
    return;
  }

  endTurn();
}

function finishGame(winner) {
  state.winner = winner;
  state.phase = "gameOver";
  state.locked = true;
  state.validMoves = [];
  state.planningPath = [];
  state.dice = null;
  state.movesRemaining = 0;
  state.lastMessage = `Team ${winner} eliminated all enemy units.`;
  renderAll();

  resultPopupText.textContent = `TEAM ${winner} WINS`;
  resultPopupSubtext.textContent = "All enemy units were defeated.";
  resultNextBtn.textContent = "New Match";
  resultPopup.classList.remove("hidden");
}

function endTurn() {
  state.turnTeam = otherTeam(state.turnTeam);
  state.phase = "select";
  state.dice = null;
  state.movesRemaining = 0;
  state.validMoves = [];
  state.planningPath = [];
  state.selectedTile = null;
  state.selectedUnitId = null;
  state.locked = false;
  state.turnCount += 1;
  resetUnitAnimations();
  state.lastMessage = `Select a Team ${state.turnTeam} unit.`;
  renderAll();
}

async function onTileClick(row, col) {
  if (state.locked || state.winner) return;

  const unitAtTile = getUnitAt(row, col);

  if (state.phase === "select") {
    if (unitAtTile && unitAtTile.team === state.turnTeam) {
      selectUnit(unitAtTile);
    }
    return;
  }

  if (state.phase === "move") {
    if (!state.validMoves.some(m => m.row === row && m.col === col)) {
      // allow changing selected unit only before a route is started
      if (!state.planningPath.length && unitAtTile && unitAtTile.team === state.turnTeam) {
        selectUnit(unitAtTile);
      }
      return;
    }

    state.planningPath.push({ row, col });
    state.selectedTile = { row, col };
    state.movesRemaining = Math.max(0, state.movesRemaining - 1);

    if (state.movesRemaining <= 0) {
      renderAll();
      await executePlannedPath();
      return;
    }

    refreshPlanningMoves();
    renderAll();
  }
}

rollBtn.addEventListener("click", () => {
  rollDice();
});

endTurnBtn.addEventListener("click", async () => {
  if (state.phase !== "move" || state.locked) return;
  if (state.planningPath.length) await executePlannedPath();
  else {
    const unit = getSelectedUnit();
    if (!unit) return;
    await resolveAttackAndTurnEnd(unit);
  }
});

newRoundBtn.addEventListener("click", () => {});
resetMatchBtn.addEventListener("click", () => {
  startMatch();
});

resultNextBtn.addEventListener("click", () => {
  startMatch();
});

document.addEventListener("keydown", (e) => {
  if (!(state.phase === "move") || state.locked) return;
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
