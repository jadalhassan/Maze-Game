# 🧩 AI Maze Game

A Python turtle-graphics maze game with AI-powered pathfinding, real-time hints, and session performance tracking.

---

## 🎮 Features

- **Procedurally generated mazes** — unique layout every run using recursive backtracking
- **Three difficulty levels** — Easy (10×10), Medium (20×20), Hard (30×30)
- **A\* pathfinding AI** — computes the optimal solution path from start to exit
- **Hint system** — 3 hints per game, each revealing the next step on the optimal path
- **Toggle solution** — reveal or hide the full AI solution path at any time
- **30-second countdown timer** — race to reach the exit before time runs out
- **Performance tracking** — saves stats to CSV after every session

---

## 📋 Requirements

- Python 3.x
- `pandas`

Install dependencies:

```bash
pip install pandas
```

> `turtle`, `random`, `time`, `heapq`, and `datetime` are all part of Python's standard library.

---

## 🚀 How to Run

```bash
python Main.py
```

On launch, two dialogs will appear:

1. **Player Name** — enter your name (defaults to `"Player"` if left blank)
2. **Difficulty** — enter `easy`, `medium`, or `hard` (defaults to `medium` if invalid)

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `↑ ↓ ← →` | Move the player |
| `h` | Use a hint (shows next step on optimal path) |
| `s` | Toggle full solution path on/off |

---

## 🗺️ How It Works

### Maze Generation
The maze is generated using **iterative depth-first search** (recursive backtracking). Starting from the top-left corner `(0, 0)`, the algorithm carves passages by visiting unvisited neighbors two cells away, producing a perfect maze with exactly one solution.

### AI Pathfinding — A\*
Once the maze and exit are created, the game runs **A\* search** to find the optimal path from `(0, 0)` to the exit. The heuristic used is **Manhattan distance**:

```
h(a, b) = |a.x - b.x| + |a.y - b.y|
```

This path powers both the hint system and the solution overlay.

### Exit Placement
The exit is placed on a random open cell that is at least **Manhattan distance 5** from the start, ensuring it is never trivially close.

---

## 📊 Performance Tracking

After each session, two CSV files are updated (or created) in the working directory:

### `maze_performance_data.csv`

One row per session:

| Column | Description |
|--------|-------------|
| `session_id` | Unique timestamp-based ID |
| `player_name` | Name entered at start |
| `difficulty` | `easy`, `medium`, or `hard` |
| `completed` | `True` if the player reached the exit |
| `completion_time` | Seconds elapsed |
| `total_moves` | Total valid moves made |
| `correct_moves` | Moves that followed the optimal path |
| `path_accuracy` | `correct_moves / total_moves × 100` |
| `avg_reaction_time` | Average seconds between consecutive moves |
| `hints_used` | Number of hints consumed |
| `solution_views` | Number of times the solution was toggled on |
| `optimal_path_length` | Length of the A\* solution |
| `timestamp` | Wall-clock time of session end |

### `maze_move_details.csv`

One row per move made:

| Column | Description |
|--------|-------------|
| `session_id` | Links back to the session |
| `move_number` | Sequential move index |
| `on_optimal_path` | `True` if the move followed the A\* path |
| `timestamp` | Unix time of the move |
| `reaction_time` | Seconds since the previous move |

---

## 🏁 Win / Loss Conditions

| Outcome | Condition |
|---------|-----------|
| **Win** | Player reaches the exit cell before time runs out |
| **Loss** | 30-second countdown reaches zero |

On a win, the final screen shows:
- Time remaining
- Total moves and path accuracy
- Average reaction time
- Hints used

---

## 📁 Project Structure

```
Main.py                     # Full game source
maze_performance_data.csv   # Created after first session (session summaries)
maze_move_details.csv       # Created after first session (per-move data)
```

---

## ⚙️ Configuration

These constants at the top of `Main.py` can be adjusted:

| Constant | Default | Description |
|----------|---------|-------------|
| `CELL_SIZE` | `20` | Pixel size of each maze cell |
| `PLAYER_COLOR` | `"green"` | Color of the player turtle |
| `EXIT_COLOR` | `"red"` | Color of the exit marker |
| `PATH_COLOR` | `"blue"` | Color of the solution path overlay |
| `HINT_COLOR` | `"gold"` | Color of the hint dot |
| Timer limit | `30` | Seconds per game (hardcoded in `update_timer`) |
| Hints per game | `3` | Starting value of `hints_remaining` |
