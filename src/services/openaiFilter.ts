import OpenAI from 'openai';
import { config } from '../config';
import { AIFilterResult, Deal, FilteredDeal } from '../types';

const client = new OpenAI({ apiKey: config.openai.apiKey });

const SYSTEM_PROMPT = `
Eres un experto curador de videojuegos. Los juegos que recibes YA pasaron un filtro
de calidad (buen Metacritic o Steam Rating, buen descuento). Tu trabajo es seleccionar
hasta 10 juegos con reconocimiento o señales claras de calidad en la comunidad gamer.
Prioriza devolver entre 8 y 10 si hay suficientes candidatos buenos que realmente
valga la pena recomendar.

SELECCIONA si cumple al menos uno:
1. Juegos AAA de grandes estudios (EA, Ubisoft, CD Projekt, Rockstar, Bethesda, etc.)
2. Juegos AA de estudios medianos con buena reputación o trayectoria reconocible
3. Indies muy reconocidos o premiados (Hades, Hollow Knight, Celeste, Stardew Valley, etc.)
4. Indies menos conocidos pero con reseñas extremadamente positivas
   (por ejemplo "Overwhelmingly Positive") o reputación muy sólida
5. Juegos que fueron trending o virales en los últimos 5 años
6. Franquicias conocidas aunque sea una entrega menor
7. Juegos de nicho con comunidades fieles y reputación fuerte en espacios gaming
   (Reddit, YouTube, Twitch, foros especializados, etc.)

DESCARTA:
- Juegos totalmente desconocidos sin señales claras de reconocimiento o comunidad
- Asset flips o simuladores genéricos sin comunidad
- DLCs de juegos no reconocidos

Responde ÚNICAMENTE con JSON, sin texto adicional:
{
  "selectedIds": ["steamAppID_1", "steamAppID_2"],
  "reasons": {
    "steamAppID_1": "razón breve en español, máx 12 palabras",
    "steamAppID_2": "razón breve en español, máx 12 palabras"
  }
}

Si ninguno tiene reconocimiento, retorna { "selectedIds": [], "reasons": {} }.
`;

export async function filterDealsWithAI(deals: Deal[]): Promise<AIFilterResult> {
  // Solo enviamos id + nombre + ratings a GPT. Precios y URLs no los necesita para decidir.
  const input = deals.map((d) => ({
    steamAppID: d.steamAppID,
    title: d.title,
    metacriticScore: parseInt(d.metacriticScore) || 0,
    steamRatingPercent: parseInt(d.steamRatingPercent) || 0,
    steamRatingText: d.steamRatingText,
  }));

  const completion = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ],
    response_format: { type: 'json_object' },
    // temperature: 0 — necesitamos repetibilidad, no creatividad.
    // Con 0, el mismo conjunto de candidatos produce la misma selección,
    // lo que hace la caché por hash confiable.
    temperature: 0,
  }, {
    // Timeout explícito: sin esto el proceso puede quedar colgado indefinidamente
    timeout: config.openai.timeoutMs,
  });

  const raw = completion.choices[0].message.content!;

  try {
    const parsed = JSON.parse(raw) as { selectedIds?: unknown; reasons?: unknown };

    const selectedIds: string[] = Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [];
    const reasons: Record<string, string> =
      parsed.reasons && typeof parsed.reasons === 'object' && !Array.isArray(parsed.reasons)
        ? (parsed.reasons as Record<string, string>)
        : {};

    // Validar que los IDs devueltos existan en los candidatos enviados
    const validIds = new Set(deals.map((d) => d.steamAppID));
    const safeIds = selectedIds.filter((id) => typeof id === 'string' && validIds.has(id));

    return { status: 'ok', selection: { selectedIds: safeIds, reasons } };
  } catch {
    // Log mínimo: no se vuelca el payload completo de la respuesta de IA
    console.error('❌ openaiFilter: JSON inválido recibido de GPT (primeros 100 chars):', raw.slice(0, 100));
    return { status: 'error', reason: 'Respuesta de IA no es JSON válido' };
  }
}

/**
 * Reconstruye FilteredDeal[] desde los candidatos originales usando la selección de GPT.
 * Los datos (precio, URL, score) vienen de CheapShark, no del modelo.
 * La `reason` (único campo libre de GPT) se trunca a config.ai.maxReasonLength.
 */
export function buildFilteredDeals(
  candidates: Deal[],
  selection: { selectedIds: string[]; reasons: Record<string, string> },
): FilteredDeal[] {
  const dealMap = new Map(candidates.map((d) => [d.steamAppID, d]));

  return selection.selectedIds
    .map((id) => {
      const d = dealMap.get(id);
      if (!d) return null;

      // Truncar reason al límite configurado — el prompt pide 12 palabras pero no hay garantía
      const rawReason = typeof selection.reasons[id] === 'string' ? selection.reasons[id] : '';
      const reason = rawReason.slice(0, config.ai.maxReasonLength);

      return {
        title: d.title,
        steamAppID: d.steamAppID,
        salePrice: d.salePrice,
        normalPrice: d.normalPrice,
        savingsPercent: Math.round(parseFloat(d.savings)),
        metacriticScore: parseInt(d.metacriticScore) || 0,
        steamRatingText: d.steamRatingText,
        dealUrl: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}`,
        reason,
      } satisfies FilteredDeal;
    })
    .filter((d): d is FilteredDeal => d !== null);
}
