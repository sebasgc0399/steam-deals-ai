# Steam Deals Bot 🎮

Bot de Telegram para descubrir ofertas de Steam con criterio editorial real. En lugar de disparar cualquier descuento, el pipeline combina CheapShark, filtros deterministas, persistencia local en SQLite y OpenAI para entregar una selección corta, útil y accionable.

La meta es simple: menos spam, menos ruido y más juegos que sí valen la pena comprar.

## Qué hace diferente a este bot

- Descubre ofertas desde CheapShark y se queda solo con juegos que pasan umbrales reales de descuento, precio y calidad.
- Usa SQLite para persistir suscriptores, evitar repetir juegos notificados recientemente y cachear el snapshot diario del pipeline.
- Usa OpenAI como curador experto para descartar basura, priorizar juegos reconocidos y explicar por qué cada recomendación merece atención.
- Entrega una UI clara en Telegram con títulos clickeables hacia Steam, precios en COP/USD y alertas visuales para descuentos extremos.

## Arquitectura

```text
CheapShark (Source)
        ->
SQLite (Dedup + Daily Snapshot Cache Check)
        ->
OpenAI (Intelligence)
        ->
Telegram (UI)
```

### Flujo real de datos

1. CheapShark entrega deals de Steam ordenados por relevancia.
2. `rulesFilter` aplica filtros duros de descuento mínimo, precio máximo y calidad basada en Metacritic o Steam Rating.
3. SQLite consulta `notified_items` para deduplicación y evita reenviar juegos ya notificados dentro de la ventana configurada.
4. El sistema genera un hash de los candidatos y compara contra `daily_snapshot`.
5. Si el hash no cambió, reutiliza el snapshot del día sin volver a llamar a OpenAI.
6. Si hay cambios, OpenAI selecciona qué juegos pasan y genera una razón corta en español por cada recomendación.
7. `formatMessage` construye el HTML final y Telegram lo entrega como respuesta directa o broadcast diario.

## Persistencia con SQLite

El bot usa SQLite embebido vía `better-sqlite3` y guarda su estado en `data/bot.db`. No depende de una base externa ni de un servicio adicional para operar en producción ligera.

### Tablas principales

- `subscribers`: almacena los `chat_id` suscritos para enviar broadcasts diarios.
- `notified_items`: registra juegos ya notificados para evitar spam y repetición dentro de `DEDUP_DAYS`.
- `daily_snapshot`: guarda el snapshot diario exitoso, junto con `candidates_hash`, `payload_json` y `created_at`.

### Qué resuelve esta capa

- Persistencia estable de suscriptores entre reinicios.
- Deduplicación por `steamAppID` para no castigar al usuario con la misma oferta una y otra vez.
- Reutilización del análisis del día cuando la lista de candidatos no cambió.
- Fallback operativo cuando la IA falla pero ya existe un snapshot fresco válido.

## Curación con OpenAI

La capa de IA usa el SDK oficial de OpenAI y, por defecto, trabaja con `gpt-4o-mini`. El modelo es configurable mediante `OPENAI_MODEL`, así que el README no lo presenta como un valor hardcodeado.

### Cómo actúa el curador experto

- Recibe solo metadatos relevantes del juego: `steamAppID`, título, Metacritic y señales de rating en Steam.
- No decide precios ni enlaces: esos datos siempre se reconstruyen desde CheapShark.
- Devuelve un JSON estricto con `selectedIds` y `reasons`.
- Opera con `temperature: 0` para mantener resultados repetibles y hacer confiable la caché por hash.
- Descarta juegos sin reconocimiento, asset flips, basura genérica y deals sin señales claras de calidad.

### Por qué mejora el resultado

CheapShark es excelente como fuente de descubrimiento, pero no como editor. La IA funciona como un curador gamer: separa “está barato” de “vale la pena comprarlo”, prioriza juegos AAA, AA con buena reputación, franquicias conocidas, indies fuertes y títulos con comunidad real.

Cuando la respuesta de OpenAI no es válida, el pipeline no inventa resultados: registra el error y reutiliza el snapshot fresco del día si existe. Si no existe, evita enviar un broadcast engañoso.

