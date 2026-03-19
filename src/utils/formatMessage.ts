import { FilteredDeal } from '../types';

const copFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Escapa caracteres especiales de HTML para usar en mensajes de Telegram. */
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

function formatDealBlock(deal: FilteredDeal, index: number, copRate: number): string {
  const steamLink = `https://store.steampowered.com/app/${deal.steamAppID}`;
  const extremeDiscountAlert = deal.savingsPercent >= 90
    ? '\u{1F6A8} <b>\u{00A1}DESCUENTO EXTREMO! (Minimo historico)</b>'
    : null;
  const score = deal.metacriticScore > 0
    ? `\u{1F4CA} Metacritic: <b>${deal.metacriticScore}</b>`
    : `\u{2B50} ${escapeHtml(deal.steamRatingText)}`;

  const normalPriceCOP = formatCopPrice(deal.normalPrice, copRate);
  const salePriceCOP = formatCopPrice(deal.salePrice, copRate);
  const salePriceUSD = formatUsdPrice(deal.salePrice);

  return [
    `<b><a href="${steamLink}">${index + 1}. ${escapeHtml(deal.title)}</a></b>`,
    extremeDiscountAlert,
    `\u{1F4B0} <s>${normalPriceCOP}</s> \u{2192} <b>${salePriceCOP}</b> (${salePriceUSD}) (${deal.savingsPercent}% OFF)`,
    score,
    `\u{1F4A1} <i>${escapeHtml(deal.reason)}</i>`,
  ].filter((line): line is string => Boolean(line)).join('\n');
}

export function formatDealsMessage(deals: FilteredDeal[], copRate: number): string {
  if (deals.length === 0) {
    return '\u{1F3AE} No hay ofertas destacadas hoy. \u{00A1}Vuelve manana!';
  }

  const date = new Date().toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const header = `\u{1F3AE} <b>Ofertas Steam Destacadas</b>\n\u{1F4C5} ${date}\n`;
  const subtitle = `<i>${deals.length} juegos seleccionados por IA</i>\n\n`;
  const separator = `\n\n${'\u{2500}'.repeat(20)}\n\n`;
  const items = deals.map((deal, index) => formatDealBlock(deal, index, copRate));

  return header + subtitle + items.join(separator);
}
