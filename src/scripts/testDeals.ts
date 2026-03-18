import { config } from '../config'; // valida variables de entorno al importar
import { getExchangeRate } from '../services/currencyService';
import { fetchAndMarkDeals, fetchDeals } from '../services/dealsService';
import { formatDealsMessage } from '../utils/formatMessage';

// true  -> fetchDeals (sin escribir en notified_games.json)
// false -> fetchAndMarkDeals (prueba tambien la deduplicacion)
const DRY_RUN = true;

async function main() {
  console.log(`🔍 Buscando y filtrando ofertas... (dry run: ${DRY_RUN})\n`);

  const copRate = await getExchangeRate();

  if (DRY_RUN) {
    const result = await fetchDeals(); // retorna PipelineResult

    if (result.status === 'ai_error') {
      console.error(`❌ Fallo de IA: ${result.reason}`);
      process.exit(1);
    }
    if (result.status === 'no_deals') {
      console.log('🎮 Sin ofertas destacadas en este ciclo.');
      return;
    }

    console.log('--- MENSAJE FINAL (HTML) ---\n');
    console.log(formatDealsMessage(result.deals, copRate));
    console.log('\n[telegram] Los títulos ahora incluyen enlace directo a Steam.');
    console.log(`\n✅ ${result.deals.length} juegos seleccionados.`);
  } else {
    // fetchAndMarkDeals ahora retorna PipelineResult (mismo contrato que fetchDeals)
    const result = await fetchAndMarkDeals();
    if (result.status === 'ai_error') {
      console.error(`❌ Fallo de IA: ${result.reason}`);
      process.exit(1);
    }
    if (result.status === 'no_deals') {
      console.log('🎮 Sin ofertas destacadas en este ciclo.');
      return;
    }

    console.log('--- MENSAJE FINAL (HTML) ---\n');
    console.log(formatDealsMessage(result.deals, copRate));
    console.log('\n[telegram] Broadcast listo con enlaces directos a Steam en el texto.');
    console.log(`\n✅ ${result.deals.length} juegos seleccionados y marcados como notificados.`);
  }
}

main().catch(console.error);