## Experiencia en Telegram

La salida final está optimizada para lectura rápida y acción inmediata.

- Cada título es clickeable y apunta directo a `https://store.steampowered.com/app/{steamAppID}`.
- Los descuentos de `>= 90%` muestran una alerta visual `🚨` para destacar oportunidades extremas.
- Cada bloque muestra precio normal tachado, precio final en COP, referencia en USD y porcentaje de descuento.
- La línea `💡` resume por qué el juego es una buena compra según la curación de IA.
- El encabezado incluye fecha localizada en `America/Bogota` y el total de juegos seleccionados por IA.

## Stack técnico

- `Node.js` + `TypeScript`
- `Telegraf` para Telegram
- `OpenAI SDK` para la curación final
- `better-sqlite3` para persistencia local
- `node-cron` para ejecución programada
- `axios` para CheapShark y tasa USD/COP
- `dotenv` para configuración por entorno
- `tsx` y `tsc` para desarrollo y build

## Instalación

### Requisitos

- `Node.js`
- `npm`
- Un bot de Telegram creado con `@BotFather`
- Una `OPENAI_API_KEY`

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd steam-deals-ai
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crea tu `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

### Variables disponibles

| Variable | Requerida | Default | Descripción |
| --- | --- | --- | --- |
| `BOT_TOKEN` | Sí | - | Token del bot de Telegram. |
| `OPENAI_API_KEY` | Sí | - | API key de OpenAI. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Modelo de curación usado por OpenAI. |
| `MIN_DISCOUNT_PERCENT` | No | `50` | Descuento mínimo requerido para considerar un deal. |
| `MIN_METACRITIC_SCORE` | No | `70` | Metacritic mínimo para aprobar por esa vía. |
| `MIN_STEAM_RATING_PERCENT` | No | `70` | Rating mínimo en Steam para aprobar por esa vía. |
| `MAX_PRICE_USD` | No | `60` | Precio final máximo permitido. |
| `DEALS_PAGE_SIZE` | No | `60` | Cantidad de deals a traer desde CheapShark. |
| `DEDUP_DAYS` | No | `7` | Días durante los cuales un juego no vuelve a notificarse. |
| `CRON_SCHEDULE` | No | `0 9 * * *` | Expresión cron para el broadcast diario. |

### 4. Ejecutar el bot

Desarrollo:

```bash
npm run dev
```

Compilar:

```bash
npm run build
```

Producción:

```bash
npm start
```

Prueba manual del pipeline:

```bash
npm run test:deals
```

## Scripts de NPM

| Script | Descripción |
| --- | --- |
| `npm run dev` | Ejecuta el bot con `tsx watch` sobre `src/bot/index.ts`. |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm start` | Inicia la versión compilada desde `dist/bot/index.js`. |
| `npm run test:deals` | Ejecuta el pipeline y permite probar el mensaje final sin levantar todo el bot. |

## Comandos del bot

| Comando | Descripción |
| --- | --- |
| `/start` | Suscribe el `chat_id` y activa las notificaciones diarias. |
| `/deals` | Devuelve el snapshot fresco del día o ejecuta el pipeline si hace falta. |
| `/stop` | Elimina la suscripción y deja de recibir broadcasts. |

## Operación en producción

- El bot arranca con Telegraf en modo polling.
- El scheduler corre con `node-cron` usando la zona horaria `America/Bogota`.
- Al iniciar, se limpia cualquier snapshot obsoleto de días anteriores.
- `/deals` tiene cooldown por chat para evitar abuso y proteger costo operativo.
- Los broadcasts aplican un pequeño delay entre envíos y eliminan chats inválidos de forma automática.
- La tasa USD/COP se cachea en memoria y tiene fallback seguro si el proveedor externo falla.

## Filosofía del proyecto

Steam Deals Bot no intenta ser un scraper masivo de descuentos. Es una capa editorial encima de CheapShark: una combinación de reglas duras, memoria local y criterio asistido por IA para que el usuario vea pocas ofertas, pero con mejor señal.
