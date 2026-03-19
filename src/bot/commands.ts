import { Telegraf } from 'telegraf';
import { config } from '../config';
import { removeChatId, saveChatId } from '../notifier/telegramNotifier';
import { getExchangeRate } from '../services/currencyService';
import { fetchDeals } from '../services/dealsService';
import { formatDealsMessage } from '../utils/formatMessage';

// Rate limit en memoria: Map<chatId, timestamp ultimo uso>.
// Simple, sin dependencias externas. Se resetea al reiniciar el proceso (aceptable para MVP).
const lastDealRequest = new Map<number, number>();

export function registerCommands(bot: Telegraf): void {
  bot.start(async (ctx) => {
    saveChatId(ctx.chat.id);
    await ctx.reply(
      '\u00A1Hola! \u{1F3AE} Soy tu bot de ofertas de Steam.\n\n'
      + 'Cada dia te enviare las mejores ofertas filtradas por IA: solo AAA, '
      + 'indie premiados y juegos que realmente valen la pena.\n\n'
      + 'Comandos:\n'
      + '/deals \u2014 Ver ofertas ahora mismo\n'
      + '/stop  \u2014 Dejar de recibir notificaciones\n'
      + '/help  \u2014 Ver ayuda',
    );
  });

  bot.command('deals', async (ctx) => {
    const chatId = ctx.chat.id;
    const now = Date.now();
    const last = lastDealRequest.get(chatId) ?? 0;
    const elapsed = now - last;

    if (elapsed < config.rateLimit.dealsCooldownMs) {
      const remaining = Math.ceil((config.rateLimit.dealsCooldownMs - elapsed) / 1000);
      await ctx.reply(`\u23F3 Espera ${remaining}s antes de volver a consultar ofertas.`);
      return;
    }

    lastDealRequest.set(chatId, now);
    await ctx.sendChatAction('typing');

    try {
      const result = await fetchDeals();

      if (result.status === 'ai_error') {
        await ctx.reply(
          '\u26A0\uFE0F El servicio de curacion con IA no esta disponible ahora mismo.\n'
          + 'Intenta de nuevo en unos minutos.',
        );
        return;
      }

      if (result.status === 'no_deals' || result.deals.length === 0) {
        await ctx.reply('\u{1F3AE} No hay ofertas destacadas en este momento. \u00A1Vuelve manana!');
        return;
      }

      const copRate = await getExchangeRate();
      await ctx.reply(formatDealsMessage(result.deals, copRate), { parse_mode: 'HTML' });
    } catch (err) {
      await ctx.reply('\u274C Hubo un error inesperado. Intenta mas tarde.');
      // Log minimo: no volcar el stack ni el objeto de error completo.
      console.error('[/deals] Error inesperado:', (err as Error).message ?? 'sin mensaje');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      '\u{1F916} <b>Steam Deals Bot</b>\n\n'
      + 'Busco ofertas en Steam y uso IA para filtrar solo los juegos '
      + 'que realmente valen la pena: AAA, indie reconocidos, juegos trending.\n\n'
      + '<b>Comandos:</b>\n'
      + '/start \u2014 Activar notificaciones diarias\n'
      + '/deals \u2014 Ver mejores ofertas ahora\n'
      + '/stop  \u2014 Dejar de recibir notificaciones\n'
      + '/help  \u2014 Esta ayuda',
      { parse_mode: 'HTML' },
    );
  });

  bot.command('stop', async (ctx) => {
    // Baja inmediata: elimina el chat_id de la lista de suscriptores.
    // El usuario puede volver a suscribirse en cualquier momento con /start.
    removeChatId(ctx.chat.id);
    await ctx.reply(
      '\u2705 Te diste de baja de las notificaciones diarias.\n'
      + 'Puedes volver a activarlas cuando quieras con /start.',
    );
  });
}
