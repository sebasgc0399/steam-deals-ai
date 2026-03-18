import { Telegram } from 'telegraf';
import { config } from '../config';
import { db } from '../db/database';

const telegram = new Telegram(config.telegram.botToken);

const insertSubscriberStmt = db.prepare(
  'INSERT OR IGNORE INTO subscribers (chat_id, created_at) VALUES (?, ?)',
);
const loadSubscribersStmt = db.prepare('SELECT chat_id FROM subscribers ORDER BY created_at ASC');
const deleteSubscriberStmt = db.prepare('DELETE FROM subscribers WHERE chat_id = ?');
const deleteSubscribersTx = db.transaction((chatIds: number[]) => {
  for (const chatId of chatIds) {
    deleteSubscriberStmt.run(chatId);
  }
});

export function saveChatId(chatId: number): void {
  const result = insertSubscriberStmt.run(chatId, new Date().toISOString());
  if (result.changes > 0) {
    console.log(`[subscribers] Chat ID saved: ${chatId}`);
  }
}

export function loadChatIds(): number[] {
  try {
    const rows = loadSubscribersStmt.all() as Array<{ chat_id: number }>;
    return rows.map((row) => row.chat_id);
  } catch {
    console.warn('[subscribers] Failed to read chat IDs from SQLite.');
    return [];
  }
}

function removeChatIds(toRemove: number[]): void {
  deleteSubscribersTx(toRemove);
  console.log(`[subscribers] Chat IDs removed: ${toRemove.length}`);
}

/** Removes a single chat_id. Used by the /stop command. */
export function removeChatId(chatId: number): void {
  removeChatIds([chatId]);
}

/** Returns true if Telegram error means this chat will never accept messages again. */
function isPermanentError(err: unknown): boolean {
  const code = (err as any)?.response?.error_code;
  const desc: string = (err as any)?.response?.description ?? '';
  // 403 = bot blocked/removed; 400 chat_not_found = deleted chat or invalid ID.
  return code === 403 || (code === 400 && desc.toLowerCase().includes('chat not found'));
}

export async function notifyAllUsers(message: string): Promise<void> {
  const chatIds = loadChatIds();
  console.log(`[notifier] Sending message to ${chatIds.length} user(s)...`);
  const invalidIds: number[] = [];

  for (const chatId of chatIds) {
    try {
      // Explicit timeout to avoid one hung send blocking the full loop.
      await Promise.race([
        telegram.sendMessage(chatId, message, { parse_mode: 'HTML' }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('sendMessage timeout')), config.http.telegramTimeoutMs),
        ),
      ]);
    } catch (err) {
      if (isPermanentError(err)) {
        // Truncate chat_id in logs; last 4 digits are enough for debug.
        console.warn(`[notifier] Chat ***${String(chatId).slice(-4)} rejected permanently. Removing.`);
        invalidIds.push(chatId);
      } else {
        // Minimal logging; avoid dumping full error object.
        const code = (err as any)?.response?.error_code ?? 'unknown';
        console.error(`[notifier] Error sending to chat ***${String(chatId).slice(-4)}: code ${code}`);
      }
    }
    if (chatIds.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, config.rateLimit.telegramSendDelayMs));
    }
  }

  if (invalidIds.length > 0) removeChatIds(invalidIds);
}
