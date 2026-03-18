import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'bot.db');

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
