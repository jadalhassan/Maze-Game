// ─── Config ────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
    easy:   { width: 10, height: 10, time: 60,  cellSize: 42 },
    medium: { width: 20, height: 20, time: 90,  cellSize: 28 },
    hard:   { width: 30, height: 30, time: 120, cellSize: 20 },
};

const COLORS = {
    wall:       '#1a2634',
    path:       '#ecf0f1',
    start:      'rgba(46,204,113,0.25)',
    exit:       '#e74c3c',
    player:     '#27ae60',
    playerRing: '#1e8449',
    solution:   'rgba(52,152,219,0.55)',
    hint:       '#f1c40f',
    grid:       'rgba(0,0,0,0.04)',
};

// ─── State ─────────────────────────────────────────────────
let maze          = [];
let solutionPath  = [];
let playerPos     = { x: 0, y: 0 };
let exitPos       = { x: 0, y: 0 };
let gameState     = 'setup';   // 'setup' | 'playing' | 'ended'
let timeRemaining = 90;
let hintsRemaining= 3;
let showSolution  = false;
let hintCell      = null;
let moveCount     = 0;
let correctMoves  = 0;
let hintUses      = 0;
let solutionViews = 0;
let playerName    = 'Player';
let difficulty    = 'medium';
let mazeWidth     = 20;
let mazeHeight    = 20;
let cellSize      = 28;
let timerInterval = null;
let gameStartTime = null;
let msgTimeout    = null;

const canvas = document.getElementById('maze-canvas');
const ctx    = canvas.getContext('2d');

// ─── Maze Generation (recursive backtracking, iterative) ───
function generateMaze(w, h) {
    const m = Array.from({ length: h }, () => new Array(w).fill(1));
    const stack = [[0, 0]];
    m[0][0] = 0;

    while (stack.length) {
        const [x, y] = stack[stack.length - 1];
        const nb = [];
        for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
            const nx = x + dx * 2, ny = y + dy * 2;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && m[ny][nx] === 1)
                nb.push([nx, ny, dx, dy]);
        }
        if (nb.length) {
            const [nx, ny, dx, dy] = nb[Math.floor(Math.random() * nb.length)];
            m[y + dy][x + dx] = 0;
            m[ny][nx] = 0;
            stack.push([nx, ny]);
        } else {
            stack.pop();
        }
    }
    return m;
}

// ─── A* Pathfinding ────────────────────────────────────────
function findPath(start, end) {
    const key = (x, y) => x * 10000 + y;
    const h   = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

    const openSet  = [[0, start]];
    const cameFrom = {};
    const gScore   = { [key(...start)]: 0 };
    const inOpen   = new Set([key(...start)]);

    while (openSet.length) {
        openSet.sort((a, b) => a[0] - b[0]);
        const [, cur] = openSet.shift();
        const [cx, cy] = cur;
        inOpen.delete(key(cx, cy));

        if (cx === end[0] && cy === end[1]) {
            const path = [];
            let k = key(cx, cy);
            while (k in cameFrom) {
                const x = Math.floor(k / 10000), y = k % 10000;
                path.push([x, y]);
                k = cameFrom[k];
            }
            path.push(start);
            path.reverse();
            return path;
        }

        for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= mazeWidth || ny < 0 || ny >= mazeHeight || maze[ny][nx] !== 0) continue;
            const nk  = key(nx, ny);
            const ng  = (gScore[key(cx, cy)] ?? Infinity) + 1;
            if (ng < (gScore[nk] ?? Infinity)) {
                cameFrom[nk]  = key(cx, cy);
                gScore[nk]    = ng;
                const f       = ng + h([nx, ny], end);
                if (!inOpen.has(nk)) { openSet.push([f, [nx, ny]]); inOpen.add(nk); }
            }
        }
    }
    return null;
}

