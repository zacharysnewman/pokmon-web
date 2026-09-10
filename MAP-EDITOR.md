# MAP-EDITOR.md — Level Editor

## Overview

A browser-based tile editor overlaid on the game canvas, accessible via `?editor=true`. Supports designing, saving, loading, and play-testing custom dot-maze levels. All changes are auto-saved and levels can be stored in a persistent in-browser library.

---

## Accessing the Editor

```
http://localhost:PORT/?editor=true
```

On load the editor restores the last auto-saved session. If no autosave exists it starts from the built-in Classic level.

---

## Features

### The tile set (budgets)

Every placeable thing has a budget, so a custom map can be held to the same
stock as the main map instead of drifting into something unplayable. Budgets
are an **editor-side constraint only** — the saved JSON, the level format and
the game logic are untouched.

| Tile set | Dots | Power | Ghost doors | Red zones | Walls / Empty |
|---|---|---|---|---|---|
| **Classic** (default) | 240 | 4 | 2 | 4 | ∞ |
| **Extended** | 360 | 8 | 4 | 8 | ∞ |
| **Sandbox** | ∞ | ∞ | ∞ | ∞ | ∞ |

- Classic's numbers are read from the built-in map at startup, so they cannot
  drift out of sync with it.
- A budget of `-1` (`INFINITE`, shown as `∞`) means unlimited.
- The **Tile set** section shows a live `used / budget` bar per kind, and each
  palette entry shows how many are left.
- Painting past a budget is refused and explains itself in a toast; erasing
  hands the budget back. Flood fill places as many as the budget allows.
- The tile set is remembered per person (`editor_prefs`) and stored alongside
  library entries, so re-opening a map restores the set it was authored under.
- Validation reports anything over budget — e.g. after importing a level built
  under a roomier set.

### Objects — one of each

Spawns and scatter targets are single movable objects, not paintable tiles.
There is exactly one of each and it can never be duplicated or deleted:

| Object | What it is |
|---|---|
| **P Player** | Where the player starts each life |
| **R / C / H / O** | The four ghost starting points |
| **F Fruit** | Where bonus fruit appears |
| **✕ ×4** | Each ghost's scatter-mode corner target |

With the **✥ Move objects** tool you drag any of them straight on the maze.
Clicking an object in the **Objects** list arms it — the next tap on the maze
places it — and arrow keys nudge the armed object one tile at a time. The list
shows each object's live coordinates. **Drop on half-tile** places on `x.5`
(the Classic player and red ghost sit on half-tiles).

The ghost-house gate is a **tile** now (budget 2 in Classic), painted like any
other. The level's `enemyHouseDoor` coordinate is kept in sync automatically,
so the saved JSON is unchanged.

### Tile Painting

| Tool | How to use | Key |
|---|---|---|
| **Paint** | Click/drag the canvas to place the selected tile | `B` |
| **Erase** | Click/drag to set tiles to Empty | `E` |
| **Flood Fill** | Click any tile to BFS-fill all contiguous matching tiles | `F` |
| **Move objects** | Drag spawns and scatter targets | `M` |
| **Red zone** | Click/drag to toggle junctions where ghosts can't turn up | `R` |
| **Tunnel row** | Click any tile — its row becomes the warp tunnel row | `T` |

Tile types in the palette:

| Swatch | Value | Meaning | Key |
|---|---|---|---|
| Wall | `0` | Solid — players and enemies cannot pass | `1` |
| Empty | `5` | Open corridor, no collectible | `2` |
| Dot  | `3` | Small pellet — counts toward level clear | `3` |
| Power | `4` | Power pellet — triggers frightened mode | `4` |
| Ghost Door | `2` | Ghost-house gate — only entering/exiting ghosts pass | `5` |

**Brush size** paints 1×1, 2×2 or 3×3 at once (`[` and `]`).

### Mirror painting

Symmetric mazes take a quarter of the clicks. `X` cycles the modes; the mirrored
axes are drawn on the canvas as dashed guides, and the hover preview shows every
tile a stroke will touch.

| Mode | Also paints |
|---|---|
| **· Off** | nothing else |
| **⇔ L/R** | the matching column on the other side |
| **⇕ T/B** | the matching row on the other side |
| **⤢ Diag** | the tile opposite through the centre |
| **⊞ All 4** | all four quadrants at once |

The grid is 28 × 36 — not square — so a corner-to-corner diagonal reflection has
nowhere to land; **Diag** mirrors through the centre point (a 180° rotation),
which is the diagonal symmetry a rectangular maze can hold. Mirroring applies to
red-zone toggling too, and every mirrored tile draws from the same budget.

### Canvas overlay

- **Map bounds** — a white rectangle marks the paintable 28 × 36 area.
- **Grid** — faint guide lines, toggled with `G`.
- **Tunnel** — cyan boxes with outward arrows on the two tiles that actually
  wrap, amber tint on the columns where enemies slow down
  (`tunnelSlowColMax` / `tunnelSlowColMin`), and a dashed centre line marking
  the row. Selecting the tunnel tool lights up the whole row, since that is what
  a click is about to change.
