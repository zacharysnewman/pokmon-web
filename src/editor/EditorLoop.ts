import { unit, gridW, gridH } from '../constants';
import { gameState } from '../game-state';
import { Levels } from '../static/Levels';
import { Draw } from '../static/Draw';
import { startTestGame } from '../Game';
import type { LevelData, TileValue } from '../types';
import { TILE_EMPTY, TILE_GHOST_DOOR } from '../tiles';
import { validateLevel } from './Validate';
import { saveLevel, listLevels, deleteLevel, formatDate } from './LevelLibrary';
import { loadPrefs, savePrefs } from './EditorPrefs';
import { MIRROR_MODES, mirrorModeDef, mirrorPartners, nextMirrorMode, type MirrorMode } from './Mirror';
import {
    BUDGET_ROWS,
    MARKER_KINDS,
    TILE_KINDS,
    TILE_SETS,
    countUsage,
    formatBudget,
    isInfinite,
    markerAtTile,
    markerById,
    remainingOf,
    tileKindOfValue,
    type BudgetKey,
    type MarkerKindId,
} from './TileSet';
import {
    activeTileSet,
    createEditorState,
    deepCopyLevel,
    pushUndo,
    recountUsage,
    redo,
    undo,
    type EditorState,
    type EditorTool,
} from './EditorState';

// ── Autosave ──────────────────────────────────────────────────────────────────

const AUTOSAVE_KEY = 'editor_autosave';
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutosave(level: LevelData): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        try {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(level));
        } catch {
            // ignore quota errors
        }
    }, 500);
}

function loadAutosave(): LevelData | null {
    try {
        const raw = localStorage.getItem(AUTOSAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as LevelData;
    } catch {
        return null;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tileFromCanvas(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = gameState.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const tx = Math.floor((clientX - rect.left) * scaleX / unit);
    const ty = Math.floor((clientY - rect.top)  * scaleY / unit);
    if (tx < 0 || tx >= gridW || ty < 0 || ty >= gridH) return null;
    return { x: tx, y: ty };
}

/** Point the renderer at the level being edited (walls read levelSetup). */
function syncToRenderer(state: EditorState): void {
    gameState.currentLevel = state.level;
    Levels.levelSetup   = state.level.tiles;
    Levels.levelDynamic = state.level.tiles.map(row => [...row] as TileValue[]);
}

/**
 * Keep the level's `enemyHouseDoor` coordinate pointing at the painted gate.
 * The gate is a tile now, so the coordinate is bookkeeping rather than a
 * separate thing to place.
 */
function syncDoorMarker(level: LevelData): void {
    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            if (level.tiles[y][x] === TILE_GHOST_DOOR) {
                level.enemyHouseDoor = { x, y };
                return;
            }
        }
    }
}

// ── Toast / status ────────────────────────────────────────────────────────────

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(message: string): void {
    if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'ed-toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('ed-toast-show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl?.classList.remove('ed-toast-show'), 2200);
}

// ── Budget-aware tile writing ─────────────────────────────────────────────────

type WriteResult = 'ok' | 'nochange' | 'blocked';

function writeTile(state: EditorState, x: number, y: number, value: TileValue): WriteResult {
    const previous = state.level.tiles[y][x];
    if (previous === value) return 'nochange';

    const kind = tileKindOfValue(value);
    if (remainingOf(activeTileSet(state), state.usage, kind.id) <= 0) return 'blocked';

    state.level.tiles[y][x] = value;
    Levels.levelDynamic[y][x] = value;
    state.usage[tileKindOfValue(previous).id]--;
    state.usage[kind.id]++;
    return 'ok';
}

function budgetToast(state: EditorState, key: BudgetKey): void {
    const tileSet = activeTileSet(state);
    const label = BUDGET_ROWS.find(row => row.key === key)?.label ?? key;
    showToast(
        `No ${label.toLowerCase()} left (${formatBudget(state.usage[key], tileSet.budgets[key])}) ` +
        `— erase some, or pick a roomier tile set`,
    );
}

/** Paint a set of cells, stopping at the tile set's budget. */
function paintCells(state: EditorState, cells: Array<{ x: number; y: number }>, value: TileValue): boolean {
    const kind = tileKindOfValue(value);
    let placed = 0;
    let blocked = 0;
    for (const { x, y } of cells) {
        const result = writeTile(state, x, y, value);
        if (result === 'ok')      placed++;
        if (result === 'blocked') blocked++;
    }
    if (blocked > 0) budgetToast(state, kind.id);
    if (placed > 0) syncDoorMarker(state.level);
    return placed > 0;
}

/** Cells the brush covers, including the mirrored side when mirroring is on. */
function brushCells(state: EditorState, cell: { x: number; y: number }): Array<{ x: number; y: number }> {
    const size = state.prefs.brushSize;
    const start = -Math.floor((size - 1) / 2);
    const cells: Array<{ x: number; y: number }> = [];
    const seen = new Set<string>();

    const add = (x: number, y: number): void => {
        if (x < 0 || x >= gridW || y < 0 || y >= gridH) return;
        const key = `${x},${y}`;
        if (seen.has(key)) return;
        seen.add(key);
        cells.push({ x, y });
    };

    for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
            const x = cell.x + start + dx;
            const y = cell.y + start + dy;
            add(x, y);
            for (const partner of mirrorPartners(state.prefs.mirrorMode, x, y)) {
                add(partner.x, partner.y);
            }
        }
    }
    return cells;
}

// ── Flood Fill (BFS) ──────────────────────────────────────────────────────────

function floodFill(state: EditorState, startX: number, startY: number): boolean {
    const targetValue = state.level.tiles[startY][startX];
    const fillValue: TileValue = state.selectedTool === 'erase'
        ? TILE_EMPTY as TileValue
        : state.selectedTileValue;
    if (targetValue === fillValue) return false;

    const region: Array<{ x: number; y: number }> = [];
    const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const { x, y } = queue.shift()!;
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        if (x < 0 || x >= gridW || y < 0 || y >= gridH) continue;
        if (state.level.tiles[y][x] !== targetValue) continue;
        visited.add(key);
        region.push({ x, y });
        queue.push({ x: x - 1, y }, { x: x + 1, y }, { x, y: y - 1 }, { x, y: y + 1 });
    }

    return paintCells(state, region, fillValue);
}

// ── Tool Application ──────────────────────────────────────────────────────────

let isPainting = false;
let redZoneDragMode: 'add' | 'remove' | null = null;
const redZoneDragSeen = new Set<string>();

/** Snapshot taken at pointer-down, pushed onto the undo stack only if the stroke changes something. */
let pendingUndo: LevelData | null = null;

function beginStroke(state: EditorState): void {
    pendingUndo = deepCopyLevel(state.level);
}

function noteChange(state: EditorState): void {
    if (pendingUndo) {
        state.undoStack.push(pendingUndo);
        state.redoStack = [];
        if (state.undoStack.length > 50) state.undoStack.shift();
        state.isDirty = true;
        pendingUndo = null;
    }
    state.uiDirty = true;
    scheduleAutosave(state.level);
}

/** Where a movable object lands when dropped on a cell. */
function markerDropPos(state: EditorState, cell: { x: number; y: number }): { x: number; y: number } {
    return { x: cell.x + (state.prefs.halfTileX ? 0.5 : 0), y: cell.y };
}

