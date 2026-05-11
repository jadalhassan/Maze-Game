import random
import heapq
import time
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'maze-secret-key'
socketio = SocketIO(app, cors_allowed_origins='*')

DIFFICULTY = {
    'easy':   {'width': 10, 'height': 10, 'time': 60},
    'medium': {'width': 20, 'height': 20, 'time': 90},
    'hard':   {'width': 30, 'height': 30, 'time': 120},
}

games = {}  # session_id -> game state


# ─── Maze Generation (same algorithm from Main.py) ────────
def generate_maze(width, height):
    maze = [[1] * width for _ in range(height)]
    stack = [(0, 0)]
    maze[0][0] = 0

    while stack:
        x, y = stack[-1]
        neighbors = []
        for dx, dy in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
            nx, ny = x + dx * 2, y + dy * 2
            if 0 <= nx < width and 0 <= ny < height and maze[ny][nx] == 1:
                neighbors.append((nx, ny, dx, dy))
        if neighbors:
            nx, ny, dx, dy = random.choice(neighbors)
            maze[y + dy][x + dx] = 0
            maze[ny][nx] = 0
            stack.append((nx, ny))
        else:
            stack.pop()
    return maze


# ─── A* Pathfinding (same algorithm from Main.py) ─────────
def heuristic(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def find_path(maze, start, end, width, height):
    open_set = [(0, start)]
    came_from = {}
    g_score = {start: 0}
    f_score = {start: heuristic(start, end)}
    in_open = {start}

    while open_set:
        _, current = heapq.heappop(open_set)
        in_open.discard(current)

        if current == end:
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start)
            path.reverse()
            return path

        x, y = current
        for dx, dy in [(0, 1), (1, 0), (0, -1), (-1, 0)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and maze[ny][nx] == 0:
                neighbor = (nx, ny)
                tg = g_score.get(current, float('inf')) + 1
                if tg < g_score.get(neighbor, float('inf')):
                    came_from[neighbor] = current
                    g_score[neighbor] = tg
                    f_score[neighbor] = tg + heuristic(neighbor, end)
                    if neighbor not in in_open:
                        heapq.heappush(open_set, (f_score[neighbor], neighbor))
                        in_open.add(neighbor)
    return None


# ─── Exit Placement (same logic from Main.py) ─────────────
def place_exit(maze, width, height):
    cells = [
        (x, y) for y in range(height) for x in range(width)
        if maze[y][x] == 0 and not (x == 0 and y == 0)
    ]
    far = [(x, y) for x, y in cells if abs(x) + abs(y) >= 5]
    pool = far if far else cells
    return random.choice(pool)


# ─── Routes ───────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


# ─── Socket Events ────────────────────────────────────────
@socketio.on('start_game')
def handle_start(data):
    sid = request.sid
    difficulty = data.get('difficulty', 'medium')
    name = (data.get('name') or 'Player').strip() or 'Player'

    cfg = DIFFICULTY.get(difficulty, DIFFICULTY['medium'])
    w, h = cfg['width'], cfg['height']

    maze = generate_maze(w, h)
    ex, ey = place_exit(maze, w, h)
    path = find_path(maze, (0, 0), (ex, ey), w, h) or []

    games[sid] = {
        'name': name,
        'difficulty': difficulty,
        'maze': maze,
        'width': w,
        'height': h,
        'player': [0, 0],
        'exit': [ex, ey],
        'solution': [list(p) for p in path],
        'time_remaining': cfg['time'],
        'hints_remaining': 3,
        'show_solution': False,
        'hint_cell': None,
        'move_count': 0,
        'correct_moves': 0,
        'hint_uses': 0,
        'solution_views': 0,
        'game_over': False,
        'start_time': time.time(),
    }

    emit('game_started', {
        'maze': maze,
        'width': w,
        'height': h,
        'player': [0, 0],
        'exit': [ex, ey],
        'solution': [list(p) for p in path],
        'time_remaining': cfg['time'],
        'hints_remaining': 3,
        'name': name,
        'difficulty': difficulty,
    })


@socketio.on('move')
def handle_move(data):
    sid = request.sid
    g = games.get(sid)
    if not g or g['game_over']:
        return

    dx, dy = data.get('dx', 0), data.get('dy', 0)
    px, py = g['player']
    nx, ny = px + dx, py + dy
    maze = g['maze']

    if not (0 <= nx < g['width'] and 0 <= ny < g['height'] and maze[ny][nx] == 0):
        return

    # Check if move follows the solution path
    sol = [tuple(p) for p in g['solution']]
    for i in range(len(sol) - 1):
        if sol[i] == (px, py) and sol[i + 1] == (nx, ny):
            g['correct_moves'] += 1
            break

    g['player'] = [nx, ny]
    g['move_count'] += 1
    g['hint_cell'] = None

    won = (nx == g['exit'][0] and ny == g['exit'][1])
    if won:
        g['game_over'] = True

    emit('state_update', {
        'player': g['player'],
        'move_count': g['move_count'],
        'hint_cell': g['hint_cell'],
        'hints_remaining': g['hints_remaining'],
    })

    if won:
        emit('game_ended', _build_end_data(g, True))


@socketio.on('hint')
def handle_hint():
    sid = request.sid
    g = games.get(sid)
    if not g or g['game_over']:
        return

    if g['hints_remaining'] <= 0:
        emit('message', {'text': 'No hints remaining!'})
        return

    px, py = g['player']
    sol = [tuple(p) for p in g['solution']]
    next_step = None

    for i in range(len(sol) - 1):
        if sol[i] == (px, py):
            next_step = list(sol[i + 1])
            break

    if not next_step and len(sol) > 1:
        next_step = list(sol[1])

    if next_step:
        g['hint_cell'] = next_step
        g['hints_remaining'] -= 1
        g['hint_uses'] += 1
        emit('state_update', {
            'player': g['player'],
            'move_count': g['move_count'],
            'hint_cell': next_step,
            'hints_remaining': g['hints_remaining'],
        })
        emit('message', {'text': f"Hint shown! {g['hints_remaining']} remaining"})


@socketio.on('toggle_solution')
def handle_toggle_solution():
    sid = request.sid
    g = games.get(sid)
    if not g or g['game_over']:
        return

    g['show_solution'] = not g['show_solution']
    if g['show_solution']:
        g['solution_views'] += 1

    emit('solution_toggled', {
        'show': g['show_solution'],
        'solution': g['solution'],
    })
    emit('message', {'text': 'Solution revealed!' if g['show_solution'] else 'Solution hidden'})


@socketio.on('tick')
def handle_tick():
    sid = request.sid
    g = games.get(sid)
    if not g or g['game_over']:
        return

    cfg = DIFFICULTY.get(g['difficulty'], DIFFICULTY['medium'])
    elapsed = int(time.time() - g['start_time'])
    remaining = max(0, cfg['time'] - elapsed)
    g['time_remaining'] = remaining

    if remaining <= 0:
        g['game_over'] = True
        emit('game_ended', _build_end_data(g, False))
    else:
        emit('timer_update', {'time_remaining': remaining})


@socketio.on('disconnect')
def handle_disconnect():
    games.pop(request.sid, None)


def _build_end_data(g, won):
    acc = (g['correct_moves'] / g['move_count'] * 100) if g['move_count'] else 0
    cfg = DIFFICULTY.get(g['difficulty'], DIFFICULTY['medium'])
    return {
        'won': won,
        'time_remaining': g['time_remaining'],
        'move_count': g['move_count'],
        'path_accuracy': round(acc, 1),
        'time_used': cfg['time'] - g['time_remaining'],
        'hint_uses': g['hint_uses'],
        'solution_views': g['solution_views'],
        'optimal_path': len(g['solution']),
    }


if __name__ == '__main__':
    socketio.run(app, debug=True)
