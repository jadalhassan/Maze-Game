const socket = io();

// ─── Rendering config ──────────────────────────────────────
const CELL_SIZES = { easy: 42, medium: 28, hard: 20 };

const COLORS = {
    wall:       '#1a2634',
    path:       '#ecf0f1',
    start:      'rgba(46,204,113,0.25)',
    exit:       '#e74c3c',
    player:     '#27ae60',
    playerRing: '#1e8449',
    solution:   'rgba(52,152,219,0.55)',
    hint:       '#f1c40f',
};

// ─── Client state (render only — truth lives in Python) ───
let maze         = [];
let solutionPath = [];
let playerPos    = [0, 0];
let exitPos      = [0, 0];
let hintCell     = null;
let showSolution = false;
let mazeWidth    = 20;
let mazeHeight   = 20;
let cellSize     = 28;
let difficulty   = 'medium';
let timerInterval= null;
let msgTimeout   = null;

const canvas = document.getElementById('maze-canvas');
const ctx    = canvas.getContext('2d');

// ─── Drawing ───────────────────────────────────────────────
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < mazeHeight; y++) {
        for (let x = 0; x < mazeWidth; x++) {
            ctx.fillStyle = maze[y][x] === 1 ? COLORS.wall : COLORS.path;
            ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
    }

    ctx.fillStyle = COLORS.start;
    ctx.fillRect(0, 0, cellSize, cellSize);

    if (showSolution && solutionPath.length > 1) {
        ctx.save();
        ctx.strokeStyle = COLORS.solution;
        ctx.lineWidth   = cellSize * 0.38;
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath();
        solutionPath.forEach(([x, y], i) => {
            const px = x * cellSize + cellSize / 2;
            const py = y * cellSize + cellSize / 2;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.restore();
    }

    if (hintCell) {
        const [hx, hy] = hintCell;
        ctx.fillStyle = COLORS.hint;
        ctx.beginPath();
        ctx.arc(hx * cellSize + cellSize / 2, hy * cellSize + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // Exit dot
    ctx.fillStyle = COLORS.exit;
    ctx.beginPath();
    ctx.arc(exitPos[0] * cellSize + cellSize / 2, exitPos[1] * cellSize + cellSize / 2, cellSize / 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Player dot
    const px = playerPos[0] * cellSize + cellSize / 2;
    const py = playerPos[1] * cellSize + cellSize / 2;
    ctx.fillStyle   = COLORS.player;
    ctx.strokeStyle = COLORS.playerRing;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.arc(px, py, cellSize / 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#111';
    ctx.lineWidth   = 3;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
}

// ─── Socket Events (Python → Browser) ─────────────────────
socket.on('game_started', data => {
    maze         = data.maze;
    mazeWidth    = data.width;
    mazeHeight   = data.height;
    playerPos    = data.player;
    exitPos      = data.exit;
    solutionPath = data.solution;
    hintCell     = null;
    showSolution = false;
    cellSize     = CELL_SIZES[data.difficulty] || 28;

    canvas.width  = mazeWidth  * cellSize;
    canvas.height = mazeHeight * cellSize;

    const badge = document.getElementById('difficulty-display');
    badge.textContent = data.difficulty.charAt(0).toUpperCase() + data.difficulty.slice(1);
    badge.className   = 'badge ' + data.difficulty;
    document.getElementById('player-display').textContent = data.name;

    updateHUD(data.time_remaining, 0, data.hints_remaining);
    showScreen('game-screen');
    draw();

    clearInterval(timerInterval);
    timerInterval = setInterval(() => socket.emit('tick'), 1000);

    showMessage(`Welcome ${data.name}! Reach the red dot. Press H for a hint.`, 3500);
});

socket.on('state_update', data => {
    playerPos = data.player;
    hintCell  = data.hint_cell;
    updateHUD(null, data.move_count, data.hints_remaining);
    draw();
});

socket.on('timer_update', data => {
    updateHUD(data.time_remaining, null, null);
});

socket.on('solution_toggled', data => {
    showSolution = data.show;
    solutionPath = data.solution;
    draw();
});

socket.on('game_ended', data => {
    clearInterval(timerInterval);
    buildEndScreen(data);
    showScreen('end-screen');
});

socket.on('message', data => {
    showMessage(data.text);
});

// ─── Actions (Browser → Python) ───────────────────────────
function sendMove(dx, dy) { socket.emit('move', { dx, dy }); }
function sendHint()        { socket.emit('hint'); }
function sendToggleSolution() { socket.emit('toggle_solution'); }

// ─── Keyboard + Touch ──────────────────────────────────────
document.addEventListener('keydown', e => {
    switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); sendMove(0, -1);  break;
        case 'ArrowDown':  e.preventDefault(); sendMove(0,  1);  break;
        case 'ArrowLeft':  e.preventDefault(); sendMove(-1, 0);  break;
        case 'ArrowRight': e.preventDefault(); sendMove( 1, 0);  break;
        case 'h': case 'H': sendHint();              break;
        case 's': case 'S': sendToggleSolution();    break;
        case 'r': case 'R': restartGame();            break;
    }
});

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
    Math.abs(dx) > Math.abs(dy) ? sendMove(dx > 0 ? 1 : -1, 0) : sendMove(0, dy > 0 ? 1 : -1);
    e.preventDefault();
}, { passive: false });

// ─── HUD ───────────────────────────────────────────────────
let _time = 90, _moves = 0, _hints = 3;
function updateHUD(time, moves, hints) {
    if (time  !== null && time  !== undefined) _time  = time;
    if (moves !== null && moves !== undefined) _moves = moves;
    if (hints !== null && hints !== undefined) _hints = hints;

    document.getElementById('timer-display').textContent = _time;
    document.getElementById('moves-count').textContent   = _moves;
    document.getElementById('hints-count').textContent   = _hints;

    const el = document.getElementById('timer-display');
    el.className = 'timer' + (_time <= 10 ? ' danger' : _time <= 20 ? ' warning' : '');
}

// ─── Message Toast ─────────────────────────────────────────
function showMessage(text, ms = 2500) {
    const el = document.getElementById('message-overlay');
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(msgTimeout);
    msgTimeout = setTimeout(() => el.classList.remove('visible'), ms);
}

// ─── End Screen ────────────────────────────────────────────
function buildEndScreen(data) {
    document.getElementById('end-icon').textContent     = data.won ? '🏆' : '💀';
    document.getElementById('end-title').textContent    = data.won ? 'You Win!' : "Time's Up!";
    document.getElementById('end-subtitle').textContent = data.won
        ? `You escaped with ${data.time_remaining}s to spare!`
        : 'The maze got you this time. Try again!';

    const stats = [
        { label: 'Total Moves',    value: data.move_count       },
        { label: 'Path Accuracy',  value: data.path_accuracy + '%' },
        { label: 'Time Used',      value: data.time_used + 's'  },
        { label: 'Hints Used',     value: data.hint_uses        },
        { label: 'Solution Views', value: data.solution_views   },
        { label: 'Optimal Path',   value: data.optimal_path + ' steps' },
    ];

    document.getElementById('stats-grid').innerHTML = stats.map(s => `
        <div class="stat-card">
            <div class="stat-value">${s.value}</div>
            <div class="stat-label">${s.label}</div>
        </div>
    `).join('');
}

// ─── Screen Management ─────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function showSetup() {
    clearInterval(timerInterval);
    showScreen('setup-screen');
}

function restartGame() {
    clearInterval(timerInterval);
    const name = document.getElementById('player-name').value.trim();
    socket.emit('start_game', { name, difficulty });
}

// ─── Setup UI ──────────────────────────────────────────────
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        difficulty = btn.dataset.diff;
    });
});

document.getElementById('start-btn').addEventListener('click', () => {
    const name = document.getElementById('player-name').value.trim();
    socket.emit('start_game', { name, difficulty });
});

document.getElementById('player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('start-btn').click();
});
