import dotenv from 'dotenv';
import cron from 'node-cron';

dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`❌ Variable requerida no definida: ${key}`);
  return val;
}

function optional(key: string, defaultVal: string): string {
  return process.env[key] ?? defaultVal;
}

/** Lee un entero, valida que sea un número y que esté dentro del rango permitido. */
function optionalInt(key: string, defaultVal: number, min: number, max: number): number {
  const raw = process.env[key];
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n)) {
    throw new Error(`❌ ${key} debe ser un entero, recibido: "${raw}"`);
  }
  if (n < min || n > max) {
    throw new Error(`❌ ${key}=${n} fuera de rango permitido [${min}, ${max}]`);
  }
  return n;
}

function validatedCron(key: string, defaultVal: string): string {
  const val = process.env[key] ?? defaultVal;
  if (!cron.validate(val)) {
    throw new Error(`❌ ${key}="${val}" no es una expresión cron válida`);
  }
  return val;
}

export const config = {
  telegram: {
    botToken: required('BOT_TOKEN'),
  },
  openai: {
    apiKey: required('OPENAI_API_KEY'),
    model: optional('OPENAI_MODEL', 'gpt-4o-mini'),
    timeoutMs: 30_000, // 30s — tiempo razonable para una llamada de curación
  },
  filters: {
    minDiscountPercent: optionalInt('MIN_DISCOUNT_PERCENT', 50, 0, 100),
    minMetacriticScore: optionalInt('MIN_METACRITIC_SCORE', 70, 0, 100),
    minSteamRatingPercent: optionalInt('MIN_STEAM_RATING_PERCENT', 70, 0, 100),
    maxPriceUSD: optionalInt('MAX_PRICE_USD', 60, 1, 999),
    pageSize: optionalInt('DEALS_PAGE_SIZE', 60, 1, 60),
  },
  dedup: {
    days: optionalInt('DEDUP_DAYS', 7, 1, 365),
  },
  cron: {
    schedule: validatedCron('CRON_SCHEDULE', '0 9 * * *'),
  },
  http: {
    cheapsharkTimeoutMs: 10_000, // 10s — API pública sin SLA
    telegramTimeoutMs: 15_000, // 15s — mensajes de texto pequeños
  },
  rateLimit: {
    dealsCooldownMs: 45_000, // 45s entre invocaciones de /deals por chat_id
    telegramSendDelayMs: 50, // ms entre envíos en broadcast (rate limiting preventivo)
  },
  ai: {
    maxReasonLength: 120, // caracteres máximos para el campo `reason` de GPT
  },
} as const;