function moveMarker(state: EditorState, id: MarkerKindId, cell: { x: number; y: number }): boolean {
    const marker = markerById(id);
    const next = markerDropPos(state, cell);
    const current = marker.get(state.level);
    if (current.x === next.x && current.y === next.y) return false;
    marker.set(state.level, next);
    return true;
}

function toggleRedZone(state: EditorState, cells: Array<{ x: number; y: number }>, mode: 'add' | 'remove'): boolean {
    const tileSet = activeTileSet(state);
    let changed = false;
    let blocked = false;
    for (const { x, y } of cells) {
        const idx = state.level.redZoneTiles.findIndex(t => t.x === x && t.y === y);
        if (mode === 'remove') {
            if (idx < 0) continue;
            state.level.redZoneTiles.splice(idx, 1);
            state.usage.red_zone--;
            changed = true;
        } else {
            if (idx >= 0) continue;
            if (remainingOf(tileSet, state.usage, 'red_zone') <= 0) { blocked = true; continue; }
            state.level.redZoneTiles.push({ x, y });
            state.usage.red_zone++;
            changed = true;
        }
    }
    if (blocked) budgetToast(state, 'red_zone');
    return changed;
}

function applyToolDown(state: EditorState, cell: { x: number; y: number }): boolean {
    const { x, y } = cell;
    switch (state.selectedTool) {
        case 'paint':
            return paintCells(state, brushCells(state, cell), state.selectedTileValue);
        case 'erase':
            return paintCells(state, brushCells(state, cell), TILE_EMPTY as TileValue);
        case 'fill':
            return floodFill(state, x, y);
        case 'move': {
            const grabbed = markerAtTile(state.level, x, y);
            if (grabbed) {
                // Pick it up where it stands — dragging moves it from here.
                state.draggingMarker = grabbed.id;
                state.armedMarker = grabbed.id;
                state.uiDirty = true;
                return false;
            }
            if (state.armedMarker) {
                state.draggingMarker = state.armedMarker;
                return moveMarker(state, state.armedMarker, cell);
            }
            showToast('Pick an object in the Objects list, then tap the maze to place it');
            return false;
        }
        case 'tunnel_config': {
            if (state.level.tunnelRow === y) return false;
            state.level.tunnelRow = y;
            return true;
        }
        case 'red_zone': {
            const exists = state.level.redZoneTiles.some(t => t.x === x && t.y === y);
            redZoneDragMode = exists ? 'remove' : 'add';
            const cells = [cell, ...mirrorPartners(state.prefs.mirrorMode, x, y)];
            for (const c of cells) redZoneDragSeen.add(`${c.x},${c.y}`);
            return toggleRedZone(state, cells, redZoneDragMode);
        }
    }
}

function applyToolDrag(state: EditorState, cell: { x: number; y: number }): boolean {
    const { x, y } = cell;
    switch (state.selectedTool) {
        case 'paint':
            return paintCells(state, brushCells(state, cell), state.selectedTileValue);
        case 'erase':
            return paintCells(state, brushCells(state, cell), TILE_EMPTY as TileValue);
        case 'move':
            return state.draggingMarker ? moveMarker(state, state.draggingMarker, cell) : false;
        case 'tunnel_config': {
            if (state.level.tunnelRow === y) return false;
            state.level.tunnelRow = y;
            return true;
        }
        case 'red_zone': {
            if (!redZoneDragMode) return false;
            const cells = [cell, ...mirrorPartners(state.prefs.mirrorMode, x, y)]
                .filter(c => !redZoneDragSeen.has(`${c.x},${c.y}`));
            if (cells.length === 0) return false;
            for (const c of cells) redZoneDragSeen.add(`${c.x},${c.y}`);
            return toggleRedZone(state, cells, redZoneDragMode);
        }
        case 'fill':
            return false;
    }
}

// ── Overlay Rendering ─────────────────────────────────────────────────────────

function drawSpawnMarker(
    ctx: CanvasRenderingContext2D,
    pos: { x: number; y: number },
    color: string,
    label: string,
    highlight: boolean,
): void {
    const px = (pos.x + 0.5) * unit;
    const py = (pos.y + 0.5) * unit;
    const r  = unit * 0.38;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color + '55';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (highlight) {
        ctx.beginPath();
        ctx.arc(px, py, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(unit * 0.38)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, py);
    ctx.restore();
}

function drawCrossMarker(
    ctx: CanvasRenderingContext2D,
    pos: { x: number; y: number },
    color: string,
    highlight: boolean,
): void {
    const px = (pos.x + 0.5) * unit;
    const py = (pos.y + 0.5) * unit;
    const r = unit * 0.35;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r);
    ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
    ctx.stroke();
    if (highlight) {
        ctx.strokeStyle = 'white';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(px - r - 3, py - r - 3, (r + 3) * 2, (r + 3) * 2);
        ctx.setLineDash([]);
    }
    ctx.restore();
}

/** Small triangle pointing off the edge of the maze. */
function drawWrapArrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, dir: -1 | 1): void {
    const r = unit * 0.26;
    ctx.beginPath();
    ctx.moveTo(cx + dir * r, cy);
    ctx.lineTo(cx - dir * r * 0.7, cy - r * 0.8);
    ctx.lineTo(cx - dir * r * 0.7, cy + r * 0.8);
    ctx.closePath();
    ctx.fill();
}

/**
 * The tunnel row only does two things: walking off either end wraps you to the
 * other side, and enemies crawl through the end columns. Draw those, rather
 * than tinting the whole row as though every tile in it were special.
 */
function drawTunnelOverlay(ctx: CanvasRenderingContext2D, state: EditorState): void {
    const lv = state.level;
    const row = lv.tunnelRow;
    if (row < 0 || row >= gridH) return;

    const top = row * unit;
    const width = gridW * unit;
    const midY = top + unit / 2;

    ctx.save();

    // While the tunnel tool is active, show the whole row — that is what a
    // click is about to change.
    if (state.selectedTool === 'tunnel_config') {
        ctx.fillStyle = 'rgba(0,200,255,0.10)';
        ctx.fillRect(0, top, width, unit);
    }

    // Columns where enemies slow down
    const slowMax = Math.min(gridW - 1, lv.tunnelSlowColMax);
    const slowMin = Math.max(0, lv.tunnelSlowColMin);
    ctx.fillStyle = 'rgba(255,176,64,0.13)';
    if (slowMax >= 0)    ctx.fillRect(0, top, (slowMax + 1) * unit, unit);
    if (slowMin < gridW) ctx.fillRect(slowMin * unit, top, (gridW - slowMin) * unit, unit);

    // The row itself, as a dashed centre line
    ctx.strokeStyle = 'rgba(0,216,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // The wrap points: the only two tiles that teleport
    ctx.strokeStyle = '#00d8ff';
    ctx.fillStyle   = '#00d8ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, top + 1, unit - 2, unit - 2);
    ctx.strokeRect((gridW - 1) * unit + 1, top + 1, unit - 2, unit - 2);
    drawWrapArrow(ctx, unit * 0.5, midY, -1);
    drawWrapArrow(ctx, width - unit * 0.5, midY, 1);

    ctx.restore();
}

