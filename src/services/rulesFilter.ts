import { Deal } from '../types';

export interface RulesFilterOptions {
  minDiscountPercent: number;
  minMetacriticScore: number;
  minSteamRatingPercent: number;
  maxPriceUSD: number;
}

/**
 * Criterios de APROBACIÓN (basta con cumplir uno):
 *  - metacriticScore >= minMetacriticScore (si hay score disponible)
 *  - steamRatingPercent >= minSteamRatingPercent
 *
 * Criterios de RECHAZO (todos deben cumplirse para no rechazar):
 *  - savings >= minDiscountPercent
 *  - salePrice <= maxPriceUSD
 *  - steamAppID no está en notifiedIds (deduplicación inyectada)
 *
 * @param notifiedIds  Set de steamAppIDs ya notificados recientemente.
 *                     Lo construye dealsService; este módulo no toca disco.
 */
export function applyHardFilters(
  deals: Deal[],
  options: RulesFilterOptions,
  notifiedIds: Set<string>,
): Deal[] {
  return deals.filter((deal) => {
    const savings = parseFloat(deal.savings);
    const salePrice = parseFloat(deal.salePrice);
    const metacritic = parseInt(deal.metacriticScore) || 0;
    const steamRating = parseInt(deal.steamRatingPercent) || 0;

    if (savings < options.minDiscountPercent) return false;
    if (salePrice > options.maxPriceUSD) return false;
    if (notifiedIds.has(deal.steamAppID)) return false;

    const hasGoodMetacritic = metacritic > 0 && metacritic >= options.minMetacriticScore;
    const hasGoodSteamRating = steamRating >= options.minSteamRatingPercent;

    return hasGoodMetacritic || hasGoodSteamRating;
  });
}
