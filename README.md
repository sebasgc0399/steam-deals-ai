# Steam Deals Notifier

[Abrir bot en Telegram](https://www.google.com/search?q=https://t.me/steamdeals_notify_bot)

Bot de Telegram para descubrir ofertas de Steam con menos ruido y mejor criterio. El proyecto consulta CheapShark, aplica filtros deterministas, guarda estado en SQLite y usa GPT-4o-mini solo cuando realmente hace falta curar candidatos.

## 📸 Vista Previa

| Inicio (`/start`) | Ofertas (`/deals`) | Logs (`cron` / pipeline) |
| --- | --- | --- |
| ![Inicio del bot](screenshot_start.png) | ![Ofertas filtradas](screenshot_deals.png) | ![Logs del sistema](screenshot_logs.png) |

## ✨ Caracteristicas

- Filtros por `Metacritic` y `Steam Rating` con logica OR, junto con descuento minimo y precio maximo.
- Deduplicacion de 7 dias para no reenviar el mismo `steamAppID` una y otra vez.
- Analisis con IA usando `gpt-4o-mini` para quedarse solo con juegos relevantes y generar una razon breve.
- Snapshot diario con hash de candidatos para reutilizar resultados y evitar llamadas repetidas a OpenAI.
- Broadcast diario por cron y consulta manual con `/deals`.
- Formato final para Telegram con enlaces directos a Steam y precios en COP/USD.

## 🧰 Tecnologias

### Core

- `Node.js`
- `TypeScript`
- `SQLite` con `better-sqlite3`
- `PM2`

### APIs utilizadas

- `CheapShark API`: fuente de ofertas de Steam.
- `OpenAI API`: curacion final con `gpt-4o-mini`.

### Runtime complementario

- `Telegraf`: comandos y envio de mensajes en Telegram.
- `node-cron`: programacion diaria del bot.
- `axios`: integracion HTTP.
- `open.er-api.com`: conversion `USD -> COP` con cache en memoria de 12 horas y fallback seguro.

## 🏗️ Arquitectura

```text
CheapShark
   ->
Reglas duras + deduplicacion en SQLite
   ->
Snapshot diario + hash de candidatos
   ->
OpenAI (solo si hay cambios)
   ->
Telegram
```

Persistencia actual en SQLite:

- `subscribers`: chat IDs suscritos.
- `notified_items`: juegos ya enviados dentro de la ventana de deduplicacion.
- `daily_snapshot`: ultimo resultado exitoso, hash de candidatos y payload serializado.

## ⚙️ Instalacion en Ubuntu

### 1. Instalar Node.js y npm

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 2. Instalar PM2

```bash
sudo npm install -g pm2
pm2 -v
```

### 3. Clonar el repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd steam-deals-ai
```

### 4. Instalar dependencias

```bash
npm install
```

### 5. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

### 6. Compilar

```bash
npm run build
```

### 7. Ejecutar con PM2

```bash
pm2 start dist/bot/index.js --name steam-bot
pm2 save
```

### 8. Activar autoarranque al reiniciar el servidor

```bash
pm2 startup systemd
```

Ejecuta el comando adicional que imprime PM2 y luego:

```bash
pm2 save
```

Comandos operativos utiles:

```bash
pm2 logs steam-bot
pm2 restart steam-bot
pm2 status
```

## 🔐 Variables de entorno

Ejemplo recomendado de `.env`:

```dotenv
# Telegram Bot Token
BOT_TOKEN=123456789:AbCdefGhIJKlmNoPQRsTUVwxyZ

# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini

# Filtros capa 1 (sin costo)
MIN_DISCOUNT_PERCENT=50
MIN_METACRITIC_SCORE=70
MIN_STEAM_RATING_PERCENT=70
MAX_PRICE_USD=60
DEALS_PAGE_SIZE=60

# Deduplicacion
DEDUP_DAYS=7

# Scheduler
CRON_SCHEDULE=0 9 * * *

# SQLite (opcional; si no se define, usa ./data/bot.db)
DATABASE_PATH=./data/bot.db
```

### Explicacion del cron de las 9:00 AM

- `CRON_SCHEDULE=0 9 * * *` significa: todos los dias a las `9:00 AM`.
- El scheduler se ejecuta en la zona horaria `America/Bogota`, asi que la hora se interpreta en Colombia.
- Si despliegas el bot en un servidor con otra zona horaria, el cron sigue respetando Bogota porque esa timezone se fija en el codigo.

## 🧠 Logica tecnica y ahorro de saldo de API

El orden de los filtros importa. La idea del proyecto no es mandar todo a GPT, sino usar OpenAI solo despues de reducir el espacio de busqueda con reglas baratas y reproducibles.

### Flujo real del pipeline

1. `cheapsharkClient` consulta ofertas de Steam con `storeID=1`, `onSale=1`, `sortBy=Deal Rating`, `upperPrice` y `pageSize`.
2. `rulesFilter` aplica filtros deterministas:
   - descuento minimo
   - precio maximo
   - aprobacion por `Metacritic >= umbral` o `Steam Rating >= umbral`
3. Antes de IA, el pipeline excluye juegos ya notificados segun `DEDUP_DAYS`.
4. Con los candidatos restantes, se calcula un hash determinista.
5. Si ese hash coincide con el `daily_snapshot`, se reutiliza el resultado anterior y no se llama a OpenAI.
6. Solo si el conjunto cambio, `openaiFilter` invoca `gpt-4o-mini` con un payload reducido: `steamAppID`, `title`, `metacriticScore`, `steamRatingPercent` y `steamRatingText`.
7. El modelo devuelve solo `selectedIds` y `reasons`; los precios, links y demas datos visibles siempre salen de CheapShark.
8. El snapshot exitoso se guarda en SQLite para que `/deals` y el cron puedan reutilizarlo.

### Por que esto ahorra saldo

- `/deals` usa estrategia `snapshot-first`: si ya existe un snapshot fresco del dia, responde sin tocar CheapShark ni OpenAI.
- La deduplicacion ocurre antes de GPT, asi que no se gastan tokens en juegos que el usuario ya recibio.
- El hash de candidatos evita repetir la misma curacion si la oferta no cambio.
- Si OpenAI falla y existe un snapshot fresco, el sistema reutiliza ese snapshot en lugar de rehacer el analisis.

En terminos practicos: la capa de IA no actua como primer filtro, sino como segunda capa editorial. Ese orden reduce costo, mejora consistencia y simplifica el fallback.

## 🤖 Comandos del bot

| Comando | Funcion |
| --- | --- |
| `/start` | Registra el `chat_id` y activa las notificaciones diarias. |
| `/deals` | Devuelve el snapshot fresco del dia o ejecuta el pipeline si hace falta. |
| `/help` | Muestra ayuda resumida del bot. |
| `/stop` | Elimina la suscripcion del chat. |

## 🧪 Scripts utiles

| Script | Descripcion |
| --- | --- |
| `npm run dev` | Ejecuta el bot en desarrollo con `tsx watch`. |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm start` | Inicia la version compilada. |
| `npm run start:prod` | Alias de inicio en produccion. |
| `npm run test:deals` | Prueba el pipeline y el mensaje final sin depender del flujo completo del bot. |

## 📁 Estructura del proyecto

```text
src/
├── bot/                # Inicio del bot y comandos
├── cache/              # Deduplicacion y snapshot diario
├── db/                 # Conexion y esquema SQLite
├── notifier/           # Broadcast a suscriptores
├── scheduler/          # Cron diario
├── services/           # CheapShark, OpenAI, reglas y divisa
├── types/              # Tipos TypeScript
└── utils/              # Formateo del mensaje final
```

## 🚀 Operacion en produccion

- El bot arranca con `Telegraf` en modo polling.
- El cron corre en `America/Bogota`.
- Al iniciar, se limpia cualquier snapshot obsoleto.
- `/deals` tiene cooldown por chat para evitar abuso.
- Los broadcasts introducen un pequeno delay entre envios y limpian chats invalidos de forma automatica.
- La base SQLite se crea sola en `./data/bot.db` si no defines `DATABASE_PATH`.

## 🐳 Docker

El repositorio incluye un `Dockerfile` multi-stage:

- compila el proyecto en una etapa de build,
- conserva solo dependencias de produccion,
- monta `/data` como volumen para persistir SQLite,
- y arranca el bot con `node dist/bot/index.js`.

## 📌 Notas finales

- Para recibir mensajes, el usuario debe iniciar conversacion con el bot usando `/start`.
- El proyecto actual ya usa SQLite; no depende de archivos JSON para snapshot, suscriptores o deduplicacion.
- Si quieres probar solo el pipeline de ofertas antes de desplegar Telegram, usa `npm run test:deals`.