function drawEditorOverlay(state: EditorState, ctx: CanvasRenderingContext2D): void {
    const lv = state.level;

    drawTunnelOverlay(ctx, state);

    // Red zone tile markers
    ctx.save();
    ctx.fillStyle = 'rgba(255,0,0,0.28)';
    for (const t of lv.redZoneTiles) {
        ctx.fillRect(t.x * unit, t.y * unit, unit, unit);
    }
    ctx.restore();

    // Ghost door tiles
    ctx.save();
    ctx.strokeStyle = 'rgba(255,180,255,0.9)';
    ctx.lineWidth = 2;
    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            if (lv.tiles[y][x] === TILE_GHOST_DOOR) {
                ctx.strokeRect(x * unit + 1, y * unit + 1, unit - 2, unit - 2);
            }
        }
    }
    ctx.restore();

    // Mirror guides
    if (state.prefs.mirrorMode !== 'off') {
        const w = gridW * unit;
        const h = gridH * unit;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,0,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        const mode = state.prefs.mirrorMode;
        if (mode === 'horizontal' || mode === 'quad') {
            ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
        }
        if (mode === 'vertical' || mode === 'quad') {
            ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
        }
        if (mode === 'diagonal') {
            ctx.moveTo(0, 0); ctx.lineTo(w, h);
            ctx.moveTo(w, 0); ctx.lineTo(0, h);
        }
        ctx.stroke();
        ctx.restore();
    }

    // Grid lines — kept faint so they read as guides, not maze content
    if (state.prefs.showGrid) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let x = 1; x < gridW; x++) {
            ctx.moveTo(x * unit, 0);
            ctx.lineTo(x * unit, gridH * unit);
        }
        for (let y = 1; y < gridH; y++) {
            ctx.moveTo(0, y * unit);
            ctx.lineTo(gridW * unit, y * unit);
        }
        ctx.stroke();
        ctx.restore();
    }

    // Map bounds — everything paintable lives inside this rectangle
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, gridW * unit - 2, gridH * unit - 2);
    ctx.restore();

    // Movable objects — scatter targets first so spawns draw on top
    for (const marker of MARKER_KINDS) {
        const highlight = state.armedMarker === marker.id;
        const pos = marker.get(lv);
        if (marker.group === 'scatter') drawCrossMarker(ctx, pos, marker.color, highlight);
    }
    for (const marker of MARKER_KINDS) {
        const highlight = state.armedMarker === marker.id;
        const pos = marker.get(lv);
        if (marker.group === 'spawn') drawSpawnMarker(ctx, pos, marker.color, marker.badge, highlight);
    }

    // Hover preview — the brush footprint, or the tile under the cursor
    if (state.hoveredCell) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        const cells = (state.selectedTool === 'paint' || state.selectedTool === 'erase')
            ? brushCells(state, state.hoveredCell)
            : [state.hoveredCell];
        for (const { x, y } of cells) {
            ctx.fillRect(x * unit, y * unit, unit, unit);
        }
        ctx.restore();
    }
}

// ── rAF Loop ──────────────────────────────────────────────────────────────────

function editorLoop(state: EditorState): void {
    layoutCanvasIfNeeded();
    Draw.level();
    drawEditorOverlay(state, gameState.ctx);

    if (state.uiDirty) {
        refreshReadouts(state);
        state.uiDirty = false;
    }
    updateHoverInfo(state);

    requestAnimationFrame(() => editorLoop(state));
}

// ── Save / Load ───────────────────────────────────────────────────────────────

