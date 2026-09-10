// Editor-only preferences (which tile set, brush settings, overlay toggles).
// Kept out of LevelData on purpose: these follow the person, not the level.

import { DEFAULT_TILE_SET_ID } from './TileSet';
import { isMirrorMode, type MirrorMode } from './Mirror';

const PREFS_KEY = 'editor_prefs';

export interface EditorPrefs {
    tileSetId: string;
    showGrid: boolean;
    brushSize: number;
    mirrorMode: MirrorMode;
    halfTileX: boolean;
    /** Which panel section was last open. */
    activeTab: string;
}

export function defaultPrefs(): EditorPrefs {
    return {
        tileSetId: DEFAULT_TILE_SET_ID,
        showGrid: true,
        brushSize: 1,
        mirrorMode: 'off',
        halfTileX: false,
        activeTab: 'tiles',
    };
}

export function loadPrefs(): EditorPrefs {
    const prefs = defaultPrefs();
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (!raw) return prefs;
        const saved = JSON.parse(raw) as Partial<EditorPrefs>;
        if (typeof saved.tileSetId === 'string') prefs.tileSetId = saved.tileSetId;
        if (typeof saved.showGrid  === 'boolean') prefs.showGrid  = saved.showGrid;
        if (typeof saved.halfTileX === 'boolean') prefs.halfTileX = saved.halfTileX;
        if (typeof saved.activeTab === 'string') prefs.activeTab = saved.activeTab;
        if (isMirrorMode(saved.mirrorMode)) {
            prefs.mirrorMode = saved.mirrorMode;
        } else if ((saved as { mirrorX?: boolean }).mirrorX) {
            prefs.mirrorMode = 'horizontal';   // pre-modes setting
        }
        if (saved.brushSize === 1 || saved.brushSize === 2 || saved.brushSize === 3) {
            prefs.brushSize = saved.brushSize;
        }
    } catch {
        // ignore unreadable prefs
    }
    return prefs;
}

export function savePrefs(prefs: EditorPrefs): void {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
        // ignore quota errors
    }
}