// ─── Exit Placement ────────────────────────────────────────
function placeExit() {
    const cells = [];
    for (let y = 0; y < mazeHeight; y++)
        for (let x = 0; x < mazeWidth; x++)
            if (maze[y][x] === 0 && !(x === 0 && y === 0))
                cells.push([x, y]);

    const far = cells.filter(([x, y]) => x + y >= 5);
    const pool = far.length ? far : cells;
    return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Rendering ─────────────────────────────────────────────
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Cells
    for (let y = 0; y < mazeHeight; y++) {
        for (let x = 0; x < mazeWidth; x++) {
            ctx.fillStyle = maze[y][x] === 1 ? COLORS.wall : COLORS.path;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
    }

    // Start highlight
    ctx.fillStyle = COLORS.start;
    ctx.fillRect(0, 0, cellSize, cellSize);

    // Solution path
    if (showSolution && solutionPath.length > 1) {
        ctx.save();
        ctx.strokeStyle = COLORS.solution;
        ctx.lineWidth   = cellSize * 0.38;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        solutionPath.forEach(([x, y], i) => {
            const px = x * cellSize + cellSize / 2;
            const py = y * cellSize + cellSize / 2;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
    }

    // Hint dot
    if (hintCell) {
        const [hx, hy] = hintCell;
        ctx.fillStyle = COLORS.hint;
        ctx.beginPath();
        ctx.arc(hx * cellSize + cellSize / 2, hy * cellSize + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Exit
    ctx.fillStyle = COLORS.exit;
    ctx.beginPath();
    ctx.arc(exitPos.x * cellSize + cellSize / 2, exitPos.y * cellSize + cellSize / 2, cellSize / 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Player
    const px = playerPos.x * cellSize + cellSize / 2;
    const py = playerPos.y * cellSize + cellSize / 2;
    ctx.fillStyle   = COLORS.player;
    ctx.strokeStyle = COLORS.playerRing;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(px, py, cellSize / 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Border
    ctx.strokeStyle = '#111';
    ctx.lineWidth   = 3;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
}

// ─── Player Movement ───────────────────────────────────────
function movePlayer(dx, dy) {
    if (gameState !== 'playing') return;

    const nx = playerPos.x + dx;
    const ny = playerPos.y + dy;

    if (nx < 0 || nx >= mazeWidth || ny < 0 || ny >= mazeHeight || maze[ny][nx] !== 0) return;

    // Check if move follows solution path
    for (let i = 0; i < solutionPath.length - 1; i++) {
        if (solutionPath[i][0] === playerPos.x && solutionPath[i][1] === playerPos.y &&
            solutionPath[i+1][0] === nx && solutionPath[i+1][1] === ny) {
            correctMoves++;
            break;
        }
    }

    playerPos.x = nx;
    playerPos.y = ny;
    moveCount++;
    hintCell = null;

    updateHUD();
    draw();

    if (nx === exitPos.x && ny === exitPos.y) endGame(true);
}

// ─── Hint ──────────────────────────────────────────────────
function showHint() {
    if (gameState !== 'playing') return;
    if (hintsRemaining <= 0) { showMessage('No hints remaining!'); return; }

    let next = null;
    for (let i = 0; i < solutionPath.length - 1; i++) {
        if (solutionPath[i][0] === playerPos.x && solutionPath[i][1] === playerPos.y) {
            next = solutionPath[i + 1];
            break;
        }
    }
    if (!next && solutionPath.length > 1) next = solutionPath[1];

    if (next) {
        hintCell = next;
        hintsRemaining--;
        hintUses++;
        updateHUD();
        draw();
        showMessage(`Hint shown! ${hintsRemaining} remaining`);
    }
}

// ─── Solution Toggle ───────────────────────────────────────
function toggleSolution() {
    if (gameState !== 'playing') return;
    showSolution = !showSolution;
    if (showSolution) { solutionViews++; showMessage('Solution revealed!'); }
    else showMessage('Solution hidden');
    draw();
}

// ─── Timer ─────────────────────────────────────────────────
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateHUD();
        if (timeRemaining <= 0) { clearInterval(timerInterval); endGame(false); }
    }, 1000);
}

// ─── HUD ───────────────────────────────────────────────────
function updateHUD() {
    document.getElementById('timer-display').textContent = timeRemaining;
    document.getElementById('moves-count').textContent   = moveCount;
    document.getElementById('hints-count').textContent   = hintsRemaining;

    const el = document.getElementById('timer-display');
    el.className = 'timer' + (timeRemaining <= 10 ? ' danger' : timeRemaining <= 20 ? ' warning' : '');
}

// ─── Message ───────────────────────────────────────────────
function showMessage(text, ms = 2500) {
    const el = document.getElementById('message-overlay');
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(msgTimeout);
    msgTimeout = setTimeout(() => el.classList.remove('visible'), ms);
}

// ─── Start Game ────────────────────────────────────────────
function startGame() {
    const cfg = DIFFICULTY_CONFIG[difficulty];
    playerName      = (document.getElementById('player-name').value.trim()) || 'Player';
    mazeWidth       = cfg.width;
    mazeHeight      = cfg.height;
    cellSize        = cfg.cellSize;
    timeRemaining   = cfg.time;
    moveCount       = 0;
    correctMoves    = 0;
    hintsRemaining  = 3;
    hintUses        = 0;
    solutionViews   = 0;
    showSolution    = false;
    hintCell        = null;
    gameState       = 'playing';

    maze            = generateMaze(mazeWidth, mazeHeight);
    const [ex, ey]  = placeExit();
    exitPos         = { x: ex, y: ey };
    solutionPath    = findPath([0, 0], [ex, ey]) || [];
    playerPos       = { x: 0, y: 0 };

    canvas.width    = mazeWidth  * cellSize;
    canvas.height   = mazeHeight * cellSize;

    document.getElementById('player-display').textContent     = playerName;
    const badge = document.getElementById('difficulty-display');
    badge.textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    badge.className   = 'badge ' + difficulty;

    updateHUD();
    showScreen('game-screen');
    draw();

    gameStartTime = Date.now();
    startTimer();

    showMessage(`Welcome ${playerName}! Reach the red dot. Press H for a hint.`, 3500);
}

// ─── End Game ──────────────────────────────────────────────
function endGame(won) {
    gameState = 'ended';
    clearInterval(timerInterval);

    const elapsed     = ((Date.now() - gameStartTime) / 1000).toFixed(1);
    const accuracy    = moveCount > 0 ? ((correctMoves / moveCount) * 100).toFixed(1) : '0.0';
    const timeUsed    = DIFFICULTY_CONFIG[difficulty].time - timeRemaining;
    const optimalLen  = solutionPath.length;

    document.getElementById('end-icon').textContent    = won ? '🏆' : '💀';
    document.getElementById('end-title').textContent   = won ? 'You Win!' : "Time's Up!";
    document.getElementById('end-subtitle').textContent = won
        ? `You escaped with ${timeRemaining}s to spare!`
        : 'The maze got you this time. Try again!';

    const stats = [
        { label: 'Total Moves',    value: moveCount       },
        { label: 'Path Accuracy',  value: accuracy + '%'  },
        { label: 'Time Used',      value: timeUsed + 's'  },
        { label: 'Hints Used',     value: hintUses        },
        { label: 'Solution Views', value: solutionViews   },
        { label: 'Optimal Path',   value: optimalLen + ' steps' },
    ];

    document.getElementById('stats-grid').innerHTML = stats.map(s => `
        <div class="stat-card">
            <div class="stat-value">${s.value}</div>
            <div class="stat-label">${s.label}</div>
        </div>
    `).join('');

    showScreen('end-screen');
}

// ─── Screen Management ─────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function showSetup() {
    clearInterval(timerInterval);
    gameState = 'setup';
    showScreen('setup-screen');
}

function restartGame() {
    clearInterval(timerInterval);
    startGame();
}

// ─── Keyboard Controls ─────────────────────────────────────
document.addEventListener('keydown', e => {
    switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); movePlayer(0, -1);  break;
        case 'ArrowDown':  e.preventDefault(); movePlayer(0,  1);  break;
        case 'ArrowLeft':  e.preventDefault(); movePlayer(-1, 0);  break;
        case 'ArrowRight': e.preventDefault(); movePlayer( 1, 0);  break;
        case 'h': case 'H': showHint();        break;
        case 's': case 'S': toggleSolution();  break;
        case 'r': case 'R': if (gameState !== 'setup') restartGame(); break;
    }
});

// ─── Touch / Swipe Controls ────────────────────────────────
let touchX = 0, touchY = 0;
canvas.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
    Math.abs(dx) > Math.abs(dy) ? movePlayer(dx > 0 ? 1 : -1, 0) : movePlayer(0, dy > 0 ? 1 : -1);
    e.preventDefault();
}, { passive: false });

// ─── Setup UI Events ───────────────────────────────────────
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        difficulty = btn.dataset.diff;
    });
});

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') startGame();
});
