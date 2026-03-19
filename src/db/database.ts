import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DEFAULT_DB_PATH = './data/bot.db';
const configuredDbPath = process.env.DATABASE_PATH?.trim() || DEFAULT_DB_PATH;
const DB_PATH = path.resolve(process.cwd(), configuredDbPath);
const DATA_DIR = path.dirname(DB_PATH);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    chat_id INTEGER PRIMARY KEY,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS notified_items (
    steam_app_id TEXT PRIMARY KEY,
    notified_at TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_snapshot (
    snapshot_date TEXT PRIMARY KEY,
    candidates_hash TEXT,
    payload_json TEXT,
    created_at TEXT
  );
`);
