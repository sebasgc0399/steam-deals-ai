import { Telegraf } from 'telegraf';
import { config } from '../config';
import { removeChatId, saveChatId } from '../notifier/telegramNotifier';
import { getExchangeRate } from '../services/currencyService';
import { fetchDeals } from '../services/dealsService';
import { buildDealsKeyboard, formatDealsMessage } from '../utils/formatMessage';

// Rate limit en memoria: Map<chatId, timestamp último uso>
// Simple, sin dependencias externas. Se resetea al reiniciar el proceso (aceptable para MVP).
const lastDealRequest = new Map<number, number>();

export function registerCommands(bot: Telegraf): void {
  bot.start(async (ctx) => {
    saveChatId(ctx.chat.id);
    await ctx.reply(
      '¡Hola! 🎮 Soy tu bot de ofertas de Steam.\n\n'
      + 'Cada día te enviaré las mejores ofertas filtradas por IA: solo AAA, '
      + 'indie premiados y juegos que realmente valen la pena.\n\n'
      + 'Comandos:\n'
      + '/deals — Ver ofertas ahora mismo\n'
      + '/stop  — Dejar de recibir notificaciones\n'
      + '/help  — Ver ayuda',
    );
  });

  bot.command('deals', async (ctx) => {
    const chatId = ctx.chat.id;
    const now = Date.now();
    const last = lastDealRequest.get(chatId) ?? 0;
    const elapsed = now - last;

    if (elapsed < config.rateLimit.dealsCooldownMs) {
      const remaining = Math.ceil((config.rateLimit.dealsCooldownMs - elapsed) / 1000);
      await ctx.reply(`⏳ Espera ${remaining}s antes de volver a consultar ofertas.`);
      return;
    }

    lastDealRequest.set(chatId, now);
    await ctx.sendChatAction('typing');

    try {
      const result = await fetchDeals();

      if (result.status === 'ai_error') {
        await ctx.reply(
          '⚠️ El servicio de curación con IA no está disponible ahora mismo.\n'
          + 'Intenta de nuevo en unos minutos.',
        );
        return;
      }

      if (result.status === 'no_deals' || result.deals.length === 0) {
        await ctx.reply('🎮 No hay ofertas destacadas en este momento. ¡Vuelve mañana!');
        return;
      }

      const copRate = await getExchangeRate();
      const keyboard = buildDealsKeyboard(result.deals);
      await ctx.reply(formatDealsMessage(result.deals, copRate), {
        parse_mode: 'HTML',
        ...keyboard,
      });
    } catch (err) {
      await ctx.reply('❌ Hubo un error inesperado. Intenta más tarde.');
      // Log mínimo: no volcar el stack ni el objeto de error completo
      console.error('[/deals] Error inesperado:', (err as Error).message ?? 'sin mensaje');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      '🤖 <b>Steam Deals Bot</b>\n\n'
      + 'Busco ofertas en Steam y uso IA para filtrar solo los juegos '
      + 'que realmente valen la pena: AAA, indie reconocidos, juegos trending.\n\n'
      + '<b>Comandos:</b>\n'
      + '/start — Activar notificaciones diarias\n'
      + '/deals — Ver mejores ofertas ahora\n'
      + '/stop  — Dejar de recibir notificaciones\n'
      + '/help  — Esta ayuda',
      { parse_mode: 'HTML' },
    );
  });

  bot.command('stop', async (ctx) => {
    // Baja inmediata: elimina el chat_id de la lista de suscriptores.
    // El usuario puede volver a suscribirse en cualquier momento con /start.
    removeChatId(ctx.chat.id);
    await ctx.reply(
      '✅ Te diste de baja de las notificaciones diarias.\n'
      + 'Puedes volver a activarlas cuando quieras con /start.',
    );
  });
}
