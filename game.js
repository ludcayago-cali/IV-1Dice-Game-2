
const SIZE = 10;
const ROOM_CODE_LENGTH = 5;
const BLOCK_COUNT = 16;
const MAX_HP = 10;
const ATTACK_DAMAGE = 2;
const HEAL_AMOUNT = 2;

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
    player: {
      idle: { left: "assets/golem1.gif", right: "assets/golem2.gif" },
      walk: { left: "assets/golemrun1.gif", right: "assets/golemrun2.gif" },
      hit: { left: "assets/golemhit1.gif", right: "assets/golemhit2.gif" },
      die: { left: "assets/golemdie1.gif", right: "assets/golemdie2.gif" },
      dead: { left: "assets/golemdead1.png", right: "assets/golemdead2.png" }
    },
    bot: "assets/red-removebg-preview.png"
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

const state = {
  board: [],
  player: null,
  bot: null,
  currentTurn: "player", // player | bot
  phase: "roll", // roll | move | actionChoice | gameOver
  dice: null,
  movesRemaining: 0,
  planningPath: [],
  validMoves: [],
  selectedTile: null,
  locked: false,
  winner: null,
  turnCount: 1,
  actionPending: false,
  mode: null,
  roomCode: null,
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
function coordLabel(unit) { return `(${unit.row + 1},${unit.col + 1})`; }
function manhattan(a, b) { return Math.abs(a.row - b.row) + Math.abs(a.col - b.col); }

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

function allTiles() {
  const out = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) out.push({ row, col });
  }
  return out;
}

function isSpawnSafeTile(row, col, playerSpawn, botSpawn) {
  const nearPlayer = Math.abs(row - playerSpawn.row) <= 1 && Math.abs(col - playerSpawn.col) <= 2;
  const nearBot = Math.abs(row - botSpawn.row) <= 1 && Math.abs(col - botSpawn.col) <= 2;
  return nearPlayer || nearBot;
}

function setBlock(board, row, col, type, playerSpawn, botSpawn) {
  if (!inBounds(row, col)) return false;
  if (board[row][col].blocked) return false;
  if (isSpawnSafeTile(row, col, playerSpawn, botSpawn)) return false;
  board[row][col].blocked = true;
  board[row][col].blockType = type;
  return true;
}

function boardPathExists(board, start, end) {
  const q = [{ row: start.row, col: start.col }];
  const seen = new Set([keyOf(start.row, start.col)]);
  while (q.length) {
    const cur = q.shift();
    if (cur.row === end.row && cur.col === end.col) return true;
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      const k = keyOf(nr, nc);
      if (!inBounds(nr, nc)) continue;
      if (seen.has(k)) continue;
      if (board[nr][nc].blocked) continue;
      seen.add(k);
      q.push({ row: nr, col: nc });
    }
  }
  return false;
}

function buildBoard(playerSpawn, botSpawn) {
  const board = createEmptyBoard();

  // Intentional mirrored layout:
  // - center lanes stay mostly open
  // - spawn zones stay clean
  // - obstacle silhouettes are balanced on both halves
  const placements = [
    { row: 1, col: 2, type: "bush" },
    { row: 2, col: 2, type: "bush" },
    { row: 3, col: 0, type: "bush" },

    { row: 5, col: 0, type: "crate" },
    { row: 6, col: 0, type: "crate" },
    { row: 6, col: 2, type: "crate" },
    { row: 5, col: 2, type: "crate" },
    { row: 6, col: 3, type: "crate" },

    { row: 4, col: 3, type: "bush" },
    { row: 5, col: 3, type: "bush" },
    { row: 6, col: 4, type: "bush" }
  ];

  // Mirror every placement for a balanced tactical board.
  for (const p of placements) {
    setBlock(board, p.row, p.col, p.type, playerSpawn, botSpawn);
    const mr = SIZE - 1 - p.row;
    const mc = SIZE - 1 - p.col;
    setBlock(board, mr, mc, p.type, playerSpawn, botSpawn);
  }

  // Keep central crossing lanes readable.
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const onCenterLane = (r === 4 || r === 5 || c === 4 || c === 5);
      if (onCenterLane && !isSpawnSafeTile(r, c, playerSpawn, botSpawn)) {
        board[r][c].blocked = false;
        board[r][c].blockType = null;
      }
    }
  }

  // Guarantee there is always a route from player to bot.
  if (!boardPathExists(board, playerSpawn, botSpawn)) {
    return createEmptyBoard();
  }

  return board;
}

