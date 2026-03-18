import { Telegraf } from 'telegraf';
import { clearStaleSnapshot } from '../cache/snapshotCache';
import { config } from '../config';
import { startScheduler } from '../scheduler/cronJobs';
import { registerCommands } from './commands';

// Limpiar snapshot obsoleto al arrancar — evita servir datos de un día anterior
// si el proceso estuvo caído más de 24h
clearStaleSnapshot();

const bot = new Telegraf(config.telegram.botToken);

registerCommands(bot);
startScheduler();

bot.launch().then(() => {
  console.log('🚀 Steam Deals Bot iniciado correctamente');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
