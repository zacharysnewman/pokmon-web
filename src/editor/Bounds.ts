// Which tiles the editor lets you paint.
//
// The grid is 28 × 36, but the game draws its HUD over the outermost rows —
// score along the top, lives and the fruit counter along the bottom — so maze
// content there is hidden in play. Painting stops one row short at each end.
//
// Columns are not clipped: the tunnel wraps through column 0 and column 27, so
// those have to stay paintable.
//
// Movable objects are exempt. Scatter targets in particular belong outside the
// maze — the built-in level parks them on rows 0 and 34.

import { gridW, gridH } from '../constants';

export const EDIT_MIN_X = 0;
export const EDIT_MAX_X = gridW - 1;
export const EDIT_MIN_Y = 1;
export const EDIT_MAX_Y = gridH - 2;

export const EDIT_COLS = EDIT_MAX_X - EDIT_MIN_X + 1;
export const EDIT_ROWS = EDIT_MAX_Y - EDIT_MIN_Y + 1;

/** True when a tile may be painted, filled or marked as a red zone. */
export function isEditableTile(x: number, y: number): boolean {
    return x >= EDIT_MIN_X && x <= EDIT_MAX_X && y >= EDIT_MIN_Y && y <= EDIT_MAX_Y;
}

/** True for a row the HUD covers, where painting is refused. */
export function isReservedRow(y: number): boolean {
    return y < EDIT_MIN_Y || y > EDIT_MAX_Y;
}

export const RESERVED_ROWS_HINT =
    `Rows outside ${EDIT_MIN_Y}–${EDIT_MAX_Y} are reserved for the score and lives display`;