- Red-zone tint, ghost-door outlines, mirror guides.
- Object markers, with a dashed ring around the armed one.
- Hover preview of the exact cells the brush will paint.

Walls, dots and the ghost-house gate are drawn from the level being edited, so
the maze on screen is always the maze you are painting.

### Undo / Redo

Snapshot-based, up to 50 steps; `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`). One
stroke is one step, and a stroke that changes nothing does not push a step.

## Validation

Click **✔ Validate** to run all checks. Results appear inline in the panel.

| # | Rule |
|---|---|
| 1 | Grid must be exactly 36 rows × 28 columns |
| 2 | At least one dot or power pellet must exist |
| 3 | Player spawn must be on a walkable tile (value > 0) |
| 4 | All enemy spawns must be on walkable tiles |
| 5 | Fruit spawn should be on a walkable tile (warning only) |
| 6 | Tunnel row must be in bounds |
| 7 | BFS reachability — all dots must be reachable from player spawn (respects tunnel wrapping) |
| 8 | Level name should not be empty (warning only) |
| 9 | Nothing may exceed the current tile set's budget |
| 10 | Ghost door tiles and power pellets should exist (warnings only) |
| 11 | Two objects starting on the same tile (warning only) |

**▶ Test level** runs the same checks first and refuses to launch on errors.

---

## Play-Testing

**▶ Test Level** validates first, then launches a live game session with the current editor level (1-player keyboard/gamepad). Press **Escape** at any time to return to the editor. Game-over also returns to the editor automatically.

---

## Level Library (Multi-Map)

All maps are stored persistently in `localStorage` under the key `editor_library`.

| Button | Effect |
|---|---|
| **💾 Save to library** | Saves/updates the current level, along with the tile set it was authored under. Re-saving overwrites the same entry (by ID). Requires a non-empty level name. |
| **📂 My maps (n)** | Opens the library browser modal showing all saved levels. |

### Library Modal

Each entry shows:
- **Level name** and last-saved timestamp
- **Dot and power-pellet counts**
- **📂 Load** — loads the level into the editor (pushes undo)
- **▶ Test** — validates and launches a test game directly from the library
- **🗑 Delete** — removes the entry (with confirmation)

---

## Save / Load Files

| Button | Effect |
|---|---|
| **⬇ Export** | Downloads the current level as a `.json` file |
| **⬆ Import** | Opens a file picker to load a `.json` level file into the editor |
| **↺ Reset** | Resets to the built-in Classic level (with confirmation) |

### JSON Format

```json
{
  "version": 1,
  "name": "My Level",
  "tiles": [[0, 0, ...], ...],
  "playerStart": { "x": 13.5, "y": 26 },
  "enemyStarts": {
    "redEnemy":     { "x": 13.5, "y": 14 },
    "cyanEnemy":    { "x": 12,   "y": 17 },
    "hotpinkEnemy": { "x": 13.5, "y": 17 },
    "orangeEnemy":  { "x": 15,   "y": 17 }
  },
  "fruitSpawn":       { "x": 13, "y": 20 },
  "tunnelRow":        17,
  "tunnelSlowColMax": 5,
  "tunnelSlowColMin": 22,
  "redZoneTiles": [
    { "x": 12, "y": 14 }, { "x": 15, "y": 14 },
    { "x": 12, "y": 26 }, { "x": 15, "y": 26 }
  ],
  "enemyHouseDoor": { "x": 14, "y": 15 },
  "scatterTargets": {
    "redEnemy":     { "x": 26, "y": 0  },
    "cyanEnemy":    { "x": 27, "y": 34 },
    "hotpinkEnemy": { "x": 2,  "y": 0  },
    "orangeEnemy":  { "x": 0,  "y": 34 }
  }
}
```

Unchanged by any of the editor features above. `enemyHouseDoor` is now derived
from the painted ghost-door tiles rather than placed separately, but it is still
written out exactly as before.

---

## Auto-Save

The editor auto-saves to `localStorage` key `editor_autosave` within 500 ms of any change (debounced). This is separate from the library — it is a single scratch-pad slot that restores the last working state on page reload.

Editor settings (tile set, brush size, mirror mode, grid, half-tile drops) live
separately under `editor_prefs`; they follow the person, not the level.

---

## Mobile & Accessibility

- The canvas is resized and offset so the panel never covers the maze: a side
  panel on wide screens, a bottom sheet under ~880 px. The layout re-checks
  itself each frame, which mobile browsers need when the URL bar slides away.
- Tap targets are at least 44 px (48 px on touch devices), inputs are 16 px so
  iOS does not zoom on focus, and the panel scrolls with `touch-action: pan-y`.
- **Hide panel** (`✕`, or `H`) collapses the panel to a floating ✏ button and
  gives the maze the full screen.
- Controls are real buttons with `aria-pressed` / `aria-checked` state, the
  palette is a `radiogroup`, validation output and toasts are `aria-live`
  regions, and focus rings are visible throughout.
- Objects can be placed without a pointer: select one in the list, then nudge it
  with the arrow keys.