function exportLevelJSON(level: LevelData): void {
    const name = level.name.trim() || 'level';
    const json = JSON.stringify(level, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9_\-]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importLevelJSON(onLoad: (level: LevelData) => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result as string) as LevelData;
                onLoad(data);
            } catch {
                alert('Invalid level JSON file.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ── Layout: keep the maze clear of the panel ──────────────────────────────────

const PANEL_WIDTH = 260;
let panelOpen = true;

function isNarrowViewport(): boolean {
    return window.innerWidth < 880;
}

let lastLayoutKey = '';

/** Size and offset the canvas so the panel never covers the maze. */
function layoutCanvas(): void {
    const canvas = gameState.canvas;
    if (!canvas) return;
    lastLayoutKey = `${window.innerWidth}x${window.innerHeight}:${panelOpen}`;
    const narrow = isNarrowViewport();
    const reserveX = panelOpen && !narrow ? PANEL_WIDTH + 24 : 0;
    const reserveY = panelOpen && narrow  ? Math.round(window.innerHeight * 0.45) : 0;
    const availW = Math.max(160, window.innerWidth  - reserveX);
    const availH = Math.max(160, window.innerHeight - reserveY);
    const scale = Math.min(availW / 560, availH / 720);
    canvas.style.width        = `${560 * scale}px`;
    canvas.style.height       = `${720 * scale}px`;
    canvas.style.marginRight  = `${reserveX}px`;
    canvas.style.marginBottom = `${reserveY}px`;
}

/**
 * Re-run the layout when the viewport changed. Called every frame because
 * mobile browsers do not reliably fire `resize` when the URL bar slides away
 * or the viewport settles after load.
 */
function layoutCanvasIfNeeded(): void {
    if (`${window.innerWidth}x${window.innerHeight}:${panelOpen}` === lastLayoutKey) return;
    layoutCanvas();
}

function setPanelOpen(open: boolean): void {
    panelOpen = open;
    document.getElementById('editor-panel')?.classList.toggle('ed-collapsed', !open);
    const toggle = document.getElementById('ed-toggle');
    if (toggle) {
        // Only floats over the maze while the panel is away; the panel has its
        // own close button when it is open.
        toggle.hidden = open;
        toggle.setAttribute('aria-expanded', String(open));
    }
    layoutCanvas();
}

// ── Library Modal ─────────────────────────────────────────────────────────────

function openLibraryModal(
    state: EditorState,
    nameInput: HTMLInputElement,
    onLoaded: (id: string) => void,
): void {
    document.getElementById('ed-library-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ed-library-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'My maps');
    overlay.innerHTML = `
    <style>
    #ed-library-modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.85);
        z-index: 200; display: flex; align-items: center; justify-content: center;
        font-family: monospace; padding: 12px;
    }
    #ed-lib-box {
        background: #111; border: 2px solid #666; border-radius: 12px;
        padding: 18px; width: 100%; max-width: 460px;
        max-height: 86vh; display: flex; flex-direction: column; gap: 12px;
        color: #eee;
    }
    #ed-lib-box h3 { color: #ff0; margin: 0; font-size: 20px; }
    #ed-lib-list { overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 10px; }
    .ed-lib-entry {
        background: #1a1a1a; border: 1px solid #333; border-radius: 8px;
        padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;
    }
    .ed-lib-entry-name { font-size: 16px; color: #ff0; font-weight: bold; }
    .ed-lib-entry-meta { font-size: 12px; color: #999; }
    .ed-lib-entry-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .ed-lib-entry-actions button {
        flex: 1 1 90px; min-height: 44px; background: #222; color: #eee;
        border: 1px solid #555; border-radius: 6px; padding: 6px 8px; cursor: pointer;
        font-family: monospace; font-size: 14px;
    }
    #ed-library-modal button:focus-visible, #ed-library-modal :focus-visible {
        outline: 3px solid #ff0; outline-offset: 2px;
    }
    .ed-lib-btn-load  { color: #9f9 !important; border-color: #4a4 !important; }
    .ed-lib-btn-test  { color: #9bf !important; border-color: #46a !important; }
    .ed-lib-btn-del   { color: #f88 !important; border-color: #a33 !important; }
    #ed-lib-empty { color: #888; font-size: 14px; text-align: center; padding: 20px 0; }
    #ed-lib-close {
        background: #222; color: #eee; border: 1px solid #666;
        border-radius: 6px; padding: 10px 16px; cursor: pointer; min-height: 48px;
        font-family: monospace; font-size: 16px; align-self: stretch;
    }
    </style>
    <div id="ed-lib-box">
        <h3>📂 My Maps</h3>
        <div id="ed-lib-list"></div>
        <button id="ed-lib-close">✕ Close</button>
    </div>`;
    document.body.appendChild(overlay);

    // Prevent canvas events
    overlay.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    overlay.addEventListener('touchend',   e => e.stopPropagation(), { passive: true });
    overlay.addEventListener('click',      e => e.stopPropagation());
    overlay.addEventListener('mousedown',  e => e.stopPropagation());

    function closeModal(): void { overlay.remove(); }
    const closeBtn = document.getElementById('ed-lib-close')!;
    closeBtn.onclick = closeModal;
    closeBtn.focus();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    function refreshList(): void {
        const listEl = document.getElementById('ed-lib-list')!;
        const entries = listLevels();
        if (entries.length === 0) {
            listEl.innerHTML = '<div id="ed-lib-empty">No saved maps yet.<br>Use "Save to Library" to add one.</div>';
            return;
        }
        listEl.innerHTML = '';
        for (const entry of [...entries].reverse()) {
            const counts = countUsage(entry.level);
            const div = document.createElement('div');
            div.className = 'ed-lib-entry';
            div.innerHTML = `
                <div class="ed-lib-entry-name"></div>
                <div class="ed-lib-entry-meta"></div>
                <div class="ed-lib-entry-actions">
                    <button class="ed-lib-btn-load">📂 Load</button>
                    <button class="ed-lib-btn-test">▶ Test</button>
                    <button class="ed-lib-btn-del">🗑 Delete</button>
                </div>`;
            div.querySelector('.ed-lib-entry-name')!.textContent = entry.level.name || '(Untitled)';
            div.querySelector('.ed-lib-entry-meta')!.textContent =
                `${formatDate(entry.savedAt)} · ${counts.dot} dots · ${counts.power} power`;

            const btns = div.querySelectorAll('button');
            const loadBtn = btns[0] as HTMLButtonElement;
            const testBtn = btns[1] as HTMLButtonElement;
            const delBtn  = btns[2] as HTMLButtonElement;

            loadBtn.addEventListener('click', () => {
                pushUndo(state);
                const loaded = deepCopyLevel(entry.level);
                Object.assign(state.level, loaded);
                state.libraryId = entry.id;
                if (entry.tileSetId) state.prefs.tileSetId = entry.tileSetId;
                nameInput.value = state.level.name;
                recountUsage(state);
                syncToRenderer(state);
                scheduleAutosave(state.level);
                savePrefs(state.prefs);
                onLoaded(entry.id);
                closeModal();
            });

            testBtn.addEventListener('click', () => {
                const result = validateLevel(entry.level, activeTileSet(state));
                if (!result.valid) {
                    alert('Level has errors:\n' + result.errors.map(e => `• ${e}`).join('\n'));
                    return;
                }
                closeModal();
                runTestGame(state, deepCopyLevel(entry.level));
            });

            delBtn.addEventListener('click', () => {
                if (!confirm(`Delete "${entry.level.name || 'Untitled'}"?`)) return;
                deleteLevel(entry.id);
                if (state.libraryId === entry.id) state.libraryId = null;
                refreshList();
            });

            listEl.appendChild(div);
        }
    }
    refreshList();
}

// ── Play-test ─────────────────────────────────────────────────────────────────

function runTestGame(state: EditorState, level: LevelData): void {
    const panel = document.getElementById('editor-panel');
    const toggle = document.getElementById('ed-toggle');
    panel?.remove();
    toggle?.remove();
    const wasOpen = panelOpen;
    panelOpen = false;
    layoutCanvas();

    startTestGame(level, () => {
        if (panel) {
            document.body.appendChild(panel);
            buildPanel(state, panel);
        }
        if (toggle) document.body.appendChild(toggle);
        setPanelOpen(wasOpen);
        syncToRenderer(state);
        requestAnimationFrame(() => editorLoop(state));
    });
}

// ── Panel UI ──────────────────────────────────────────────────────────────────

const TOOL_BUTTONS: Array<{ tool: EditorTool; id: string }> = [
    { tool: 'paint',         id: 'ed-tool-paint'   },
    { tool: 'erase',         id: 'ed-tool-erase'   },
    { tool: 'fill',          id: 'ed-tool-fill'    },
    { tool: 'move',          id: 'ed-tool-move'    },
    { tool: 'red_zone',      id: 'ed-tool-redzone' },
    { tool: 'tunnel_config', id: 'ed-tool-tunnel'  },
];

const PANEL_CSS = `
#editor-panel, #ed-toggle, #ed-toast { font-family: monospace; }
#editor-panel {
    position: fixed; top: 8px; right: 8px; width: ${PANEL_WIDTH}px;
    background: rgba(0,0,0,0.94); color: #eee;
    padding: 12px; border: 2px solid #666; border-radius: 10px;
    z-index: 100; font-size: 15px;
    display: flex; flex-direction: column; gap: 10px;
    max-height: calc(100vh - 16px); overflow-y: auto;
    touch-action: pan-y; overscroll-behavior: contain;
}
#editor-panel.ed-collapsed { display: none; }
#editor-panel h2 { font-size: 18px; color: #ff0; margin: 0; }
#editor-panel .ed-head { display: flex; align-items: center; gap: 8px; }
#editor-panel .ed-head #ed-info { flex: 1; text-align: right; overflow: hidden; white-space: nowrap; }
#editor-panel .ed-icon-btn { min-width: 44px; justify-content: center; padding: 4px; font-size: 16px; }
#editor-panel .ed-sec { border: 1px solid #333; border-radius: 8px; padding: 0 8px 8px; }
#editor-panel .ed-sec > summary {
    cursor: pointer; list-style: none; padding: 10px 2px; min-height: 24px;
    font-size: 12px; color: #bbb; text-transform: uppercase; letter-spacing: 1px;
}
#editor-panel .ed-sec > summary::-webkit-details-marker { display: none; }
#editor-panel .ed-sec > summary::before { content: '▸ '; color: #777; }
#editor-panel .ed-sec[open] > summary::before { content: '▾ '; }
#editor-panel .ed-sec[open] > summary { border-bottom: 1px solid #333; margin-bottom: 8px; }
#editor-panel .ed-stack { display: flex; flex-direction: column; gap: 6px; }
#editor-panel .ed-label-sm { font-size: 12px; color: #999; margin-top: 4px; }
#editor-panel #ed-mirror-modes button { flex: 1 1 60px; min-width: 60px; padding: 6px 4px; font-size: 13px; }
#editor-panel .ed-row { display: flex; gap: 6px; flex-wrap: wrap; }
#editor-panel .ed-row > * { flex: 1 1 0; min-width: 64px; }
#editor-panel button {
    background: #222; color: #eee; border: 1px solid #666;
    border-radius: 6px; padding: 8px; cursor: pointer; min-height: 44px;
    font-family: monospace; font-size: 14px; text-align: left;
    touch-action: manipulation; display: flex; align-items: center; gap: 8px;
}
#editor-panel .ed-row button { justify-content: center; text-align: center; }
#editor-panel button[aria-pressed="true"], #editor-panel [role="radio"][aria-checked="true"] {
    background: #3a3a12; border-color: #ff0; color: #ff0;
}
#editor-panel button:hover { border-color: #999; }
#editor-panel :focus-visible { outline: 3px solid #ff0; outline-offset: 2px; }
#editor-panel .ed-count { margin-left: auto; font-size: 12px; color: #9a9a9a; }
#editor-panel button[aria-pressed="true"] .ed-count,
#editor-panel [aria-checked="true"] .ed-count { color: #ffd; }
#editor-panel .ed-count.ed-full { color: #ffcc44; }
#editor-panel .ed-count.ed-over { color: #ff6666; }
#editor-panel .ed-swatch-box {
    width: 22px; height: 22px; border-radius: 3px; border: 1px solid #777; flex-shrink: 0;
}
#editor-panel .ed-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; }
#editor-panel label {
    display: flex; align-items: center; gap: 10px; cursor: pointer;
    font-size: 14px; min-height: 44px;
}
#editor-panel input[type=checkbox] { width: 22px; height: 22px; cursor: pointer; accent-color: #ff0; flex-shrink: 0; }
#editor-panel input[type=text], #editor-panel select {
    background: #111; color: #ff0; border: 1px solid #666;
    border-radius: 6px; padding: 10px 8px; font-family: monospace;
    font-size: 16px; width: 100%; box-sizing: border-box; min-height: 44px;
}
#editor-panel .ed-desc { font-size: 12px; color: #999; margin: 6px 0 0; line-height: 1.4; }
#editor-panel .ed-budgets { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
#editor-panel .ed-budget { font-size: 12px; color: #ccc; }
#editor-panel .ed-budget-top { display: flex; justify-content: space-between; gap: 8px; }
#editor-panel .ed-bar { height: 5px; background: #222; border-radius: 3px; margin-top: 3px; overflow: hidden; }
#editor-panel .ed-bar > span { display: block; height: 100%; background: #4a8; width: 0; }
#editor-panel .ed-budget.ed-full .ed-bar > span { background: #ffcc44; }
#editor-panel .ed-budget.ed-over .ed-bar > span { background: #ff6666; }
#ed-validate-result { font-size: 12px; max-height: 140px; overflow-y: auto; line-height: 1.45; }
#ed-validate-result .ed-error   { color: #ff8080; }
#ed-validate-result .ed-warning { color: #ffcc44; }
#ed-validate-result .ed-ok      { color: #7f7; }
#ed-test-btn { background: #063; color: #cfc; border-color: #4a4; font-weight: bold; justify-content: center; }
#ed-info { font-size: 12px; color: #999; min-height: 1.2em; }
#editor-panel .ed-keys { font-size: 12px; color: #aaa; line-height: 1.7; margin: 0; padding-left: 0; list-style: none; }
#editor-panel .ed-keys kbd {
    background: #222; border: 1px solid #555; border-radius: 3px;
    padding: 1px 5px; color: #ff0; font-family: monospace;
}
#ed-toggle {
    position: fixed; right: 12px; bottom: 12px; z-index: 101;
    width: 52px; height: 52px; border-radius: 10px;
    background: rgba(0,0,0,0.9); color: #ff0; border: 2px solid #666;
    font-size: 22px; cursor: pointer; touch-action: manipulation;
}
#ed-toggle:focus-visible { outline: 3px solid #ff0; outline-offset: 2px; }
#ed-toast {
    position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%);
    background: rgba(20,20,20,0.96); color: #ffd; border: 1px solid #888;
    border-radius: 8px; padding: 12px 16px; font-size: 14px; max-width: 90vw;
    text-align: center; z-index: 300; opacity: 0; pointer-events: none;
    transition: opacity 0.18s ease;
}
#ed-toast.ed-toast-show { opacity: 1; }
@media (max-width: 879px) {
    #editor-panel {
        top: auto; right: 0; left: 0; bottom: 0; width: auto;
        max-height: 45vh; border-radius: 12px 12px 0 0; border-width: 2px 0 0;
        padding-bottom: max(12px, env(safe-area-inset-bottom));
    }
    #editor-panel .ed-sec { padding-bottom: 10px; }
    #editor-panel #ed-palette { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
    #editor-panel #ed-markers { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
    #editor-panel #ed-markers button { font-size: 13px; padding: 6px; }
    #editor-panel #ed-markers .ed-count { font-size: 11px; }
}
@media (pointer: coarse) {
    #editor-panel button, #editor-panel label,
    #editor-panel input[type=text], #editor-panel select { min-height: 48px; }
}
@media (prefers-reduced-motion: reduce) {
    #ed-toast { transition: none; }
}
`;

interface PanelRefs {
    name: HTMLInputElement;
    tileSetSelect: HTMLSelectElement;
    tileSetDesc: HTMLElement;
    budgets: HTMLElement;
    palette: HTMLElement;
    markers: HTMLElement;
    info: HTMLElement;
    validateResult: HTMLElement;
    libCount: HTMLButtonElement;
    undo: HTMLButtonElement;
    redo: HTMLButtonElement;
}

let ui: PanelRefs | null = null;

function el<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function buildPanel(state: EditorState, panelEl?: HTMLElement): HTMLElement {
    const panel = panelEl ?? document.createElement('div');
    panel.id = 'editor-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Level editor tools');
    panel.innerHTML = `
        <style>${PANEL_CSS}</style>

        <div class="ed-head">
            <h2>✏ Editor</h2>
            <div id="ed-info" role="status" aria-live="off"></div>
            <button id="ed-hide" class="ed-icon-btn" aria-label="Hide editor tools" title="Hide panel (H)">✕</button>
        </div>

        <div class="ed-stack">
            <label for="ed-name">Level name</label>
            <input type="text" id="ed-name" maxlength="32" placeholder="Level name…">
        </div>

        <details class="ed-sec" open>
            <summary>Tile set</summary>
            <select id="ed-tileset" aria-label="Tile set"></select>
            <p class="ed-desc" id="ed-tileset-desc"></p>
            <ul class="ed-budgets" id="ed-budgets" aria-label="Tile budgets"></ul>
        </details>

        <details class="ed-sec" open>
            <summary>Tiles</summary>
            <div class="ed-stack" id="ed-palette" role="radiogroup" aria-label="Tile type"></div>
        </details>

        <details class="ed-sec" open>
            <summary>Brush</summary>
            <div class="ed-row" role="group" aria-label="Tool">
                <button id="ed-tool-paint" aria-pressed="false" title="Paint the selected tile (B)">✏ Paint</button>
                <button id="ed-tool-erase" aria-pressed="false" title="Set tiles back to empty (E)">◻ Erase</button>
                <button id="ed-tool-fill"  aria-pressed="false" title="Flood-fill matching tiles (F)">⬛ Fill</button>
            </div>
            <div class="ed-row" role="group" aria-label="Brush size" id="ed-brush-sizes"></div>
            <div class="ed-label-sm" id="ed-mirror-label">Mirror painting</div>
            <div class="ed-row" role="radiogroup" aria-labelledby="ed-mirror-label" id="ed-mirror-modes"></div>
        </details>

        <details class="ed-sec" open>
            <summary>Objects — one of each</summary>
            <button id="ed-tool-move" aria-pressed="false" title="Drag any object on the maze (M)">✥ Move objects</button>
            <div class="ed-stack" id="ed-markers" role="group" aria-label="Movable objects"></div>
            <label><input type="checkbox" id="ed-half"> Drop on half-tile (x.5)</label>
        </details>

        <details class="ed-sec">
            <summary>Zones</summary>
            <div class="ed-stack">
                <button id="ed-tool-redzone" aria-pressed="false" title="Toggle no-turn-up junction tiles (R)">
                    ⊕ Red zone<span class="ed-count" id="ed-rz-count"></span>
                </button>
                <button id="ed-tool-tunnel" aria-pressed="false" title="Click a row to make it the warp tunnel (T)">
                    ~ Tunnel row<span class="ed-count" id="ed-tunnel-row"></span>
                </button>
                <p class="ed-desc" id="ed-tunnel-desc"></p>
            </div>
        </details>

        <details class="ed-sec" open>
            <summary>View &amp; history</summary>
            <label><input type="checkbox" id="ed-grid"> Show grid</label>
            <div class="ed-row">
                <button id="ed-undo" title="Undo (Ctrl+Z)">↩ Undo</button>
                <button id="ed-redo" title="Redo (Ctrl+Y)">↪ Redo</button>
            </div>
        </details>

        <div class="ed-stack">
            <button id="ed-validate">✔ Validate</button>
            <div id="ed-validate-result" role="status" aria-live="polite"></div>
            <button id="ed-test-btn">▶ Test level</button>
        </div>

        <details class="ed-sec" open>
            <summary>Library</summary>
            <div class="ed-stack">
                <button id="ed-save-lib">💾 Save to library</button>
                <button id="ed-open-lib">📂 My maps</button>
            </div>
        </details>

        <details class="ed-sec">
            <summary>File</summary>
            <div class="ed-stack">
                <div class="ed-row">
                    <button id="ed-export">⬇ Export</button>
                    <button id="ed-import">⬆ Import</button>
                </div>
                <button id="ed-reset">↺ Reset to Classic</button>
            </div>
        </details>

        <details class="ed-sec">
            <summary>Keyboard shortcuts</summary>
            <ul class="ed-keys">
                <li><kbd>1</kbd>–<kbd>5</kbd> pick a tile</li>
                <li><kbd>B</kbd> paint · <kbd>E</kbd> erase · <kbd>F</kbd> fill</li>
                <li><kbd>M</kbd> move objects · arrows nudge</li>
                <li><kbd>R</kbd> red zone · <kbd>T</kbd> tunnel row</li>
                <li><kbd>[</kbd> <kbd>]</kbd> brush size · <kbd>X</kbd> cycle mirror</li>
                <li><kbd>G</kbd> grid · <kbd>H</kbd> hide panel</li>
                <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo · <kbd>Ctrl</kbd>+<kbd>Y</kbd> redo</li>
                <li><kbd>Esc</kbd> drop the held object</li>
            </ul>
        </details>
    `;
    if (!panelEl) document.body.appendChild(panel);

    // Stop panel input from reaching the canvas handlers
    panel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    panel.addEventListener('touchend',   (e) => e.stopPropagation(), { passive: true });
    panel.addEventListener('click',      (e) => e.stopPropagation());
    panel.addEventListener('mousedown',  (e) => e.stopPropagation());
    panel.addEventListener('mouseup',    (e) => e.stopPropagation());

    ui = {
        name:           el<HTMLInputElement>('ed-name'),
        tileSetSelect:  el<HTMLSelectElement>('ed-tileset'),
        tileSetDesc:    el('ed-tileset-desc'),
        budgets:        el('ed-budgets'),
        palette:        el('ed-palette'),
        markers:        el('ed-markers'),
        info:           el('ed-info'),
        validateResult: el('ed-validate-result'),
        libCount:       el<HTMLButtonElement>('ed-open-lib'),
        undo:           el<HTMLButtonElement>('ed-undo'),
        redo:           el<HTMLButtonElement>('ed-redo'),
    };

    // Level name
    ui.name.value = state.level.name;
    ui.name.oninput = () => {
        state.level.name = ui!.name.value;
        scheduleAutosave(state.level);
    };

    // Tile set selector
    for (const set of TILE_SETS) {
        const option = document.createElement('option');
        option.value = set.id;
        option.textContent = set.name;
        ui.tileSetSelect.appendChild(option);
    }
    ui.tileSetSelect.value = activeTileSet(state).id;
    ui.tileSetSelect.onchange = () => {
        state.prefs.tileSetId = ui!.tileSetSelect.value;
        savePrefs(state.prefs);
        state.uiDirty = true;
    };

    // Budget readout rows
    for (const row of BUDGET_ROWS) {
        const li = document.createElement('li');
        li.className = 'ed-budget';
        li.dataset.key = row.key;
        li.innerHTML = `
            <div class="ed-budget-top"><span>${row.label}</span><span class="ed-budget-val"></span></div>
            <div class="ed-bar" aria-hidden="true"><span></span></div>`;
        ui.budgets.appendChild(li);
    }

    // Tile palette
    for (const kind of TILE_KINDS) {
        const button = document.createElement('button');
        button.id = `ed-tile-${kind.id}`;
        button.type = 'button';
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', 'false');
        button.title = `${kind.hint} (${kind.key})`;
        button.innerHTML = `
            <span class="ed-swatch-box" style="background:${kind.swatch}"></span>
            <span>${kind.label}</span>
            <span class="ed-count" data-budget="${kind.id}"></span>`;
        button.onclick = () => selectTile(state, kind.value);
        ui.palette.appendChild(button);
    }

    // Brush sizes
    const brushRow = el('ed-brush-sizes');
    for (const size of [1, 2, 3]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.brush = String(size);
        button.textContent = `${size}×${size}`;
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', `Brush size ${size} by ${size}`);
        button.onclick = () => {
            state.prefs.brushSize = size;
            savePrefs(state.prefs);
            state.uiDirty = true;
        };
        brushRow.appendChild(button);
    }

    // Tool buttons
    for (const { tool, id } of TOOL_BUTTONS) {
        const button = el<HTMLButtonElement>(id);
        button.onclick = () => selectTool(state, tool);
    }

    // Movable objects
    for (const marker of MARKER_KINDS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `ed-marker-${marker.id}`;
        button.title = marker.hint;
        button.setAttribute('aria-pressed', 'false');
        button.innerHTML = `
            <span class="ed-dot" style="background:${marker.color}"></span>
            <span>${marker.label}</span>
            <span class="ed-count" data-marker="${marker.id}"></span>`;
        button.onclick = () => {
            state.armedMarker = state.armedMarker === marker.id ? null : marker.id;
            if (state.armedMarker) state.selectedTool = 'move';
            state.uiDirty = true;
        };
        ui.markers.appendChild(button);
    }

    el<HTMLButtonElement>('ed-hide').onclick = () => setPanelOpen(false);

    // Mirror modes
    const mirrorRow = el('ed-mirror-modes');
    for (const mode of MIRROR_MODES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = `ed-mirror-${mode.id}`;
        button.dataset.mirror = mode.id;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', 'false');
        button.setAttribute('aria-label', `Mirror: ${mode.hint}`);
        button.title = mode.hint;
        button.textContent = `${mode.symbol} ${mode.label}`;
        button.onclick = () => setMirrorMode(state, mode.id);
        mirrorRow.appendChild(button);
    }

    const half = el<HTMLInputElement>('ed-half');
    half.checked = state.prefs.halfTileX;
    half.onchange = () => {
        state.prefs.halfTileX = half.checked;
        savePrefs(state.prefs);
    };

    const grid = el<HTMLInputElement>('ed-grid');
    grid.checked = state.prefs.showGrid;
    grid.onchange = () => {
        state.prefs.showGrid = grid.checked;
        savePrefs(state.prefs);
    };

    // Undo / redo
    ui.undo.onclick = () => { if (undo(state)) syncToRenderer(state); };
    ui.redo.onclick = () => { if (redo(state)) syncToRenderer(state); };

    // Validate
    el<HTMLButtonElement>('ed-validate').onclick = () => runValidation(state);

    // Test level
    el<HTMLButtonElement>('ed-test-btn').onclick = () => {
        const result = runValidation(state);
        if (!result.valid) {
            showToast('Fix the errors listed in the panel before testing');
            return;
        }
        // Persist so the editor session survives the test
        try {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(state.level));
        } catch {
            // ignore quota errors
        }
        runTestGame(state, deepCopyLevel(state.level));
    };

    // Export / import / reset
    el<HTMLButtonElement>('ed-export').onclick = () => exportLevelJSON(state.level);
    el<HTMLButtonElement>('ed-import').onclick = () => {
        importLevelJSON((imported) => {
            pushUndo(state);
            Object.assign(state.level, imported);
            syncToRenderer(state);
            recountUsage(state);
            ui!.name.value = state.level.name;
            scheduleAutosave(state.level);
            runValidation(state);
        });
    };
    el<HTMLButtonElement>('ed-reset').onclick = () => {
        if (!confirm('Reset to the Classic level? Unsaved changes will be lost.')) return;
        pushUndo(state);
        Object.assign(state.level, deepCopyLevel(Levels.level1Data));
        ui!.name.value = state.level.name;
        state.libraryId = null;
        syncToRenderer(state);
        recountUsage(state);
        localStorage.removeItem(AUTOSAVE_KEY);
    };

    // Library
    const saveLibBtn = el<HTMLButtonElement>('ed-save-lib');
    saveLibBtn.onclick = () => {
        const trimmed = ui!.name.value.trim();
        if (!trimmed) {
            showToast('Give the level a name before saving it to the library');
            ui!.name.focus();
            return;
        }
        state.level.name = trimmed;
        state.libraryId = saveLevel(state.level, state.libraryId ?? undefined, activeTileSet(state).id);
        scheduleAutosave(state.level);
        state.uiDirty = true;
        showToast(`Saved "${trimmed}" to your library`);
    };
    ui.libCount.onclick = () => {
        openLibraryModal(state, ui!.name, (id) => {
            state.libraryId = id;
            state.uiDirty = true;
        });
    };

    state.uiDirty = true;
    return panel;
}

function selectTile(state: EditorState, value: TileValue): void {
    state.selectedTileValue = value;
    state.selectedTool = 'paint';
    state.uiDirty = true;
}

function setMirrorMode(state: EditorState, mode: MirrorMode): void {
    state.prefs.mirrorMode = mode;
    savePrefs(state.prefs);
    state.uiDirty = true;
    showToast(`Mirror: ${mirrorModeDef(mode).hint}`);
}

function selectTool(state: EditorState, tool: EditorTool): void {
    state.selectedTool = tool;
    if (tool !== 'move') state.draggingMarker = null;
    state.uiDirty = true;
}

/** Refresh every live number and pressed-state in the panel. */
function refreshReadouts(state: EditorState): void {
    if (!ui) return;
    const tileSet = activeTileSet(state);

    ui.tileSetSelect.value = tileSet.id;
    ui.tileSetDesc.textContent = tileSet.description;

    // Budget rows
    for (const row of BUDGET_ROWS) {
        const li = ui.budgets.querySelector<HTMLElement>(`[data-key="${row.key}"]`);
        if (!li) continue;
        const used = state.usage[row.key];
        const budget = tileSet.budgets[row.key];
        li.querySelector('.ed-budget-val')!.textContent = formatBudget(used, budget);
        const bar = li.querySelector<HTMLElement>('.ed-bar > span')!;
        const ratio = isInfinite(budget) ? 0 : Math.min(1, budget === 0 ? 1 : used / budget);
        bar.style.width = `${Math.round(ratio * 100)}%`;
        li.classList.toggle('ed-full', !isInfinite(budget) && used === budget);
        li.classList.toggle('ed-over', !isInfinite(budget) && used > budget);
    }

    // Palette: selection + how many are left
    for (const kind of TILE_KINDS) {
        const button = document.getElementById(`ed-tile-${kind.id}`);
        if (!button) continue;
        const selected = state.selectedTool === 'paint' && state.selectedTileValue === kind.value;
        button.setAttribute('aria-checked', String(selected));
        const budget = tileSet.budgets[kind.id];
        const count = button.querySelector<HTMLElement>('.ed-count')!;
        count.textContent = isInfinite(budget)
            ? '∞'
            : `${Math.max(0, budget - state.usage[kind.id])} left`;
        count.classList.toggle('ed-full', !isInfinite(budget) && state.usage[kind.id] >= budget);
    }

    // Tools
    for (const { tool, id } of TOOL_BUTTONS) {
        document.getElementById(id)?.setAttribute('aria-pressed', String(state.selectedTool === tool));
    }
    document.querySelectorAll<HTMLElement>('#ed-brush-sizes button').forEach((button) => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.brush) === state.prefs.brushSize));
    });
    document.querySelectorAll<HTMLElement>('#ed-mirror-modes button').forEach((button) => {
        button.setAttribute('aria-checked', String(button.dataset.mirror === state.prefs.mirrorMode));
    });

    // Movable objects: which one is held, and where each sits
    for (const marker of MARKER_KINDS) {
        const button = document.getElementById(`ed-marker-${marker.id}`);
        if (!button) continue;
        button.setAttribute('aria-pressed', String(state.armedMarker === marker.id));
        const pos = marker.get(state.level);
        button.querySelector<HTMLElement>('.ed-count')!.textContent = `${pos.x}, ${pos.y}`;
    }

    // Zones
    const rzBudget = tileSet.budgets.red_zone;
    el('ed-rz-count').textContent = formatBudget(state.usage.red_zone, rzBudget);
    el('ed-tunnel-row').textContent = `row ${state.level.tunnelRow}`;
    el('ed-tunnel-desc').textContent =
        `Cyan boxes mark the two tiles that wrap to the other side. Amber columns `
        + `(0–${state.level.tunnelSlowColMax} and ${state.level.tunnelSlowColMin}–${gridW - 1}) `
        + `are where enemies slow down.`;

    // History
    ui.undo.disabled = state.undoStack.length === 0;
    ui.redo.disabled = state.redoStack.length === 0;

    ui.libCount.textContent = `📂 My maps (${listLevels().length})`;
}