function getRandomSpawnPair() {
  const p1Candidates = [];
  for (let row = 0; row <= 2; row++) for (let col = 0; col <= 3; col++) p1Candidates.push({ row, col });
  const p2Candidates = [];
  for (let row = SIZE - 3; row < SIZE; row++) for (let col = SIZE - 4; col < SIZE; col++) p2Candidates.push({ row, col });

  const p1 = shuffle(p1Candidates)[0];
  const p2 = shuffle(p2Candidates)
    .filter(c => manhattan(p1, c) >= 8)[0] || shuffle(p2Candidates)[0];

  return { p1, p2 };
}

function makeUnit(team, row, col) {
  return {
    team,
    row,
    col,
    hp: MAX_HP,
    maxHp: MAX_HP,
    facing: team === "player" ? "right" : "left",
    anim: "idle",
    hitFx: false,
    alive: true,
  };
}

function currentUnit() {
  return state.currentTurn === "player" ? state.player : state.bot;
}

function enemyUnit() {
  return state.currentTurn === "player" ? state.bot : state.player;
}

function unitAt(row, col) {
  if (state.player && state.player.alive && state.player.row === row && state.player.col === col) return state.player;
  if (state.bot && state.bot.alive && state.bot.row === row && state.bot.col === col) return state.bot;
  return null;
}

function updateFacing(unit, enemy) {
  if (unit.col < enemy.col) unit.facing = "right";
  else if (unit.col > enemy.col) unit.facing = "left";
}

function spriteFor(unit) {
  if (unit.team === "player") {
    const anim = TILESET.actor.player[unit.anim] ? unit.anim : "idle";
    const facing = unit.facing === "left" ? "left" : "right";
    return TILESET.actor.player[anim][facing];
  }
  return TILESET.actor.bot;
}

function isAdjacent(a, b) {
  return manhattan(a, b) === 1;
}

function isFacingDirectly(attacker, target) {
  // Directly facing in this ruleset = orthogonally adjacent on the final committed step.
  return manhattan(attacker, target) === 1;
}

function getAdjacentMoves(unit, tempPos = null) {
  const pos = tempPos || { row: unit.row, col: unit.col };
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  const moves = [];
  for (const [dr, dc] of dirs) {
    const nr = pos.row + dr;
    const nc = pos.col + dc;
    if (!inBounds(nr, nc)) continue;
    if (state.board[nr][nc].blocked) continue;
    const occ = unitAt(nr, nc);
    if (occ && occ !== unit) continue;
    moves.push({ row: nr, col: nc });
  }
  return moves;
}

function getPlanningOrigin() {
  return state.planningPath.length
    ? state.planningPath[state.planningPath.length - 1]
    : { row: currentUnit().row, col: currentUnit().col };
}

