import cron from 'node-cron';
import { config } from '../config';
import { notifyAllUsers } from '../notifier/telegramNotifier';
import { getExchangeRate } from '../services/currencyService';
import { fetchAndMarkDeals } from '../services/dealsService';
import { formatDealsMessage } from '../utils/formatMessage';

export function startScheduler(): void {
  console.log(`\u23F0 Cron activado con schedule: "${config.cron.schedule}"`);

  cron.schedule(config.cron.schedule, async () => {
    console.log(`[${new Date().toISOString()}] \u{1F504} Ejecutando busqueda de ofertas...`);
    try {
      const result = await fetchAndMarkDeals();

      if (result.status === 'ai_error') {
        // No enviar broadcast: un mensaje "no hay ofertas" seria enganoso.
        // El error ya fue logueado en runPipeline(); aqui solo registramos el ciclo fallido.
        console.error(`\u274C Cron: broadcast omitido por fallo de IA. Razon: ${result.reason}`);
        return;
      }

      if (result.status === 'no_deals' || result.deals.length === 0) {
        // Sin ofertas que superen los filtros hoy: silencio correcto, no es un error.
        console.log('\u{1F4ED} Cron: sin ofertas destacadas hoy. No se envia broadcast.');
        return;
      }

      const copRate = await getExchangeRate();
      const message = formatDealsMessage(result.deals, copRate);
      await notifyAllUsers(message);
      console.log(`\u2705 Broadcast enviado: ${result.deals.length} ofertas.`);
    } catch (err) {
      const msg = (err as Error).message ?? 'sin mensaje';
      console.error(`\u274C Error inesperado en cron: ${msg}`);
    }
  }, { timezone: 'America/Bogota' });
}
