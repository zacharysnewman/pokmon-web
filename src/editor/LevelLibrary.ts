import type { LevelData } from '../types';
import { migrateLevel } from './LevelMigrate';

const LIBRARY_KEY = 'editor_library';

export interface LibraryEntry {
    id: string;          // unique stable id (timestamp + random)
    savedAt: number;     // Date.now() when last saved
    level: LevelData;
    /** Editor-side metadata: which tile set the level was authored under. */
    tileSetId?: string;
}

function loadRaw(): LibraryEntry[] {
    try {
        const raw = localStorage.getItem(LIBRARY_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as LibraryEntry[];
    } catch {
        return [];
    }
}

function saveRaw(entries: LibraryEntry[]): void {
    try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
    } catch {
        alert('localStorage quota exceeded — could not save level library.');
    }
}

export function listLevels(): LibraryEntry[] {
    const entries = loadRaw();
    for (const entry of entries) migrateLevel(entry.level);
    return entries;
}

/** Save or overwrite a level. Returns the entry's id. */
export function saveLevel(level: LevelData, existingId?: string, tileSetId?: string): string {
    const entries = loadRaw();
    const id = existingId ?? `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const idx = entries.findIndex(e => e.id === id);
    const entry: LibraryEntry = { id, savedAt: Date.now(), level, tileSetId };
    if (idx >= 0) {
        entries[idx] = entry;
    } else {
        entries.push(entry);
    }
    saveRaw(entries);
    return id;
}

export function loadLevel(id: string): LevelData | null {
    const entry = loadRaw().find(e => e.id === id);
    return entry ? migrateLevel(entry.level) : null;
}

export function deleteLevel(id: string): void {
    const entries = loadRaw().filter(e => e.id !== id);
    saveRaw(entries);
}

export function formatDate(ts: number): string {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
