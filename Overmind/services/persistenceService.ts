import { BuildingType, Grid } from '../types';
import { Low } from 'lowdb';
import { LocalStorage } from 'lowdb/browser';

// Schema for the database
type TileRecord = {
    x: number;
    y: number;
    type: BuildingType;
    placedBy: 'AI' | 'USER' | 'SYSTEM';
    timestamp: number;
};

type Database = {
    tiles: TileRecord[];
    meta: {
        lastSaved: number;
        version: number;
    };
};

const defaultData: Database = {
    tiles: [],
    meta: {
        lastSaved: Date.now(),
        version: 1
    }
};

// Initialize DB with LocalStorage Adapter
const adapter = new LocalStorage<Database>('sky-metropolis-db');
const db = new Low<Database>(adapter, defaultData);

export const initDb = async () => {
    await db.read();
    if (!db.data) {
        db.data = defaultData;
        await db.write();
    }
};

export const saveTile = async (x: number, y: number, type: BuildingType, placedBy: 'AI' | 'USER' | 'SYSTEM') => {
    await db.read();
    if (!db.data) return;

    // Remove existing tile at this location if any
    db.data.tiles = db.data.tiles.filter(t => t.x !== x || t.y !== y);

    // Add new tile if it's not None (if None, we just removed the old one, effectively a delete)
    if (type !== BuildingType.None) {
        db.data.tiles.push({
            x,
            y,
            type,
            placedBy,
            timestamp: Date.now()
        });
    }

    db.data.meta.lastSaved = Date.now();
    await db.write();
};

export const loadGridFromDb = async (size: number): Promise<Grid | null> => {
    await db.read();
    if (!db.data || db.data.tiles.length === 0) return null;

    // Create empty grid
    const grid: Grid = Array(size).fill(null).map(() =>
        Array(size).fill(null).map(() => ({ buildingType: BuildingType.None }))
    );

    // Populate from DB
    db.data.tiles.forEach(tile => {
        if (tile.x >= 0 && tile.x < size && tile.y >= 0 && tile.y < size) {
            grid[tile.y][tile.x].buildingType = tile.type;
        }
    });

    return grid;
};

export const clearDb = async () => {
    db.data = defaultData;
    await db.write();
};
