import { FilteredDeal } from '../types';

const copFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Escapa caracteres especiales de HTML para usar en mensajes de Telegram */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatCopPrice(usdPrice: string, copRate: number): string {
  const value = Math.round(parseFloat(usdPrice) * copRate);
  return `COP $${copFormatter.format(value)}`;
}

function formatUsdPrice(usdPrice: string): string {
  return `USD $${usdFormatter.format(parseFloat(usdPrice))}`;
}

export function formatDealsMessage(deals: FilteredDeal[], copRate: number): string {
  if (deals.length === 0) {
    return '🎮 No hay ofertas destacadas hoy. ¡Vuelve mañana!';
  }

  // Bogotá explícito: coherente con el cron y la política de frescura del snapshot
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

    const normalPriceCOP = formatCopPrice(deal.normalPrice, copRate);
    const salePriceCOP = formatCopPrice(deal.salePrice, copRate);
    const salePriceUSD = formatUsdPrice(deal.salePrice);

    return [
      `<b><a href="${deal.dealUrl}">${i + 1}. ${escapeHtml(deal.title)}</a></b>`,
      `💰 <s>${normalPriceCOP}</s> → <b>${salePriceCOP}</b> (${salePriceUSD}) (${deal.savingsPercent}% OFF)`,
      score,
      `💡 <i>${escapeHtml(deal.reason)}</i>`,
    ].join('\n');
  });

  return header + subtitle + items.join(`\n\n${'─'.repeat(20)}\n\n`);
}
