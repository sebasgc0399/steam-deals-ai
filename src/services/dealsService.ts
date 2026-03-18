import { getNotifiedIds, markAsNotified } from '../cache/deduplication';
import {
  hashCandidates,
  isSnapshotFresh,
  loadSnapshot,
  saveSnapshot,
} from '../cache/snapshotCache';
import { config } from '../config';
import { FilteredDeal, PipelineResult } from '../types';
import { fetchSteamDeals } from './cheapsharkClient';
import { buildFilteredDeals, filterDealsWithAI } from './openaiFilter';
import { applyHardFilters } from './rulesFilter';

// Lock en memoria: previene que cron y /deals corran el pipeline simultáneamente,
// lo que causaría doble llamada a CheapShark/GPT y posibles carreras en los JSON.
// Se resetea con el proceso — aceptable para MVP de un solo proceso.
let pipelineRunning = false;

/**
 * Ejecuta el pipeline completo con caché por hash de candidatos.
 * Si los candidatos no cambiaron respecto al último snapshot, omite la llamada a GPT.
 * Si la IA falla, usa el último snapshot fresco como fallback.
 */
async function runPipeline(): Promise<PipelineResult> {
  if (pipelineRunning) {
    // Ya hay una ejecución en curso — devolver el snapshot actual si es válido,
    // o no_deals si no hay nada disponible aún.
    console.warn('⚠️ Pipeline ya en ejecución, evitando carrera.');
    const snapshot = loadSnapshot();
    if (snapshot && isSnapshotFresh(snapshot)) {
      return { status: 'ok', deals: snapshot.deals };
    }
    return { status: 'no_deals' };
  }

  pipelineRunning = true;
  try {
    return await _runPipelineImpl();
  } finally {
    pipelineRunning = false;
  }
}

async function _runPipelineImpl(): Promise<PipelineResult> {
  const opts = config.filters;

  // 1. Fetch — sin filtro de Metacritic upstream (rulesFilter usa OR)
  const rawDeals = await fetchSteamDeals({
    maxPrice: opts.maxPriceUSD,
    pageSize: opts.pageSize,
  });

  // 2. Filtro determinista — puro, sin I/O
  const notifiedIds = getNotifiedIds();
  const candidates = applyHardFilters(rawDeals, opts, notifiedIds);
  console.log(`📋 CheapShark: ${rawDeals.length} deals → ${candidates.length} candidatos`);

  if (candidates.length === 0) return { status: 'no_deals' };

  // 3. Hash de candidatos — incluye precio, descuento y dealID para detectar cambios en la oferta
  //    Si el hash coincide con el snapshot anterior, no se llama a GPT
  const currentHash = hashCandidates(
    candidates.map((d) => ({
      steamAppID: d.steamAppID,
      title: d.title,
      metacriticScore: d.metacriticScore,
      steamRatingText: d.steamRatingText,
      salePrice: d.salePrice,
      normalPrice: d.normalPrice,
      savings: d.savings,
      dealID: d.dealID,
    })),
  );
  const snapshot = loadSnapshot();

  if (snapshot && snapshot.candidatesHash === currentHash) {
    console.log('✅ Hash de candidatos sin cambios — reutilizando selección anterior (sin llamada a GPT)');
    return { status: 'ok', deals: snapshot.deals };
  }

  // 4. CAPA 2 — GPT solo decide quién pasa y aporta la razón
  const aiResult = await filterDealsWithAI(candidates);

  if (aiResult.status === 'error') {
    console.error(`❌ IA falló: ${aiResult.reason}`);

    // Fallback: solo snapshot fresco (del día de hoy en Bogotá).
    // Un snapshot de ayer puede tener precios/links ya distintos — no es un fallback seguro.
    if (snapshot && isSnapshotFresh(snapshot) && snapshot.deals.length > 0) {
      console.warn('⚠️ Usando snapshot de hoy como fallback por fallo de IA');
      return { status: 'ok', deals: snapshot.deals };
    }

    return { status: 'ai_error', reason: aiResult.reason };
  }

  // 5. Reconstruir FilteredDeal[] desde candidatos originales (nunca desde GPT)
  const deals = buildFilteredDeals(candidates, aiResult.selection);
  console.log(`🤖 GPT: ${candidates.length} candidatos → ${deals.length} seleccionados`);

  // 6. Persistir snapshot para reutilización futura
  saveSnapshot({ deals, candidatesHash: currentHash, createdAt: new Date().toISOString() });

  return { status: 'ok', deals };
}

/**
 * Solo consulta y filtra. Sin efectos secundarios en deduplicación.
 * Si existe snapshot fresco del día, lo sirve directamente sin tocar APIs.
 */
export async function fetchDeals(): Promise<PipelineResult> {
  const snapshot = loadSnapshot();
  if (snapshot && isSnapshotFresh(snapshot)) {
    console.log('📦 Sirviendo snapshot del día sin re-ejecutar pipeline');
    return { status: 'ok', deals: snapshot.deals };
  }
  return runPipeline();
}

/**
 * Consulta, filtra y marca los resultados como notificados.
 * Retorna PipelineResult para que el cron pueda distinguir entre:
 * - 'ok': broadcast normal
 * - 'no_deals': sin ofertas hoy, silencio correcto
 * - 'ai_error': fallo real, NO enviar "no hay ofertas" engañoso
 */
export async function fetchAndMarkDeals(): Promise<PipelineResult> {
  const result = await runPipeline();
  if (result.status !== 'ok') return result;

  if (result.deals.length > 0) {
    markAsNotified(result.deals.map((d) => ({ steamAppID: d.steamAppID })));
  }
  return result;
}
