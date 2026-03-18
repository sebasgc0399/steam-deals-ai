import { FilteredDeal } from '../types';

/** Escapa caracteres especiales de HTML para usar en mensajes de Telegram */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatDealsMessage(deals: FilteredDeal[]): string {
  if (deals.length === 0) {
    return '🎮 No hay ofertas destacadas hoy. ¡Vuelve mañana!';
  }

  // Bogotá explícito — coherente con el cron y la política de frescura del snapshot
  const date = new Date().toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const header = `🎮 <b>Ofertas Steam Destacadas</b>\n📅 ${date}\n`;
  const subtitle = `<i>${deals.length} juegos seleccionados por IA</i>\n\n`;

  const items = deals.map((deal, i) => {
    const score = deal.metacriticScore > 0
      ? `📊 Metacritic: <b>${deal.metacriticScore}</b>`
      : `⭐ ${escapeHtml(deal.steamRatingText)}`;

    return [
      `<b>${i + 1}. ${escapeHtml(deal.title)}</b>`,
      `💰 <s>$${escapeHtml(deal.normalPrice)}</s> → <b>$${escapeHtml(deal.salePrice)}</b> (${deal.savingsPercent}% OFF)`,
      score,
      `💡 <i>${escapeHtml(deal.reason)}</i>`,
      `<a href="${deal.dealUrl}">🛒 Ver oferta en Steam</a>`,
    ].join('\n');
  });

  return header + subtitle + items.join(`\n\n${'─'.repeat(20)}\n\n`);
}
