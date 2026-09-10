// Symmetry helper for painting. Every brush stroke can be echoed across the
// maze's axes so a symmetric layout takes a quarter of the clicks.
//
// The grid is 28 × 36 — not square — so a true corner-to-corner diagonal
// reflection has nowhere to land. "Diagonal" therefore mirrors through the
// centre point (a 180° rotation), which is the diagonal symmetry a rectangular
// maze can actually hold.

import { gridW, gridH } from '../constants';

export type MirrorMode = 'off' | 'horizontal' | 'vertical' | 'diagonal' | 'quad';

export interface MirrorModeDef {
    id: MirrorMode;
    /** Short label for the button. */
    label: string;
    symbol: string;
    hint: string;
}

export const MIRROR_MODES: readonly MirrorModeDef[] = [
    {
        id: 'off', symbol: '·', label: 'Off',
        hint: 'Paint only where you click',
    },
    {
        id: 'horizontal', symbol: '⇔', label: 'L/R',
        hint: 'Horizontal mirror — also paints the matching column on the other side',
    },
    {
        id: 'vertical', symbol: '⇕', label: 'T/B',
        hint: 'Vertical mirror — also paints the matching row on the other side',
    },
    {
        id: 'diagonal', symbol: '⤢', label: 'Diag',
        hint: 'Diagonal mirror — also paints the tile opposite through the centre',
    },
    {
        id: 'quad', symbol: '⊞', label: 'All 4',
        hint: 'Four-sector mirror — paints all four quadrants at once',
    },
] as const;

export function mirrorModeDef(mode: MirrorMode): MirrorModeDef {
    return MIRROR_MODES.find(m => m.id === mode) ?? MIRROR_MODES[0];
}

export function isMirrorMode(value: unknown): value is MirrorMode {
    return MIRROR_MODES.some(m => m.id === value);
}

/** The next mode in the list — used by the keyboard shortcut. */
export function nextMirrorMode(mode: MirrorMode): MirrorMode {
    const index = MIRROR_MODES.findIndex(m => m.id === mode);
    return MIRROR_MODES[(index + 1) % MIRROR_MODES.length].id;
}

/** Tiles that mirror the given one under this mode (excluding the tile itself). */
export function mirrorPartners(mode: MirrorMode, x: number, y: number): Array<{ x: number; y: number }> {
    const mx = gridW - 1 - x;
    const my = gridH - 1 - y;
    switch (mode) {
        case 'off':        return [];
        case 'horizontal': return [{ x: mx, y }];
        case 'vertical':   return [{ x, y: my }];
        case 'diagonal':   return [{ x: mx, y: my }];
        case 'quad':       return [{ x: mx, y }, { x, y: my }, { x: mx, y: my }];
    }
}
