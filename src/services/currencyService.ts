import axios from 'axios';

const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_COP_RATE = 4000;

let cachedRate: number | null = null;
let cachedAt = 0;

interface ExchangeRateResponse {
  rates?: {
    COP?: unknown;
  };
}

export async function getExchangeRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedRate;
  }

  try {
    const { data } = await axios.get<ExchangeRateResponse>(EXCHANGE_RATE_URL, {
      timeout: 10_000,
    });
    const rate = data?.rates?.COP;

    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
      cachedRate = rate;
      cachedAt = now;
      return rate;
    }
  } catch {
    // Si falla la API externa, el bot sigue operando con una tasa segura.
  }

  return cachedRate ?? FALLBACK_COP_RATE;
}
