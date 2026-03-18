import fs from 'fs';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';
import { config } from '../config';
import { NotifiedGame } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const NOTIFIED_FILE = path.join(DATA_DIR, 'notified_games.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadNotifiedGames(): NotifiedGame[] {
  ensureDataDir();
  if (!fs.existsSync(NOTIFIED_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(NOTIFIED_FILE, 'utf-8'));
  } catch {
    console.warn('⚠️ notified_games.json corrupto o ilegible. Reiniciando.');
    return [];
  }
}

function saveNotifiedGames(games: NotifiedGame[]): void {
  ensureDataDir();
  writeFileAtomic.sync(NOTIFIED_FILE, JSON.stringify(games, null, 2));
}

function cutoffMs(): number {
  return Date.now() - config.dedup.days * 24 * 60 * 60 * 1000;
}

/**
 * Retorna el Set de steamAppIDs notificados recientemente.
 * dealsService lo pasa a applyHardFilters para mantener rulesFilter puro.
 */
export function getNotifiedIds(): Set<string> {
  const games = loadNotifiedGames();
  const cutoff = cutoffMs();
  return new Set(
    games
      .filter((g) => new Date(g.notifiedAt).getTime() > cutoff)
      .map((g) => g.steamAppID),
  );
}

/** Marca una lista de juegos como notificados */
export function markAsNotified(games: { steamAppID: string }[]): void {
  const raw = loadNotifiedGames();
  const now = new Date().toISOString();
  const cutoff = cutoffMs();

  // 1. Limpiar expirados PRIMERO para no bloquear reinserciones válidas
  const valid = raw.filter((e) => new Date(e.notifiedAt).getTime() > cutoff);

  // 2. Solo agregar IDs que no estén ya en la lista limpia
  const newEntries: NotifiedGame[] = games
    .filter((g) => !valid.some((e) => e.steamAppID === g.steamAppID))
    .map((g) => ({ steamAppID: g.steamAppID, notifiedAt: now }));
  // title no se guarda — no es necesario para deduplicar

  saveNotifiedGames([...valid, ...newEntries]);
}
