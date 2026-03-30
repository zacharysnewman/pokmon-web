import type { LevelData, TileValue } from '../types';

export type EditorTool =
    | 'paint'
    | 'erase'
    | 'fill'
    | 'player_spawn'
    | 'enemy_red'
    | 'enemy_cyan'
    | 'enemy_hotpink'
    | 'enemy_orange'
    | 'fruit_spawn'
    | 'tunnel_config'
    | 'red_zone';

export interface EditorState {
    level: LevelData;
    selectedTool: EditorTool;
    selectedTileValue: TileValue;
    hoveredCell: { x: number; y: number } | null;
    undoStack: LevelData[];
    redoStack: LevelData[];
    isDirty: boolean;
    showGrid: boolean;
}

export function deepCopyLevel(level: LevelData): LevelData {
    return {
        ...level,
        tiles: level.tiles.map(row => [...row] as TileValue[]),
        playerStart:    { ...level.playerStart },
        enemyStarts: {
            redEnemy:     { ...level.enemyStarts.redEnemy },
            cyanEnemy:    { ...level.enemyStarts.cyanEnemy },
            hotpinkEnemy: { ...level.enemyStarts.hotpinkEnemy },
            orangeEnemy:  { ...level.enemyStarts.orangeEnemy },
        },
        fruitSpawn:     { ...level.fruitSpawn },
        enemyHouseDoor: { ...level.enemyHouseDoor },
        redZoneTiles:   level.redZoneTiles.map(t => ({ ...t })),
        scatterTargets: {
            redEnemy:     { ...level.scatterTargets.redEnemy },
            cyanEnemy:    { ...level.scatterTargets.cyanEnemy },
            hotpinkEnemy: { ...level.scatterTargets.hotpinkEnemy },
            orangeEnemy:  { ...level.scatterTargets.orangeEnemy },
        },
    };
}

export function createEditorState(level: LevelData): EditorState {
    return {
        level: deepCopyLevel(level),
        selectedTool: 'paint',
        selectedTileValue: 5 as TileValue, // TILE_EMPTY
        hoveredCell: null,
        undoStack: [],
        redoStack: [],
        isDirty: false,
        showGrid: true,
    };
}

export function pushUndo(state: EditorState): void {
    state.undoStack.push(deepCopyLevel(state.level));
    state.redoStack = [];
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.isDirty = true;
}

export function undo(state: EditorState): void {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(deepCopyLevel(state.level));
    state.level = state.undoStack.pop()!;
}

export function redo(state: EditorState): void {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(deepCopyLevel(state.level));
    state.level = state.redoStack.pop()!;
}
