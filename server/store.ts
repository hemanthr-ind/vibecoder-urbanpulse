import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createInitialSeedDatabase, type UrbanPulseDatabase } from './seedData.ts';

function resolveDataDir(): string {
  const preferred = path.resolve(process.cwd(), 'data');
  try {
    if (!fs.existsSync(preferred)) fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'urbanpulse-data');
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'urbanpulse-db.json');

let dbCache: UrbanPulseDatabase | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export function getDatabase(): UrbanPulseDatabase {
  if (dbCache) return dbCache;

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as UrbanPulseDatabase;
      if (parsed && Array.isArray(parsed.reports) && Array.isArray(parsed.issues)) {
        dbCache = parsed;
        return dbCache;
      }
    } catch (err) {
      console.error('Failed to parse existing database file, recreating seed:', err);
    }
  }

  dbCache = createInitialSeedDatabase();
  persistDatabaseSync(dbCache);
  return dbCache;
}

function persistDatabaseSync(db: UrbanPulseDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function saveDatabase(db: UrbanPulseDatabase): Promise<void> {
  dbCache = db;
  writeQueue = writeQueue.then(async () => {
    persistDatabaseSync(db);
  });
  return writeQueue;
}
