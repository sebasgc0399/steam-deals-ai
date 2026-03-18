import { config } from '../config';
import { db } from '../db/database';

function cutoffMs(): number {
  return Date.now() - config.dedup.days * 24 * 60 * 60 * 1000;
}

function cutoffIso(): string {
  return new Date(cutoffMs()).toISOString();
}

/**
 * Retorna el Set de steamAppIDs notificados recientemente.
 * dealsService lo pasa a applyHardFilters para mantener rulesFilter puro.
 */
export function getNotifiedIds(): Set<string> {
  const rows = db
    .prepare('SELECT steam_app_id FROM notified_items WHERE notified_at > ?')
    .all(cutoffIso()) as { steam_app_id: string }[];

  return new Set(rows.map((row) => row.steam_app_id));
}

/** Marca una lista de juegos como notificados */
export function markAsNotified(games: { steamAppID: string }[]): void {
  const now = new Date().toISOString();
  const deleteExpired = db.prepare('DELETE FROM notified_items WHERE notified_at <= ?');
  const insertNotified = db.prepare(
    'INSERT OR IGNORE INTO notified_items (steam_app_id, notified_at) VALUES (?, ?)',
  );

  const tx = db.transaction((items: { steamAppID: string }[]) => {
    // 1. Limpiar expirados PRIMERO para no bloquear reinserciones validas
    deleteExpired.run(cutoffIso());

    // 2. Solo agregar IDs que no esten ya en la lista limpia
    for (const game of items) {
      insertNotified.run(game.steamAppID, now);
    }
  });

  tx(games);
}