- Sections are collapsible `<details>` blocks, so the panel stays short.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `1`–`5` | Pick a tile (wall, empty, dot, power, ghost door) |
| `B` / `E` / `F` | Paint / Erase / Fill |
| `M` | Move objects |
| `R` / `T` | Red zone / Tunnel row |
| `[` / `]` | Brush size down / up |
| `X` | Cycle mirror mode |
| `G` | Toggle grid |
| `H` | Hide / show the panel |
| Arrow keys | Nudge the armed object one tile |
| `Esc` | Drop the armed object |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Escape` (during test) | Return to editor |

---

## Architecture

### Files

| File | Purpose |
|---|---|
| `src/editor/EditorState.ts` | State interface, undo/redo, live usage counts, deep-copy helpers |
| `src/editor/EditorLoop.ts` | rAF loop, canvas input, tool dispatch, panel UI, library modal |
| `src/editor/TileSet.ts` | Placeable kinds, movable objects, tile sets and budgets |
| `src/editor/Mirror.ts` | Mirror modes and the tiles each stroke echoes to |
| `src/editor/EditorPrefs.ts` | Per-person settings (tile set, brush, mirror, grid) |
| `src/editor/Validate.ts` | BFS reachability, budgets and all validation rules |
| `src/editor/LevelLibrary.ts` | localStorage multi-map library (CRUD) |

### Data Flow

```
?editor=true
    ↓
startEditorMode()          ← loads autosave or level1Data
    ↓
editorLoop() [rAF]
    → Draw.level()          ← reads Levels.levelDynamic each frame
    → drawEditorOverlay()   ← grid, spawn markers, tunnel highlight, scatter targets
    ↓
User edits → applyToolDown/Drag → Levels.levelDynamic updated live
    ↓
Save to Library → LevelLibrary.saveLevel()    (localStorage array)
Browse My Maps  → openLibraryModal()          (load / test / delete each entry)
Export          → JSON file download
Import          → JSON file picker → pushUndo → Object.assign(state.level, …)
    ↓
▶ Test Level → validateLevel → startTestGame(level, onReturn)
    → Game runs with custom level (1-player, full game loop)
    → ESC or game-over → onReturn() → editor panel rebuilt, rAF restarted
```

### LevelData Interface (`src/types.ts`)

```typescript
interface LevelData {
    version: number;
    name: string;
    tiles: TileValue[][];           // 36 rows × 28 cols; TileValue = 0|2|3|4|5
    playerStart: { x: number; y: number };
    enemyStarts: {
        redEnemy:     { x: number; y: number };
        cyanEnemy:    { x: number; y: number };
        hotpinkEnemy: { x: number; y: number };
        orangeEnemy:  { x: number; y: number };
    };
    fruitSpawn:       { x: number; y: number };
    tunnelRow:        number;
    tunnelSlowColMax: number;
    tunnelSlowColMin: number;
    redZoneTiles:     { x: number; y: number }[];
    enemyHouseDoor:   { x: number; y: number };
    scatterTargets: {
        redEnemy:     { x: number; y: number };
        cyanEnemy:    { x: number; y: number };
        hotpinkEnemy: { x: number; y: number };
        orangeEnemy:  { x: number; y: number };
    };
}
```

---

## Implementation Status

| Feature | Status |
|---|---|
| Tile sets with per-tile budgets (`-1` = infinite) | ✅ Complete |
| Dots / power / doors / red zones capped to main-map counts | ✅ Complete |
| Spawns and scatter targets as single movable objects | ✅ Complete |
| Drag-to-move, arm-and-place, arrow-key nudging | ✅ Complete |
| Brush sizes and 4-way mirror painting | ✅ Complete |
| Map bounds rectangle and faint grid | ✅ Complete |
| Maze rendered from the level being edited | ✅ Complete |
| Mobile bottom-sheet layout, 44 px+ targets, ARIA state | ✅ Complete |
| Tile paint / erase / flood fill | ✅ Complete |
| Undo / redo (50 steps) | ✅ Complete |
| Grid overlay + brush-footprint hover preview | ✅ Complete |
| Spawn placement (Player, 4 enemies, Fruit) | ✅ Complete |
| Ghost house door as a budgeted tile | ✅ Complete |
| Tunnel row configuration | ✅ Complete |
| Red zone tile toggle | ✅ Complete |
| Scatter target placement (per enemy) | ✅ Complete |
| Level name input | ✅ Complete |
| Validation (BFS + all rules) | ✅ Complete |
| Play-test with ESC-to-return | ✅ Complete |
| Auto-save (debounced 500 ms) | ✅ Complete |
| Auto-restore on page reload | ✅ Complete |
| JSON export (file download) | ✅ Complete |
| JSON import (file picker) | ✅ Complete |
| Reset to built-in level | ✅ Complete |
| Multi-map library (localStorage) | ✅ Complete |
| Library modal (Load / Test / Delete) | ✅ Complete |
| Touch / mobile input | ✅ Complete |
| Keyboard shortcuts (Ctrl+Z/Y) | ✅ Complete |
