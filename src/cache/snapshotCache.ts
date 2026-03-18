import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';
import { DailySnapshot, FilteredDeal } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadSnapshot(): DailySnapshot | null {
  if (!fs.existsSync(SNAPSHOT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')) as DailySnapshot;
  } catch {
    console.warn('⚠️ snapshot.json corrupto o ilegible.');
    return null;
  }
}

export function saveSnapshot(snapshot: DailySnapshot): void {
  ensureDataDir();
  writeFileAtomic.sync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

/**
 * Retorna true si el snapshot es del día de hoy en Bogotá (America/Bogota).
 *
 * Se usa la zona horaria de Bogotá explícitamente porque:
 * - El cron ya corre en esa zona (timezone: 'America/Bogota')
 * - El servidor puede estar en cualquier zona (UTC, US, etc.)
 * - Usar toDateString() sin zona fijaría la fecha del servidor, no la del negocio,
 *   pudiendo marcar un snapshot de ayer como "de hoy" o viceversa.
 */
export function isSnapshotFresh(snapshot: DailySnapshot): boolean {
  const tz = 'America/Bogota';
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  };
  const snapshotDay = new Intl.DateTimeFormat('en-CA', opts).format(new Date(snapshot.createdAt));
  const todayDay = new Intl.DateTimeFormat('en-CA', opts).format(new Date());
  return snapshotDay === todayDay;
}

/**
 * Elimina el snapshot si existe y está obsoleto (no es de hoy).
 * Llamar al arrancar el proceso para evitar servir datos viejos
 * si el bot estuvo caído uno o más días.
 */
export function clearStaleSnapshot(): void {
  const snapshot = loadSnapshot();
  if (snapshot && !isSnapshotFresh(snapshot)) {
    try {
      fs.unlinkSync(SNAPSHOT_FILE);
      console.log('🗑️ Snapshot obsoleto eliminado (era de un día anterior)');
    } catch {
      // No crítico — el pipeline lo sobreescribirá en la próxima ejecución
    }
  }
}

/**
 * Hash determinista de los candidatos.
 * Incluye los campos que GPT usa para decidir (title, scores) Y los campos
 * que determinan la oferta visible al usuario (precio, descuento, dealID).
 * Si cualquiera de éstos cambia, el hash difiere y se re-evalúa con GPT.
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
  // Ordenar por steamAppID para garantizar determinismo independiente del orden del fetch
  const sorted = [...candidates].sort((a, b) => a.steamAppID.localeCompare(b.steamAppID));
  const payload = JSON.stringify(sorted.map((c) => ({
    id: c.steamAppID,
    title: c.title,
    meta: c.metacriticScore,
    rating: c.steamRatingText,
    sale: c.salePrice,
    normal: c.normalPrice,
    savings: c.savings,
    deal: c.dealID, // cambia si el dealID rota aunque el juego sea el mismo
  })));
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
