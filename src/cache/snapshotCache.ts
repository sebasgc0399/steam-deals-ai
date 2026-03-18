import crypto from 'crypto';
import { db } from '../db/database';
import { DailySnapshot } from '../types';

const TZ = 'America/Bogota';
const BOGOTA_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const loadSnapshotStmt = db.prepare(
  `SELECT payload_json
   FROM daily_snapshot
   ORDER BY snapshot_date DESC
   LIMIT 1`,
);
const clearSnapshotsStmt = db.prepare('DELETE FROM daily_snapshot');
const insertSnapshotStmt = db.prepare(
  `INSERT INTO daily_snapshot (snapshot_date, candidates_hash, payload_json, created_at)
   VALUES (?, ?, ?, ?)`,
);
const replaceSnapshotTx = db.transaction((snapshotDate: string, snapshot: DailySnapshot, payloadJson: string) => {
  clearSnapshotsStmt.run();
  insertSnapshotStmt.run(snapshotDate, snapshot.candidatesHash, payloadJson, snapshot.createdAt);
});

function toBogotaDate(date: Date): string {
  return BOGOTA_DATE_FMT.format(date);
}

export function loadSnapshot(): DailySnapshot | null {
  const row = loadSnapshotStmt.get() as { payload_json: string } | undefined;

  if (!row) return null;

  try {
    return JSON.parse(row.payload_json) as DailySnapshot;
  } catch {
    console.warn('snapshot payload corrupto o ilegible.');
    return null;
  }
}

export function saveSnapshot(snapshot: DailySnapshot): void {
  const snapshotDate = toBogotaDate(new Date());
  const payloadJson = JSON.stringify(snapshot);
  replaceSnapshotTx(snapshotDate, snapshot, payloadJson);
}

/**
 * Retorna true si el snapshot es del dia de hoy en Bogota (America/Bogota).
 *
 * Se usa la zona horaria de Bogota explicitamente porque:
 * - El cron ya corre en esa zona (timezone: 'America/Bogota')
 * - El servidor puede estar en cualquier zona (UTC, US, etc.)
 * - Usar toDateString() sin zona fijaria la fecha del servidor, no la del negocio.
 */
export function isSnapshotFresh(snapshot: DailySnapshot): boolean {
  const snapshotDay = toBogotaDate(new Date(snapshot.createdAt));
  const todayDay = toBogotaDate(new Date());
  return snapshotDay === todayDay;
}

/**
 * Elimina el snapshot si existe y esta obsoleto (no es de hoy).
 * Llamar al arrancar el proceso para evitar servir datos viejos.
 */
export function clearStaleSnapshot(): void {
  const snapshot = loadSnapshot();
  if (snapshot && !isSnapshotFresh(snapshot)) {
    try {
      clearSnapshotsStmt.run();
      console.log('Snapshot obsoleto eliminado (era de un dia anterior)');
    } catch {
      // No critico: el pipeline lo sobreescribira en la proxima ejecucion.
    }
  }
}

/**
 * Hash determinista de los candidatos.
 * Incluye los campos que GPT usa para decidir (title, scores) y los campos
 * que determinan la oferta visible al usuario (precio, descuento, dealID).
 */
export function hashCandidates(candidates: {
  steamAppID: string;
  title: string;
  metacriticScore: string;
  steamRatingText: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  dealID: string;
}[]): string {
  const sorted = [...candidates].sort((a, b) => a.steamAppID.localeCompare(b.steamAppID));
  const payload = JSON.stringify(
    sorted.map((c) => ({
      id: c.steamAppID,
      title: c.title,
      meta: c.metacriticScore,
      rating: c.steamRatingText,
      sale: c.salePrice,
      normal: c.normalPrice,
      savings: c.savings,
      deal: c.dealID,
    })),
  );
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