function updateHoverInfo(state: EditorState): void {
    if (!ui) return;
    const hovered = state.hoveredCell;
    if (!hovered) {
        ui.info.textContent = '';
        return;
    }
    const kind = tileKindOfValue(state.level.tiles[hovered.y][hovered.x]);
    ui.info.textContent = `${hovered.x}, ${hovered.y} · ${kind.label}`;
}

function runValidation(state: EditorState): { valid: boolean } {
    const result = validateLevel(state.level, activeTileSet(state));
    if (!ui) return result;

    ui.validateResult.innerHTML = '';
    const add = (cls: string, text: string): void => {
        const div = document.createElement('div');
        div.className = cls;
        div.textContent = text;
        ui!.validateResult.appendChild(div);
    };
    if (result.valid) {
        add('ed-ok', `✔ Valid — ${result.smallDots} dots, ${result.powerDots} power pellets`);
    }
    for (const error of result.errors)     add('ed-error', `✘ ${error}`);
    for (const warning of result.warnings) add('ed-warning', `⚠ ${warning}`);
    return result;
}

// ── Canvas Event Handling ─────────────────────────────────────────────────────

function attachCanvasEvents(state: EditorState): void {
    const canvas = gameState.canvas;

    function onDown(clientX: number, clientY: number): void {
        const cell = tileFromCanvas(clientX, clientY);
        if (!cell) return;
        isPainting = true;
        redZoneDragMode = null;
        redZoneDragSeen.clear();
        beginStroke(state);
        if (applyToolDown(state, cell)) noteChange(state);
    }

    function onMove(clientX: number, clientY: number): void {
        const cell = tileFromCanvas(clientX, clientY);
        state.hoveredCell = cell;
        if (state.selectedTool === 'move') {
            const over = cell ? markerAtTile(state.level, cell.x, cell.y) : null;
            canvas.style.cursor = state.draggingMarker ? 'grabbing' : (over ? 'grab' : 'crosshair');
        } else {
            canvas.style.cursor = 'crosshair';
        }
        if (isPainting && cell) {
            if (applyToolDrag(state, cell)) noteChange(state);
        }
    }

    function onUp(): void {
        isPainting = false;
        state.draggingMarker = null;
        pendingUndo = null;
    }

    // Mouse
    canvas.addEventListener('mousedown',  (e) => onDown(e.clientX, e.clientY));
    canvas.addEventListener('mousemove',  (e) => onMove(e.clientX, e.clientY));
    canvas.addEventListener('mouseup',    () => onUp());
    canvas.addEventListener('mouseleave', () => { onUp(); state.hoveredCell = null; });

    // Touch
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        onDown(t.clientX, t.clientY);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        onMove(t.clientX, t.clientY);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        onUp();
        state.hoveredCell = null;
    }, { passive: false });
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────

