// Response de CheapShark API
export interface Deal {
  title: string;
  metacriticScore: string;
  steamRatingText: string;
  steamRatingPercent: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  steamAppID: string;
  dealID: string;
  thumb: string;
}

// Deal ya filtrado y enriquecido — datos vienen de los candidatos originales, no de GPT
export interface FilteredDeal {
  title: string;
  steamAppID: string;
  salePrice: string;
  normalPrice: string;
  savingsPercent: number;
  metacriticScore: number;
  steamRatingText: string;
  dealUrl: string;
  reason: string; // único campo que aporta GPT
}

// Entrada de deduplicación — solo lo estrictamente necesario para deduplicar
export interface NotifiedGame {
  steamAppID: string;
  notifiedAt: string; // ISO date string
  // ⚠️ title NO se almacena — no es necesario para la función de deduplicación
}

// GPT solo decide quién pasa y aporta la razón — los datos reales vienen de los candidatos
export interface AISelection {
  selectedIds: string[];           // steamAppIDs elegidos
  reasons: Record<string, string>; // steamAppID → razón breve en español
}

// Resultado tipado de la capa IA — distingue "sin resultados" de "fallo"
export type AIFilterResult =
  | { status: 'ok'; selection: AISelection }
  | { status: 'error'; reason: string };

// Resultado del pipeline completo — propagado hasta el caller (commands.ts)
export type PipelineResult =
  | { status: 'ok'; deals: FilteredDeal[] }
  | { status: 'no_deals' }
  | { status: 'ai_error'; reason: string };

// Snapshot del último análisis exitoso del día.
// /deals lo sirve directamente; el cron lo actualiza cuando hay cambios.
export interface DailySnapshot {
  deals: FilteredDeal[]; // resultado final ya formateado
  candidatesHash: string; // hash de candidatos → evita re-llamar a GPT si no cambiaron
  createdAt: string; // ISO — para saber si el snapshot es del día de hoy
}