function refreshPlanningMoves() {
  if (state.phase !== "move" || state.locked) {
    state.validMoves = [];
    return;
  }
  if (state.movesRemaining <= 0) {
    state.validMoves = [];
    return;
  }
  const origin = getPlanningOrigin();
  state.validMoves = getAdjacentMoves(currentUnit(), origin);
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

function createActionModal() {
  if (document.getElementById("actionModal")) return;
  const backdrop = document.createElement("div");
  backdrop.className = "action-backdrop";
  backdrop.id = "actionModal";
  backdrop.innerHTML = `
    <div class="action-card">
      <div class="action-title">Choose Action</div>
      <div class="action-subtitle" id="actionSubtitle">Attack or heal.</div>
      <div class="action-buttons">
        <button class="action-btn attack" id="attackActionBtn">Attack</button>
        <button class="action-btn heal" id="healActionBtn">Heal +2 HP</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  document.getElementById("attackActionBtn").addEventListener("click", async () => {
    await resolveActionChoice("attack");
  });
  document.getElementById("healActionBtn").addEventListener("click", async () => {
    await resolveActionChoice("heal");
  });
}

function showActionModal() {
  createActionModal();
  const subtitle = document.getElementById("actionSubtitle");
  if (subtitle) subtitle.textContent = "Your last step is directly facing the enemy.";
  document.getElementById("actionModal").classList.add("show");
}

function hideActionModal() {
  const modal = document.getElementById("actionModal");
  if (modal) modal.classList.remove("show");
}

function startMatch() {
  if (!state.mode) state.mode = "bot";
  const spawns = getRandomSpawnPair();
  state.player = makeUnit("player", spawns.p1.row, spawns.p1.col);
  state.bot = makeUnit("bot", spawns.p2.row, spawns.p2.col);
  state.board = buildBoard(spawns.p1, spawns.p2);
  state.currentTurn = "player";
  state.phase = "roll";
  state.dice = null;
  state.movesRemaining = 0;
  state.planningPath = [];
  state.validMoves = [];
  state.selectedTile = null;
  state.locked = false;
  state.winner = null;
  state.turnCount = 1;
  state.actionPending = false;
  updateFacing(state.player, state.bot);
  updateFacing(state.bot, state.player);
  resultPopup.classList.add("hidden");
  hideActionModal();
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

      const unit = unitAt(row, col);
      if (unit) {
        const actor = document.createElement("div");
        actor.className = `layer actor ${unit.hitFx ? "target-hit" : ""} ${unit.anim === "hit" ? "player-hit" : ""}`.trim();
        actor.style.backgroundImage = `url('${spriteFor(unit)}')`;

        const hp = document.createElement("div");
        hp.className = `hp-badge ${unit.team === "player" ? "player" : "bot"}`;
        hp.textContent = `${unit.hp}`;

        actor.appendChild(hp);
        cell.appendChild(actor);
      }

      cell.addEventListener("click", () => onTileClick(row, col));
      boardEl.appendChild(cell);
    }
  }
}

function renderUI() {
  turnText.textContent = state.winner
    ? `${state.winner === "player" ? "PLAYER" : "BOT"} WINS`
    : `${state.currentTurn === "player" ? "Player" : "Bot"} Turn`;

  if (!state.mode) {
    phaseText.textContent = "Choose a mode from the lobby.";
  } else if (state.phase === "roll") {
    phaseText.textContent = state.currentTurn === "player"
      ? "Roll the dice to start your move."
      : "Bot is thinking...";
  } else if (state.phase === "move") {
    phaseText.textContent = state.currentTurn === "player"
      ? `Plan route: ${state.planningPath.length}/${state.dice} step(s).`
      : "Bot is moving...";
  } else if (state.phase === "actionChoice") {
    phaseText.textContent = "Choose Attack or Heal.";
  } else {
    phaseText.textContent = "Game over.";
  }

  roundText.textContent = `Turn ${state.turnCount}`;
  diceText.textContent = state.dice == null ? "Dice: -" : `Dice: ${state.dice} | Planned: ${state.planningPath.length}/${state.dice}`;
  p1ScoreEl.textContent = String(state.player ? state.player.hp : 0);
  p2ScoreEl.textContent = String(state.bot ? state.bot.hp : 0);
  p1PosEl.textContent = state.player ? coordLabel(state.player) : "(1,1)";
  p2PosEl.textContent = state.bot ? coordLabel(state.bot) : "(8,8)";
  p1DiceEl.textContent = state.currentTurn === "player" && state.dice != null ? `Die ${state.dice}` : "Die -";
  p2DiceEl.textContent = state.currentTurn === "bot" && state.dice != null ? `Die ${state.dice}` : "Die -";
  resultValueEl.textContent = state.dice == null ? "-" : String(state.dice);

  const existingRoomMeta = document.getElementById("roomPasswordMeta");
  if (state.roomCode && !existingRoomMeta) {
    const meta = document.createElement("span");
    meta.id = "roomPasswordMeta";
    meta.textContent = `Room password: ${state.roomCode}`;
    meta.className = "room-password-meta";
    document.querySelector(".meta-line")?.appendChild(meta);
  } else if (existingRoomMeta) {
    existingRoomMeta.textContent = state.roomCode ? `Room password: ${state.roomCode}` : "";
    if (!state.roomCode) existingRoomMeta.remove();
  }

  rollBtn.disabled = !state.mode || !(state.phase === "roll" && state.currentTurn === "player" && !state.locked);
  endTurnBtn.disabled = !state.mode || !!state.locked || state.phase === "gameOver" || state.phase === "actionChoice";
  newRoundBtn.disabled = true;
}

function renderAll() {
  renderTileEngine();
  renderUI();
}

function rollDice() {
  if (state.phase !== "roll" || state.locked) return;
  state.dice = randInt(6) + 1;
  state.movesRemaining = state.dice;
  state.planningPath = [];
  state.phase = "move";
  refreshPlanningMoves();
  renderAll();
}

async function animateStep(unit, row, col) {
  unit.row = row;
  unit.col = col;
  unit.anim = unit.team === "player" ? "walk" : "idle";
  updateFacing(unit, unit === state.player ? state.bot : state.player);
  state.selectedTile = { row, col };
  renderAll();
  await delay(180);
}

async function executePlannedPath() {
  const unit = currentUnit();
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
  updateFacing(unit, enemyUnit());
  renderAll();

  // Action only checks after the FINAL committed move sequence.
  if (route.length > 0 && route.length === state.dice && isFacingDirectly(unit, enemyUnit())) {
    if (state.currentTurn === "player") {
      state.phase = "actionChoice";
      state.actionPending = true;
      renderAll();
      showActionModal();
    } else {
      await botChooseAction();
    }
    return;
  }

  endTurn();
}

async function performAttack(attacker, target) {
  state.locked = true;
  attacker.anim = attacker.team === "player" ? "hit" : "idle";
  target.hitFx = true;
  renderAll();
  await delay(420);

  target.hp = Math.max(0, target.hp - ATTACK_DAMAGE);
  target.hitFx = false;
  attacker.anim = "idle";
  renderAll();
  await delay(140);

  if (target.hp <= 0) {
    target.alive = false;
    finishGame(attacker.team);
    return;
  }

  state.locked = false;
  endTurn();
}

async function performHeal(unit) {
  state.locked = true;
  unit.hp = Math.min(unit.maxHp, unit.hp + HEAL_AMOUNT);
  renderAll();
  await delay(220);
  state.locked = false;
  endTurn();
}

async function resolveActionChoice(type) {
  if (!state.actionPending) return;
  hideActionModal();
  state.actionPending = false;
  const unit = currentUnit();

  if (type === "attack") {
    await performAttack(unit, enemyUnit());
  } else {
    await performHeal(unit);
  }
}

function finishGame(winner) {
  state.winner = winner;
  state.phase = "gameOver";
  state.locked = true;
  state.validMoves = [];
  state.planningPath = [];
  hideActionModal();
  renderAll();

  resultPopupText.textContent = winner === "player" ? "YOU WIN" : "YOU LOST";
  resultPopupSubtext.textContent = winner === "player" ? "Enemy HP dropped to zero." : "Your HP dropped to zero.";
  resultNextBtn.textContent = "New Match";
  resultPopup.classList.remove("hidden");
}

function endTurn() {
  state.currentTurn = state.currentTurn === "player" ? "bot" : "player";
  state.phase = "roll";
  state.dice = null;
  state.movesRemaining = 0;
  state.validMoves = [];
  state.planningPath = [];
  state.selectedTile = null;
  state.actionPending = false;
  state.locked = false;
  state.turnCount += 1;
  state.player.anim = "idle";
  state.bot.anim = "idle";
  updateFacing(state.player, state.bot);
  updateFacing(state.bot, state.player);
  renderAll();

  if (state.currentTurn === "bot") {
    runBotTurn();
  }
}

async function onTileClick(row, col) {
  if (state.currentTurn !== "player" || state.locked || state.phase !== "move") return;
  if (!state.validMoves.some(m => m.row === row && m.col === col)) return;

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

function buildReachableRoutes(unit, maxSteps) {
  const startKey = keyOf(unit.row, unit.col);
  const queue = [{ row: unit.row, col: unit.col, d: 0 }];
  const seen = new Set([startKey]);
  const parent = { [startKey]: null };
  const results = [];

  while (queue.length) {
    const cur = queue.shift();
    if (!(cur.row === unit.row && cur.col === unit.col)) {
      const route = [];
      let k = keyOf(cur.row, cur.col);
      while (k && parent[k] !== null) {
        const [r, c] = k.split(",").map(Number);
        route.push({ row: r, col: c });
        k = parent[k];
      }
      route.reverse();
      results.push({
        row: cur.row,
        col: cur.col,
        distance: cur.d,
        route,
      });
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
      const occ = unitAt(nr, nc);
      if (occ && occ !== unit) continue;
      seen.add(nk);
      parent[nk] = keyOf(cur.row, cur.col);
      queue.push({ row: nr, col: nc, d: cur.d + 1 });
    }
  }

  return results;
}

function chooseBotRoute() {
  const unit = state.bot;
  const enemy = state.player;
  const routes = buildReachableRoutes(unit, state.dice || 0);
  if (!routes.length) return [];

  let bestExactAction = null;
  let bestFallback = null;

  for (const option of routes) {
    const facing = option.col < enemy.col ? "right" : option.col > enemy.col ? "left" : unit.facing;
    const virtual = { row: option.row, col: option.col, facing };
    let score = 0;

    const exactStepCount = option.route.length === state.dice;
    const canTriggerAction = exactStepCount && isFacingDirectly(virtual, enemy);

    if (canTriggerAction) {
      score += enemy.hp <= ATTACK_DAMAGE ? 5000 : 3200;
      score += (MAX_HP - enemy.hp) * 24;
      score += state.bot.hp <= MAX_HP - HEAL_AMOUNT ? 90 : 0;
      score += 500;  // strongly prefer exact-roll action routes
      if (!bestExactAction || score > bestExactAction.score) {
        bestExactAction = { ...option, score };
      }
      continue;
    }

    // Fallback: use the full roll if possible and improve board position.
    const dist = manhattan(virtual, enemy);
    score += (20 - Math.min(dist, 20)) * 30;
    if (exactStepCount) score += 120;
    const center = Math.floor(SIZE / 2);
    score += (SIZE - Math.abs(option.row - center)) * 2;
    score += (SIZE - Math.abs(option.col - center)) * 2;
    score += randInt(6);

    if (!bestFallback || score > bestFallback.score) {
      bestFallback = { ...option, score };
    }
  }

  if (bestExactAction) return bestExactAction.route;
  if (bestFallback) return bestFallback.route;
  return [];
}

async function botChooseAction() {
  state.phase = "actionChoice";
  state.actionPending = true;
  renderAll();
  await delay(260);

  // Bot only gets here after a full-roll route that ends adjacent.
  if (!isFacingDirectly(state.bot, state.player)) {
    state.actionPending = false;
    endTurn();
    return;
  }

  if (state.bot.hp <= 5 && state.bot.hp <= state.player.hp) {
    await resolveBotAction("heal");
    return;
  }

  if (state.player.hp <= ATTACK_DAMAGE) {
    await resolveBotAction("attack");
    return;
  }

  if (state.bot.hp <= 4) {
    await resolveBotAction("heal");
    return;
  }

  await resolveBotAction("attack");
}

async function resolveBotAction(type) {
  state.actionPending = false;
  if (type === "attack") {
    await performAttack(state.bot, state.player);
  } else {
    await performHeal(state.bot);
  }
}

async function runBotTurn() {
  if (state.currentTurn !== "bot" || state.winner) return;

  state.locked = true;
  phaseText.textContent = "Bot is thinking...";
  renderAll();
  await delay(420);

  state.locked = false;
  rollDice();
  state.locked = true;
  renderAll();
  await delay(360);

  const route = chooseBotRoute();
  state.planningPath = [...route];
  if (route.length) {
    const last = route[route.length - 1];
    state.selectedTile = { row: last.row, col: last.col };
  }
  renderAll();
  await delay(240);

  state.locked = false;
  await executePlannedPath();
}

rollBtn.addEventListener("click", () => {
  if (state.currentTurn !== "player") return;
  rollDice();
});

endTurnBtn.addEventListener("click", async () => {
  if (state.phase === "gameOver" || state.locked || state.currentTurn !== "player" || state.phase === "actionChoice") return;

  if (state.phase === "move" && state.planningPath.length) {
    await executePlannedPath();
    return;
  }

  endTurn();
});

newRoundBtn.addEventListener("click", () => {});
document.addEventListener("keydown", (e) => {
  if (state.currentTurn !== "player" || state.phase !== "move" || state.locked) return;
  const keyMap = {
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1],
    W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1],
  };
  if (!(e.key in keyMap)) return;
  e.preventDefault();
  const origin = getPlanningOrigin();
  const [dr, dc] = keyMap[e.key];
  onTileClick(origin.row + dr, origin.col + dc);
});


function createLobbyModal() {
  if (document.getElementById("lobbyModal")) return;

  const backdrop = document.createElement("div");
  backdrop.className = "action-backdrop show";
  backdrop.id = "lobbyModal";
  backdrop.innerHTML = `
    <div class="action-card lobby-card">
      <div class="action-title">Welcome</div>
      <div class="action-subtitle">Choose a mode.</div>

      <div class="lobby-buttons">
        <button class="action-btn attack" id="playBotBtn">Play with Aud (Weak Bot)</button>
        <button class="action-btn heal" id="createGameBtn">Create Game</button>
      </div>

      <div class="lobby-join">
        <input class="lobby-input" id="joinCodeInput" placeholder="Enter room password" maxlength="5" pattern="[A-Za-z0-9]{5}" />
        <button class="action-btn join" id="joinGameBtn">Join Game</button>
      </div>

      <div class="lobby-note" id="lobbyNote">
        Bot mode works now. Create Game and Join Game are still local lobby UI in this static build.
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  document.getElementById("playBotBtn").addEventListener("click", () => {
    state.mode = "bot";
    state.roomCode = null;
    hideLobbyModal();
    startMatch();
  });

  document.getElementById("createGameBtn").addEventListener("click", () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += chars[Math.floor(Math.random() * chars.length)];
    state.mode = "online_stub";
    state.roomCode = code;
    hideLobbyModal();
    startMatch();
  });

  document.getElementById("joinGameBtn").addEventListener("click", () => {
    const rawCode = (document.getElementById("joinCodeInput").value || "").trim().toUpperCase();
    const code = rawCode.replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
    document.getElementById("joinCodeInput").value = code;
    state.mode = "online_stub";
    state.roomCode = code || null;
    const note = document.getElementById("lobbyNote");
    if (!code) {
      note.textContent = "Enter a 5-character room password first.";
      return;
    }
    note.textContent = `Join requested for "${code}". Real online sync is not active in this static build.`;
  });
}

function showLobbyModal() {
  createLobbyModal();
  const modal = document.getElementById("lobbyModal");
  if (modal) modal.classList.add("show");
}

function hideLobbyModal() {
  const modal = document.getElementById("lobbyModal");
  if (modal) modal.classList.remove("show");
}

// Return to lobby from reset / result
resetMatchBtn.addEventListener("click", () => {
  resultPopup.classList.add("hidden");
  state.mode = null;
  state.roomCode = null;
  state.player = null;
  state.bot = null;
  renderAll();
  showLobbyModal();
});

resultNextBtn.addEventListener("click", () => {
  resultPopup.classList.add("hidden");
  state.mode = null;
  state.roomCode = null;
  state.player = null;
  state.bot = null;
  renderAll();
  showLobbyModal();
});

// Initial startup: render board shell, but show lobby first instead of auto-starting match
showLobbyModal();
