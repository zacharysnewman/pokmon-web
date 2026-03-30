import type { PlayerInput } from './input/PlayerInput';

export type Direction = 'left' | 'right' | 'up' | 'down';

export type TileValue = 0 | 2 | 3 | 4 | 5;

export type EnemyMode = 'scatter' | 'chase' | 'frightened' | 'eyes' | 'entering' | 'house' | 'exiting';

export interface PlayerState {
    id: number;
    actor: IGameObject;
    input: PlayerInput;
    frozen: boolean;
    dying: boolean;
    deathProgress: number;
    active: boolean;
}

export interface IGameObject {
    color: string;
    x: number;
    y: number;
    scale: number;
    moveSpeed: number;
    moveDir: Direction;
    enemyMode?: EnemyMode;
    pendingReverse?: boolean;
    update(): void;
    roundedX(): number;
    roundedY(): number;
    gridX(): number;
    gridY(): number;
    roundedAbsoluteX(): number;
    roundedAbsoluteY(): number;
    leftObject(): TileValue | undefined;
    rightObject(): TileValue | undefined;
    topObject(): TileValue | undefined;
    bottomObject(): TileValue | undefined;
}

export interface LevelData {
    version: number;
    name: string;
    tiles: TileValue[][];
    playerStart: { x: number; y: number };
    enemyStarts: {
        blinky: { x: number; y: number };
        inky:   { x: number; y: number };
        pinky:  { x: number; y: number };
        clyde:  { x: number; y: number };
    };
    fruitSpawn:       { x: number; y: number };
    tunnelRow:        number;
    tunnelSlowColMax: number;
    tunnelSlowColMin: number;
    redZoneTiles:     { x: number; y: number }[];
    enemyHouseDoor:   { x: number; y: number };
    scatterTargets: {
        blinky: { x: number; y: number };
        inky:   { x: number; y: number };
        pinky:  { x: number; y: number };
        clyde:  { x: number; y: number };
    };
}
