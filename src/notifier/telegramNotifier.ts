import fs from 'fs';
import path from 'path';
import { Telegram } from 'telegraf';
import writeFileAtomic from 'write-file-atomic';
import { config } from '../config';

const telegram = new Telegram(config.telegram.botToken);
const DATA_DIR = path.join(process.cwd(), 'data');
const CHAT_IDS_FILE = path.join(DATA_DIR, 'chat_ids.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function saveChatId(chatId: number): void {
  ensureDataDir();
  let ids: number[] = [];
  if (fs.existsSync(CHAT_IDS_FILE)) {
    try {
      ids = JSON.parse(fs.readFileSync(CHAT_IDS_FILE, 'utf-8'));
    } catch {
      ids = [];
    }
  }
  if (!ids.includes(chatId)) {
    ids.push(chatId);
    writeFileAtomic.sync(CHAT_IDS_FILE, JSON.stringify(ids, null, 2));
    console.log(`✅ Chat ID guardado: ${chatId}`);
  }
}

export function loadChatIds(): number[] {
  if (!fs.existsSync(CHAT_IDS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CHAT_IDS_FILE, 'utf-8'));
  } catch {
    console.warn('⚠️ chat_ids.json corrupto.');
    return [];
  }
}

function removeChatIds(toRemove: number[]): void {
  const cleaned = loadChatIds().filter((id) => !toRemove.includes(id));
  writeFileAtomic.sync(CHAT_IDS_FILE, JSON.stringify(cleaned, null, 2));
  console.log(`🗑️ Chat IDs eliminados: ${toRemove.length}`);
}

/** Elimina un único chat_id — usado por el comando /stop */
export function removeChatId(chatId: number): void {
  removeChatIds([chatId]);
}

/** Retorna true si el error de Telegram indica que el chat nunca recibirá mensajes */
function isPermanentError(err: unknown): boolean {
  const code = (err as any)?.response?.error_code;
  const desc: string = (err as any)?.response?.description ?? '';
  // 403 = bot bloqueado / expulsado; 400 chat_not_found = chat borrado o ID inválido
  return code === 403 || (code === 400 && desc.toLowerCase().includes('chat not found'));
}

export async function notifyAllUsers(message: string): Promise<void> {
  const chatIds = loadChatIds();
  console.log(`📨 Enviando a ${chatIds.length} usuario(s)...`);
  const invalidIds: number[] = [];

  for (const chatId of chatIds) {
    try {
      // Timeout explícito: sin esto un cuelgue de Telegram bloquea el loop entero
      await Promise.race([
        telegram.sendMessage(chatId, message, { parse_mode: 'HTML' }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('sendMessage timeout')), config.http.telegramTimeoutMs),
        ),
      ]);
    } catch (err) {
      if (isPermanentError(err)) {
        // Truncar chat_id en logs — últimos 4 dígitos suficientes para debug
        console.warn(`⚠️ Chat ***${String(chatId).slice(-4)} rechazado permanentemente. Eliminando.`);
        invalidIds.push(chatId);
      } else {
        // Log mínimo — no volcar el objeto de error completo (puede incluir payloads)
        const code = (err as any)?.response?.error_code ?? 'unknown';
        console.error(`Error enviando a chat ***${String(chatId).slice(-4)}: código ${code}`);
      }
    }
    if (chatIds.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, config.rateLimit.telegramSendDelayMs));
    }
  }

  if (invalidIds.length > 0) removeChatIds(invalidIds);
}