function nudgeArmedMarker(state: EditorState, dx: number, dy: number): void {
    if (!state.armedMarker) return;
    const marker = markerById(state.armedMarker);
    const pos = marker.get(state.level);
    const next = {
        x: Math.min(gridW - 1, Math.max(0, pos.x + dx)),
        y: Math.min(gridH - 1, Math.max(0, pos.y + dy)),
    };
    if (next.x === pos.x && next.y === pos.y) return;
    beginStroke(state);
    marker.set(state.level, next);
    noteChange(state);
}

function attachKeyboardShortcuts(state: EditorState): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const typing = target instanceof HTMLInputElement && target.type === 'text';
        if (typing || target instanceof HTMLSelectElement) return;

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (undo(state)) syncToRenderer(state);
            } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
                e.preventDefault();
                if (redo(state)) syncToRenderer(state);
            }
            return;
        }
        if (e.altKey) return;

        const tileByKey = TILE_KINDS.find(k => k.key === e.key);
        if (tileByKey) {
            selectTile(state, tileByKey.value);
            return;
        }

        switch (e.key.toLowerCase()) {
            case 'b': selectTool(state, 'paint'); break;
            case 'e': selectTool(state, 'erase'); break;
            case 'f': selectTool(state, 'fill');  break;
            case 'm': selectTool(state, 'move');  break;
            case 'r': selectTool(state, 'red_zone'); break;
            case 't': selectTool(state, 'tunnel_config'); break;
            case 'g':
                state.prefs.showGrid = !state.prefs.showGrid;
                el<HTMLInputElement>('ed-grid').checked = state.prefs.showGrid;
                savePrefs(state.prefs);
                break;
            case 'x':
                setMirrorMode(state, nextMirrorMode(state.prefs.mirrorMode));
                break;
            case 'h':
                setPanelOpen(!panelOpen);
                break;
            case '[':
                state.prefs.brushSize = Math.max(1, state.prefs.brushSize - 1);
                savePrefs(state.prefs);
                state.uiDirty = true;
                break;
            case ']':
                state.prefs.brushSize = Math.min(3, state.prefs.brushSize + 1);
                savePrefs(state.prefs);
                state.uiDirty = true;
                break;
            case 'escape':
                if (state.armedMarker) {
                    state.armedMarker = null;
                    state.uiDirty = true;
                }
                break;
            case 'arrowleft':  e.preventDefault(); nudgeArmedMarker(state, -1,  0); break;
            case 'arrowright': e.preventDefault(); nudgeArmedMarker(state,  1,  0); break;
            case 'arrowup':    e.preventDefault(); nudgeArmedMarker(state,  0, -1); break;
            case 'arrowdown':  e.preventDefault(); nudgeArmedMarker(state,  0,  1); break;
        }
    });
}

// ── Entry Point ───────────────────────────────────────────────────────────────

export function startEditorMode(): void {
    const saved = loadAutosave();
    const initialLevel = saved ?? Levels.level1Data;
    const state = createEditorState(initialLevel, null, loadPrefs());

    syncToRenderer(state);

    const toggle = document.createElement('button');
    toggle.id = 'ed-toggle';
    toggle.type = 'button';
    toggle.textContent = '✏';
    toggle.title = 'Show editor tools (H)';
    toggle.setAttribute('aria-label', 'Show editor tools');
    toggle.onclick = () => setPanelOpen(true);
    document.body.appendChild(toggle);

    buildPanel(state);
    setPanelOpen(true);
    window.addEventListener('resize', layoutCanvas);
    window.addEventListener('orientationchange', layoutCanvas);

    attachCanvasEvents(state);
    attachKeyboardShortcuts(state);

    requestAnimationFrame(() => editorLoop(state));
}
