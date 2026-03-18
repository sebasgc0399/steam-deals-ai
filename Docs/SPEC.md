# 🎮 Steam Deals Bot — Documentación del Proyecto

> Bot de Telegram que notifica ofertas de Steam filtradas con un sistema híbrido: reglas deterministas primero y GPT-4o-mini como segunda capa de curación. Prioriza juegos AAA, títulos reconocidos e indie destacados. Incluye deduplicación para no repetir juegos ya notificados.

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Stack Tecnológico](#stack-tecnológico)
4. [Estructura del Proyecto](#estructura-del-proyecto)
5. [APIs y Servicios Externos](#apis-y-servicios-externos)
6. [Variables de Entorno](#variables-de-entorno)
7. [Flujo de Datos](#flujo-de-datos)
8. [Módulos del Sistema](#módulos-del-sistema)
9. [Comandos del Bot](#comandos-del-bot)
10. [Sistema de Notificaciones Automáticas](#sistema-de-notificaciones-automáticas)
11. [Prompt de IA](#prompt-de-ia)
12. [Guía de Configuración Inicial](#guía-de-configuración-inicial)
13. [Scripts del Proyecto](#scripts-del-proyecto)
14. [Consideraciones de Costo](#consideraciones-de-costo)
15. [Roadmap Futuro](#roadmap-futuro)
16. [Notas para Claude Code](#notas-para-claude-code)

---

## Visión General

El bot consulta periódicamente la **CheapShark API** (gratuita y sin autenticación) para obtener ofertas activas de Steam con descuentos significativos. La lista pasa por un **sistema de filtro en dos capas**: primero reglas deterministas (Metacritic, Steam Rating, precio, descuento) y luego **GPT-4o-mini** como capa de curación para los candidatos que ya pasaron el corte. El resultado filtrado se envía como mensaje formateado al usuario vía **Telegram**, sin repetir juegos ya notificados recientemente.

### ¿Qué problema resuelve?

Steam tiene miles de juegos en oferta en cualquier momento. Sin filtro, el ruido es enorme. El filtro híbrido combina criterios objetivos con el conocimiento contextual de la IA: las reglas se encargan de lo que es medible (score, precio, descuento) y GPT se encarga de lo que no lo es (¿es una franquicia conocida? ¿fue viral? ¿tiene reputación en la comunidad gamer?).

### Decisión de diseño: IA como segunda capa, no juez único

Poner la IA como único juez genera inconsistencia: un día puede dejar pasar un buen juego y otro día destacar uno mediocre. El filtro híbrido resuelve esto: las reglas garantizan un piso de calidad objetiva, y la IA solo decide entre los candidatos que ya cumplen ese piso. Esto también reduce tokens enviados a OpenAI, bajando el costo por ejecución.

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────┐
│                   USUARIO TELEGRAM                       │
│               (comandos / notificaciones)                │
└─────────────────────┬───────────────────────────────────┘
                      │
               ┌──────▼──────┐
               │   Telegraf  │  ← Framework bot
               │  (Bot Core) │
               └──────┬──────┘
                      │
       ┌──────────────┼──────────────┐
       │              │              │
┌──────▼─────┐ ┌──────▼─────┐ ┌─────▼──────┐
│  CronJob   │ │  Commands  │ │ Notifier   │
│ Scheduler  │ │  Handler   │ │  Service   │
└──────┬─────┘ └──────┬─────┘ └─────┬──────┘
       │              │             │
       └──────┬────────┘            │
              │                     │
       ┌──────▼──────┐              │
       │ DealsService│◄─────────────┘
       │(Orquestador)│
       └──────┬──────┘
              │
   ┌──────────┴──────────────────────┐
   │                                 │
┌──▼─────────────────┐    ┌──────────▼──────────┐
│  CAPA 1: Reglas    │    │  CAPA 2: IA         │
│  CheapShark API    │───►│  OpenAI gpt-4o-mini │
│  + filtros duros   │    │  (curación final)   │
│  (score/precio/    │    └──────────┬──────────┘
│   descuento/dedup) │              │
└────────────────────┘    ┌─────────▼──────────┐
                          │  Deduplication     │
                          │  Cache (JSON/Set)  │
                          └────────────────────┘
```

---

## Stack Tecnológico

| Tecnología | Versión | Rol |
|---|---|---|
| **Node.js** | >= 20.x | Runtime |
| **TypeScript** | ^5.x | Lenguaje |
| **Telegraf** | ^4.x | Framework Telegram Bot |
| **openai** | ^4.x | SDK oficial OpenAI |
| **node-cron** | ^3.x | Scheduler (notificaciones automáticas) |
| **axios** | ^1.x | HTTP client para CheapShark |
| **dotenv** | ^16.x | Variables de entorno |
| **tsx** | ^4.x | Ejecutar TypeScript en dev sin build |

### Por qué Telegraf

Telegraf es el framework más maduro con mejor soporte TypeScript nativo para Node.js. Tiene middleware system, manejo de contexto robusto, y permite enviar mensajes de forma programática fuera del ciclo request/response — esencial para el cron. Su clase `Telegram` separada permite enviar mensajes sin necesidad de un contexto activo.

---

## Estructura del Proyecto

```
steam-deals-bot/
├── src/
│   ├── bot/
│   │   ├── index.ts              # Inicializa y lanza el bot
│   │   └── commands.ts           # Registro de comandos del bot
│   ├── services/
│   │   ├── dealsService.ts       # Orquestador con caché por hash + snapshot
│   │   ├── cheapsharkClient.ts   # Fetch y parseo de CheapShark API
│   │   ├── rulesFilter.ts        # CAPA 1: filtros deterministas puros
│   │   └── openaiFilter.ts       # CAPA 2: curación con GPT-4o-mini
│   ├── scheduler/
│   │   └── cronJobs.ts           # Cron diario de notificaciones
│   ├── notifier/
│   │   └── telegramNotifier.ts   # Envío de mensajes con rate limiting y lifecycle
│   ├── cache/
│   │   ├── deduplication.ts      # Registro de juegos ya notificados (Set<string>)
│   │   └── snapshotCache.ts      # Último resultado exitoso + hash de candidatos
│   ├── types/
│   │   └── index.ts              # Tipos TypeScript compartidos
│   ├── utils/
│   │   └── formatMessage.ts      # Formatea el mensaje final (HTML + escapeHtml)
│   └── config.ts                 # Única fuente de env vars con validación de rangos
├── data/
│   ├── chat_ids.json             # Chat IDs registrados (gitignoreado)
│   ├── notified_games.json       # steamAppIDs ya notificados con timestamp (gitignoreado)
│   └── snapshot.json             # Último análisis exitoso del día (gitignoreado)
├── .env                          # Variables de entorno (NO commitear)
├── .env.example                  # Plantilla de variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## APIs y Servicios Externos

### 1. CheapShark API

- **Base URL:** `https://www.cheapshark.com/api/1.0`
- **Autenticación:** Ninguna — completamente pública y gratuita
- **Documentación:** https://apidocs.cheapshark.com

#### Endpoint principal: `/deals`

```
GET https://www.cheapshark.com/api/1.0/deals
```

**Parámetros de query relevantes:**

| Parámetro | Tipo | Descripción | Valor recomendado |
|---|---|---|---|
| `storeID` | string | ID de la tienda | `"1"` (Steam) |
| `upperPrice` | number | Precio máximo en USD | `60` |
| `metacritic` | number | Score mínimo en Metacritic | `70` |
| `sortBy` | string | Criterio de ordenamiento | `"Savings"` |
| `onSale` | number | Solo items en oferta | `1` |
| `pageSize` | number | Resultados por página (máx 60) | `60` |
| `pageNumber` | number | Paginación | `0` |

**Ejemplo de response (un item):**

```json
{
  "internalName": "CYBERPUNK2077",
  "title": "Cyberpunk 2077",
  "metacriticScore": "86",
  "steamRatingText": "Very Positive",
  "steamRatingPercent": "79",
  "steamRatingCount": "589123",
  "salePrice": "19.99",
  "normalPrice": "59.99",
  "isOnSale": "1",
  "savings": "66.661110",
  "steamAppID": "1091500",
  "thumb": "https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/capsule_sm_120.jpg",
  "dealID": "some_deal_id_hash"
}
```

**Cómo construir el link a la oferta:**

```
https://www.cheapshark.com/redirect?dealID={dealID}
```

---

### 2. OpenAI API (GPT-4o-mini)

- **Base URL:** `https://api.openai.com/v1`
- **Autenticación:** Bearer Token (`OPENAI_API_KEY`)
- **Endpoint:** `POST /chat/completions`
- **Modelo recomendado:** `gpt-4o-mini` (barato, más que suficiente para clasificación)
- **Documentación:** https://platform.openai.com/docs/api-reference/chat

**Instalación del SDK:**

```bash
npm install openai
```

**Uso con JSON output forzado** *(snippet ilustrativo — en el proyecto real se usa `config.openai.apiKey`)*:

```typescript
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); // solo ejemplo

const completion = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(deals) },
  ],
  response_format: { type: 'json_object' },
  temperature: 0, // 0 para repetibilidad — ver openaiFilter.ts
});

const result = JSON.parse(completion.choices[0].message.content!);
```

---

### 3. Telegram Bot API (via Telegraf)

- **Autenticación:** Bot Token (obtenido de @BotFather)
- **Modo de operación:** Long Polling
- **Documentación:** https://core.telegram.org/bots/api

**Instalación:**

```bash
npm install telegraf
```

**Envío de mensaje programático** *(snippet ilustrativo — en el proyecto real se usa `config.telegram.botToken`)*:

```typescript
import { Telegram } from 'telegraf';

const telegram = new Telegram(process.env.BOT_TOKEN!); // solo ejemplo
await telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
```

**Importante:** Telegram solo permite que un bot envíe mensajes a usuarios que hayan iniciado conversación con él primero (`/start`). El `chat_id` se obtiene en ese momento y debe persistirse.

---

## Variables de Entorno

Archivo `.env.example`:

```env
# Telegram Bot Token (obtenido de @BotFather en Telegram)
BOT_TOKEN=123456789:AbCdefGhIJKlmNoPQRsTUVwxyZ

# OpenAI API Key (plataforma OpenAI)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxx

# Modelo a usar (gpt-4o-mini es el más económico y suficiente)
OPENAI_MODEL=gpt-4o-mini

# ─── Filtros CAPA 1 (deterministas, sin costo) ─────────────
MIN_DISCOUNT_PERCENT=50        # Descuento mínimo requerido (%)
MIN_METACRITIC_SCORE=70        # Score mínimo de Metacritic (0 = ignorar)
MIN_STEAM_RATING_PERCENT=70    # Steam rating % mínimo
MAX_PRICE_USD=60               # Precio máximo tras descuento
DEALS_PAGE_SIZE=60             # Cuántos deals traer de CheapShark (máx 60)

# ─── Deduplicación ─────────────────────────────────────────
DEDUP_DAYS=7                   # No repetir un juego por N días

# ─── Scheduler ─────────────────────────────────────────────
# Formato cron estándar. Ver https://crontab.guru
CRON_SCHEDULE=0 9 * * *        # Todos los días a las 9:00am (Colombia UTC-5)
```

---

## Flujo de Datos

### Flujo del cron diario (broadcast automático)

```
1. TRIGGER: Cron diario (config.cron.schedule)
      │
      ▼
2. dealsService.fetchAndMarkDeals()  ← siempre ejecuta pipeline completo
   │
   ├─ cheapsharkClient.fetchSteamDeals()
   │  → timeout: config.http.cheapsharkTimeoutMs
   │
   ├─ deduplication.getNotifiedIds() → Set<string>
   │
   ├─ rulesFilter.applyHardFilters(deals, opts, notifiedIds)  [CAPA 1 — puro]
   │  → OR: metacriticScore >= N  OR  steamRatingPercent >= N
   │  → Resultado: Deal[] candidatos  |  { status: 'no_deals' }
   │
   ├─ snapshotCache.hashCandidates(candidates) → hash string
   │
   ├─ Si hash == snapshot.candidatesHash
   │  → ✅ Reutilizar selección anterior — SIN llamar a GPT
   │
   └─ Si hash cambió → openaiFilter.filterDealsWithAI()  [CAPA 2 — GPT]
      → temperature: 0 (determinista)
      → GPT retorna { selectedIds[], reasons{} }
      → Validar IDs contra candidatos enviados
      → buildFilteredDeals() desde candidatos (nunca desde GPT)
      → snapshotCache.saveSnapshot()  ← persiste para /deals y fallback
         │
         ▼
3. deduplication.markAsNotified()  ← solo steamAppID + timestamp
      │
      ▼
4. formatDealsMessage()  → HTML con escapeHtml()
      │
      ▼
5. telegramNotifier.notifyAllUsers()
   → 50ms delay entre envíos
   → Promise.race con telegramTimeoutMs
   → Errores permanentes → removeChatIds()
```

### Flujo del comando `/deals` (consulta manual)

```
1. TRIGGER: Usuario envía /deals
      │
      ▼
2. Rate limit: 45s cooldown por chat_id (Map en memoria)
      │
      ▼
3. dealsService.fetchDeals() — snapshot first
   │
   ├─ snapshotCache.loadSnapshot()
   │
   ├─ Si snapshot existe y es de hoy
   │  → 📦 Servir directamente — SIN fetch, SIN GPT, SIN costo
   │
   └─ Si snapshot vencido o no existe
      → runPipeline() completo (mismo flujo que el cron)
         Si IA falla → fallback al último snapshot válido
      │
      ▼
4. PipelineResult switch:
   → 'ok'       : formatDealsMessage + ctx.reply (HTML)
   → 'no_deals' : "No hay ofertas destacadas en este momento."
   → 'ai_error' : "El servicio de curación con IA no está disponible."
```

### Cuándo se llama realmente a GPT

| Situación | ¿Llama a GPT? |
|---|---|
| `/deals` mismo día que el cron | ❌ Sirve snapshot |
| `/deals` múltiples veces al día | ❌ Sirve snapshot |
| Cron diario, candidatos iguales al día anterior | ❌ Reutiliza hash |
| Cron diario, candidatos cambiaron | ✅ Una llamada |
| IA falla + snapshot existe | ❌ Fallback a snapshot |
| Primera ejecución (sin snapshot) | ✅ Una llamada |

---

## Módulos del Sistema

### `src/types/index.ts`

```typescript
// Response de CheapShark API
export interface Deal {
  title: string;
  metacriticScore: string;
  steamRatingText: string;
  steamRatingPercent: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  steamAppID: string;
  dealID: string;
  thumb: string;
}

// Deal ya filtrado y enriquecido — datos vienen de los candidatos originales, no de GPT
export interface FilteredDeal {
  title: string;
  steamAppID: string;
  salePrice: string;
  normalPrice: string;
  savingsPercent: number;
  metacriticScore: number;
  steamRatingText: string;
  dealUrl: string;
  reason: string; // único campo que aporta GPT
}

// Entrada de deduplicación — solo lo estrictamente necesario para deduplicar
export interface NotifiedGame {
  steamAppID: string;
  notifiedAt: string; // ISO date string
  // ⚠️ title NO se almacena — no es necesario para la función de deduplicación
}

// GPT solo decide quién pasa y aporta la razón — los datos reales vienen de los candidatos
export interface AISelection {
  selectedIds: string[];           // steamAppIDs elegidos
  reasons: Record<string, string>; // steamAppID → razón breve en español
}

// Resultado tipado de la capa IA — distingue "sin resultados" de "fallo"
export type AIFilterResult =
  | { status: 'ok';    selection: AISelection }
  | { status: 'error'; reason: string         };

// Resultado del pipeline completo — propagado hasta el caller (commands.ts)
export type PipelineResult =
  | { status: 'ok';       deals: FilteredDeal[] }
  | { status: 'no_deals'                        }
  | { status: 'ai_error'; reason: string        };

// Snapshot del último análisis exitoso del día.
// /deals lo sirve directamente; el cron lo actualiza cuando hay cambios.
export interface DailySnapshot {
  deals:          FilteredDeal[];   // resultado final ya formateado
  candidatesHash: string;           // hash de candidatos → evita re-llamar a GPT si no cambiaron
  createdAt:      string;           // ISO — para saber si el snapshot es del día de hoy
}
```

---

### `src/services/rulesFilter.ts` — CAPA 1: Filtros Deterministas

Módulo **puro**: solo recibe datos y opciones, no toca disco ni estado. La deduplicación se inyecta como un `Set<string>` que `dealsService` construye antes de llamar al filtro. Esto hace el módulo directamente testeable sin mocks de sistema de archivos.

```typescript
import { Deal } from '../types';

export interface RulesFilterOptions {
  minDiscountPercent:    number;
  minMetacriticScore:    number;
  minSteamRatingPercent: number;
  maxPriceUSD:           number;
}

/**
 * Criterios de APROBACIÓN (basta con cumplir uno):
 *  - metacriticScore >= minMetacriticScore (si hay score disponible)
 *  - steamRatingPercent >= minSteamRatingPercent
 *
 * Criterios de RECHAZO (todos deben cumplirse para no rechazar):
 *  - savings >= minDiscountPercent
 *  - salePrice <= maxPriceUSD
 *  - steamAppID no está en notifiedIds (deduplicación inyectada)
 *
 * @param notifiedIds  Set de steamAppIDs ya notificados recientemente.
 *                     Lo construye dealsService; este módulo no toca disco.
 */
export function applyHardFilters(
  deals: Deal[],
  options: RulesFilterOptions,
  notifiedIds: Set<string>,
): Deal[] {
  return deals.filter(deal => {
    const savings     = parseFloat(deal.savings);
    const salePrice   = parseFloat(deal.salePrice);
    const metacritic  = parseInt(deal.metacriticScore) || 0;
    const steamRating = parseInt(deal.steamRatingPercent) || 0;

    if (savings   < options.minDiscountPercent) return false;
    if (salePrice > options.maxPriceUSD)        return false;
    if (notifiedIds.has(deal.steamAppID))        return false;

    const hasGoodMetacritic  = metacritic > 0 && metacritic >= options.minMetacriticScore;
    const hasGoodSteamRating = steamRating >= options.minSteamRatingPercent;

    return hasGoodMetacritic || hasGoodSteamRating;
  });
}
```

---

### `src/services/cheapsharkClient.ts`

> **Decisión de diseño:** El filtro de Metacritic **no** se pasa a CheapShark. Si lo hiciéramos, excluiríamos juegos con Score nulo o bajo pero excelente rating en Steam, que según el diseño del sistema sí deberían poder pasar el corte via `rulesFilter`. El OR `metacritic ≥ N OR steamRating ≥ N` solo funciona correctamente si el universo de entrada de `rulesFilter` contiene ambos tipos.

```typescript
import axios from 'axios';
import { config } from '../config';
import { Deal } from '../types';

const BASE_URL = 'https://www.cheapshark.com/api/1.0';

export async function fetchSteamDeals(options: {
  maxPrice: number;
  pageSize: number;
}): Promise<Deal[]> {
  const { data } = await axios.get<Deal[]>(`${BASE_URL}/deals`, {
    params: {
      storeID:    '1',
      upperPrice: options.maxPrice,
      sortBy:     'Savings',
      onSale:     1,
      pageSize:   options.pageSize,
      // ⚠️ No se filtra por metacritic aquí — lo hace rulesFilter con lógica OR
    },
    timeout: config.http.cheapsharkTimeoutMs,
  });
  return data;
}
```

---

### `src/cache/deduplication.ts`

Evita notificar el mismo juego más de una vez en un período configurable. Exporta `getNotifiedIds()` para que `dealsService` construya el `Set<string>` que pasa a `rulesFilter`, manteniendo el filtro libre de dependencias de I/O.

> **Dependencia adicional:** `npm install write-file-atomic` + `npm install -D @types/write-file-atomic`

```typescript
import fs from 'fs';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';
import { config } from '../config';
import { NotifiedGame } from '../types';

const DATA_DIR    = path.join(process.cwd(), 'data');
const NOTIFIED_FILE = path.join(DATA_DIR, 'notified_games.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadNotifiedGames(): NotifiedGame[] {
  ensureDataDir();
  if (!fs.existsSync(NOTIFIED_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(NOTIFIED_FILE, 'utf-8'));
  } catch {
    console.warn('⚠️ notified_games.json corrupto o ilegible. Reiniciando.');
    return [];
  }
}

function saveNotifiedGames(games: NotifiedGame[]): void {
  ensureDataDir();
  writeFileAtomic.sync(NOTIFIED_FILE, JSON.stringify(games, null, 2));
}

function cutoffMs(): number {
  return Date.now() - config.dedup.days * 24 * 60 * 60 * 1000;
}

/**
 * Retorna el Set de steamAppIDs notificados recientemente.
 * dealsService lo pasa a applyHardFilters para mantener rulesFilter puro.
 */
export function getNotifiedIds(): Set<string> {
  const games  = loadNotifiedGames();
  const cutoff = cutoffMs();
  return new Set(
    games
      .filter(g => new Date(g.notifiedAt).getTime() > cutoff)
      .map(g => g.steamAppID)
  );
}

/** Marca una lista de juegos como notificados */
export function markAsNotified(games: { steamAppID: string }[]): void {
  const raw    = loadNotifiedGames();
  const now    = new Date().toISOString();
  const cutoff = cutoffMs();

  // 1. Limpiar expirados PRIMERO para no bloquear reinserciones válidas
  const valid = raw.filter(e => new Date(e.notifiedAt).getTime() > cutoff);

  // 2. Solo agregar IDs que no estén ya en la lista limpia
  const newEntries: NotifiedGame[] = games
    .filter(g => !valid.some(e => e.steamAppID === g.steamAppID))
    .map(g => ({ steamAppID: g.steamAppID, notifiedAt: now }));
    // title no se guarda — no es necesario para deduplicar

  saveNotifiedGames([...valid, ...newEntries]);
}
```

---

### `src/cache/snapshotCache.ts`

Guarda el último resultado exitoso del análisis diario. Cumple dos funciones:

1. **`/deals` reutiliza el snapshot** en lugar de re-ejecutar el pipeline completo.
2. **Fallback cuando la IA falla**: si GPT no responde, se sirve el último snapshot válido en lugar de devolver error al usuario.

El snapshot incluye un `candidatesHash` — si los candidatos del nuevo fetch son idénticos al último análisis, el pipeline salta directamente a `buildFilteredDeals` sin llamar a OpenAI.

```typescript
import fs   from 'fs';
import path from 'path';
import crypto from 'crypto';
import writeFileAtomic from 'write-file-atomic';
import { DailySnapshot, FilteredDeal } from '../types';

const DATA_DIR      = path.join(process.cwd(), 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadSnapshot(): DailySnapshot | null {
  if (!fs.existsSync(SNAPSHOT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')) as DailySnapshot;
  } catch {
    console.warn('⚠️ snapshot.json corrupto o ilegible.');
    return null;
  }
}

export function saveSnapshot(snapshot: DailySnapshot): void {
  ensureDataDir();
  writeFileAtomic.sync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
}

/**
 * Retorna true si el snapshot es del día de hoy en Bogotá (America/Bogota).
 *
 * Se usa la zona horaria de Bogotá explícitamente porque:
 * - El cron ya corre en esa zona (timezone: 'America/Bogota')
 * - El servidor puede estar en cualquier zona (UTC, US, etc.)
 * - Usar toDateString() sin zona fijaría la fecha del servidor, no la del negocio,
 *   pudiendo marcar un snapshot de ayer como "de hoy" o viceversa.
 */
export function isSnapshotFresh(snapshot: DailySnapshot): boolean {
  const tz = 'America/Bogota';
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  };
  const snapshotDay = new Intl.DateTimeFormat('en-CA', opts).format(new Date(snapshot.createdAt));
  const todayDay    = new Intl.DateTimeFormat('en-CA', opts).format(new Date());
  return snapshotDay === todayDay;
}

/**
 * Elimina el snapshot si existe y está obsoleto (no es de hoy).
 * Llamar al arrancar el proceso para evitar servir datos viejos
 * si el bot estuvo caído uno o más días.
 */
export function clearStaleSnapshot(): void {
  const snapshot = loadSnapshot();
  if (snapshot && !isSnapshotFresh(snapshot)) {
    try {
      fs.unlinkSync(SNAPSHOT_FILE);
      console.log('🗑️ Snapshot obsoleto eliminado (era de un día anterior)');
    } catch {
      // No crítico — el pipeline lo sobreescribirá en la próxima ejecución
    }
  }
}

/**
 * Hash determinista de los candidatos.
 * Incluye los campos que GPT usa para decidir (title, scores) Y los campos
 * que determinan la oferta visible al usuario (precio, descuento, dealID).
 * Si cualquiera de éstos cambia, el hash difiere y se re-evalúa con GPT.
 */
export function hashCandidates(candidates: {
  steamAppID:     string;
  title:          string;
  metacriticScore: string;
  steamRatingText: string;
  salePrice:      string;
  normalPrice:    string;
  savings:        string;
  dealID:         string;
}[]): string {
  // Ordenar por steamAppID para garantizar determinismo independiente del orden del fetch
  const sorted = [...candidates].sort((a, b) => a.steamAppID.localeCompare(b.steamAppID));
  const payload = JSON.stringify(sorted.map(c => ({
    id:      c.steamAppID,
    title:   c.title,
    meta:    c.metacriticScore,
    rating:  c.steamRatingText,
    sale:    c.salePrice,
    normal:  c.normalPrice,
    savings: c.savings,
    deal:    c.dealID,         // cambia si el dealID rota aunque el juego sea el mismo
  })));
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
```

**Decisión de diseño clave:** GPT solo decide *quién pasa* y aporta una *razón*. Todos los datos del `FilteredDeal` (precio, URL, score, título) se reconstruyen desde los candidatos originales de CheapShark. GPT no puede inventar un `steamAppID`, alterar precios ni inyectar URLs — su output es solo una lista de IDs válidos y texto libre (la razón), que se valida antes de usarse.

```typescript
import OpenAI from 'openai';
import { config } from '../config';
import { Deal, FilteredDeal, AIFilterResult } from '../types';

const client = new OpenAI({ apiKey: config.openai.apiKey });

const SYSTEM_PROMPT = `
Eres un experto curador de videojuegos. Los juegos que recibes YA pasaron un filtro
de calidad (buen Metacritic o Steam Rating, buen descuento). Tu trabajo es seleccionar
los que tienen RECONOCIMIENTO en la comunidad gamer:

SELECCIONA si cumple al menos uno:
1. Juegos AAA de grandes estudios (EA, Ubisoft, CD Projekt, Rockstar, Bethesda, etc.)
2. Indies muy reconocidos o premiados (Hades, Hollow Knight, Celeste, Stardew Valley, etc.)
3. Juegos que fueron trending o virales en los últimos 5 años
4. Franquicias conocidas aunque sea una entrega menor
5. Juegos con fuerte reputación en comunidades gaming (Reddit, YouTube, Twitch)

DESCARTA:
- Juegos desconocidos aunque tengan buen score
- Asset flips o simuladores genéricos sin comunidad
- DLCs de juegos no reconocidos

Responde ÚNICAMENTE con JSON, sin texto adicional:
{
  "selectedIds": ["steamAppID_1", "steamAppID_2"],
  "reasons": {
    "steamAppID_1": "razón breve en español, máx 12 palabras",
    "steamAppID_2": "razón breve en español, máx 12 palabras"
  }
}

Si ninguno tiene reconocimiento, retorna { "selectedIds": [], "reasons": {} }.
`;

export async function filterDealsWithAI(deals: Deal[]): Promise<AIFilterResult> {
  // Solo enviamos id + nombre + ratings a GPT. Precios y URLs no los necesita para decidir.
  const input = deals.map(d => ({
    steamAppID: d.steamAppID,
    title: d.title,
    metacriticScore: parseInt(d.metacriticScore) || 0,
    steamRatingText: d.steamRatingText,
  }));

  const completion = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: JSON.stringify(input) },
    ],
    response_format: { type: 'json_object' },
    // temperature: 0 — necesitamos repetibilidad, no creatividad.
    // Con 0, el mismo conjunto de candidatos produce la misma selección,
    // lo que hace la caché por hash confiable.
    temperature: 0,
  }, {
    // Timeout explícito: sin esto el proceso puede quedar colgado indefinidamente
    timeout: config.openai.timeoutMs,
  });

  const raw = completion.choices[0].message.content!;

  try {
    const parsed = JSON.parse(raw) as { selectedIds?: unknown; reasons?: unknown };

    const selectedIds: string[] = Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [];
    const reasons: Record<string, string> =
      parsed.reasons && typeof parsed.reasons === 'object' && !Array.isArray(parsed.reasons)
        ? (parsed.reasons as Record<string, string>)
        : {};

    // Validar que los IDs devueltos existan en los candidatos enviados
    const validIds = new Set(deals.map(d => d.steamAppID));
    const safeIds  = selectedIds.filter(id => typeof id === 'string' && validIds.has(id));

    return { status: 'ok', selection: { selectedIds: safeIds, reasons } };

  } catch {
    // Log mínimo: no se vuelca el payload completo de la respuesta de IA
    console.error('❌ openaiFilter: JSON inválido recibido de GPT (primeros 100 chars):', raw.slice(0, 100));
    return { status: 'error', reason: 'Respuesta de IA no es JSON válido' };
  }
}

/**
 * Reconstruye FilteredDeal[] desde los candidatos originales usando la selección de GPT.
 * Los datos (precio, URL, score) vienen de CheapShark, no del modelo.
 * La `reason` (único campo libre de GPT) se trunca a config.ai.maxReasonLength.
 */
export function buildFilteredDeals(
  candidates: Deal[],
  selection: { selectedIds: string[]; reasons: Record<string, string> },
): FilteredDeal[] {
  const dealMap = new Map(candidates.map(d => [d.steamAppID, d]));

  return selection.selectedIds
    .map(id => {
      const d = dealMap.get(id);
      if (!d) return null;

      // Truncar reason al límite configurado — el prompt pide 12 palabras pero no hay garantía
      const rawReason = typeof selection.reasons[id] === 'string' ? selection.reasons[id] : '';
      const reason    = rawReason.slice(0, config.ai.maxReasonLength);

      return {
        title:           d.title,
        steamAppID:      d.steamAppID,
        salePrice:       d.salePrice,
        normalPrice:     d.normalPrice,
        savingsPercent:  Math.round(parseFloat(d.savings)),
        metacriticScore: parseInt(d.metacriticScore) || 0,
        steamRatingText: d.steamRatingText,
        dealUrl:         `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}`,
        reason,
      } satisfies FilteredDeal;
    })
    .filter((d): d is FilteredDeal => d !== null);
}
```

---

### `src/services/dealsService.ts`

El orquestador expone **dos funciones** para separar la consulta de la escritura de estado. Incorpora lógica de snapshot para evitar llamadas repetidas a OpenAI cuando los candidatos no cambiaron.

**Estrategia de ejecución:**
1. Si hay snapshot fresco del día → `/deals` lo sirve directamente sin tocar APIs
2. Si los candidatos del fetch nuevo tienen el mismo hash que el snapshot → reutilizar selección de IA, sin llamar a GPT
3. Si IA falla → fallback al último snapshot válido (si existe)
4. Solo llama a GPT cuando hay candidatos genuinamente nuevos

```typescript
import { fetchSteamDeals }                   from './cheapsharkClient';
import { applyHardFilters }                   from './rulesFilter';
import { filterDealsWithAI, buildFilteredDeals } from './openaiFilter';
import { getNotifiedIds, markAsNotified }     from '../cache/deduplication';
import { loadSnapshot, saveSnapshot,
         isSnapshotFresh, hashCandidates }    from '../cache/snapshotCache';
import { config }                             from '../config';
import { FilteredDeal, PipelineResult }       from '../types';

// Lock en memoria: previene que cron y /deals corran el pipeline simultáneamente,
// lo que causaría doble llamada a CheapShark/GPT y posibles carreras en los JSON.
// Se resetea con el proceso — aceptable para MVP de un solo proceso.
let pipelineRunning = false;

/**
 * Ejecuta el pipeline completo con caché por hash de candidatos.
 * Si los candidatos no cambiaron respecto al último snapshot, omite la llamada a GPT.
 * Si la IA falla, usa el último snapshot fresco como fallback.
 */
async function runPipeline(): Promise<PipelineResult> {
  if (pipelineRunning) {
    // Ya hay una ejecución en curso — devolver el snapshot actual si es válido,
    // o no_deals si no hay nada disponible aún.
    console.warn('⚠️ Pipeline ya en ejecución, evitando carrera.');
    const snapshot = loadSnapshot();
    if (snapshot && isSnapshotFresh(snapshot)) {
      return { status: 'ok', deals: snapshot.deals };
    }
    return { status: 'no_deals' };
  }

  pipelineRunning = true;
  try {
    return await _runPipelineImpl();
  } finally {
    pipelineRunning = false;
  }
}

async function _runPipelineImpl(): Promise<PipelineResult> {
  const opts = config.filters;

  // 1. Fetch — sin filtro de Metacritic upstream (rulesFilter usa OR)
  const rawDeals = await fetchSteamDeals({
    maxPrice: opts.maxPriceUSD,
    pageSize: opts.pageSize,
  });

  // 2. Filtro determinista — puro, sin I/O
  const notifiedIds = getNotifiedIds();
  const candidates  = applyHardFilters(rawDeals, opts, notifiedIds);
  console.log(`📋 CheapShark: ${rawDeals.length} deals → ${candidates.length} candidatos`);

  if (candidates.length === 0) return { status: 'no_deals' };

  // 3. Hash de candidatos — incluye precio, descuento y dealID para detectar cambios en la oferta
  //    Si el hash coincide con el snapshot anterior, no se llama a GPT
  const currentHash = hashCandidates(
    candidates.map(d => ({
      steamAppID:      d.steamAppID,
      title:           d.title,
      metacriticScore: d.metacriticScore,
      steamRatingText: d.steamRatingText,
      salePrice:       d.salePrice,
      normalPrice:     d.normalPrice,
      savings:         d.savings,
      dealID:          d.dealID,
    }))
  );
  const snapshot    = loadSnapshot();

  if (snapshot && snapshot.candidatesHash === currentHash) {
    console.log('✅ Hash de candidatos sin cambios — reutilizando selección anterior (sin llamada a GPT)');
    return { status: 'ok', deals: snapshot.deals };
  }

  // 4. CAPA 2 — GPT solo decide quién pasa y aporta la razón
  const aiResult = await filterDealsWithAI(candidates);

  if (aiResult.status === 'error') {
    console.error(`❌ IA falló: ${aiResult.reason}`);

    // Fallback: solo snapshot fresco (del día de hoy en Bogotá).
    // Un snapshot de ayer puede tener precios/links ya distintos — no es un fallback seguro.
    if (snapshot && isSnapshotFresh(snapshot) && snapshot.deals.length > 0) {
      console.warn('⚠️ Usando snapshot de hoy como fallback por fallo de IA');
      return { status: 'ok', deals: snapshot.deals };
    }

    return { status: 'ai_error', reason: aiResult.reason };
  }

  // 5. Reconstruir FilteredDeal[] desde candidatos originales (nunca desde GPT)
  const deals = buildFilteredDeals(candidates, aiResult.selection);
  console.log(`🤖 GPT: ${candidates.length} candidatos → ${deals.length} seleccionados`);

  // 6. Persistir snapshot para reutilización futura
  saveSnapshot({ deals, candidatesHash: currentHash, createdAt: new Date().toISOString() });

  return { status: 'ok', deals };
}

/**
 * Solo consulta y filtra. Sin efectos secundarios en deduplicación.
 * Si existe snapshot fresco del día, lo sirve directamente sin tocar APIs.
 */
export async function fetchDeals(): Promise<PipelineResult> {
  const snapshot = loadSnapshot();
  if (snapshot && isSnapshotFresh(snapshot)) {
    console.log('📦 Sirviendo snapshot del día sin re-ejecutar pipeline');
    return { status: 'ok', deals: snapshot.deals };
  }
  return runPipeline();
}

/**
 * Consulta, filtra y marca los resultados como notificados.
 * Retorna PipelineResult para que el cron pueda distinguir entre:
 * - 'ok': broadcast normal
 * - 'no_deals': sin ofertas hoy, silencio correcto
 * - 'ai_error': fallo real, NO enviar "no hay ofertas" engañoso
 */
export async function fetchAndMarkDeals(): Promise<PipelineResult> {
  const result = await runPipeline();
  if (result.status !== 'ok') return result;

  if (result.deals.length > 0) {
    markAsNotified(result.deals.map(d => ({ steamAppID: d.steamAppID })));
  }
  return result;
}
```

---

### `src/utils/formatMessage.ts`

> **Decisión de diseño:** Se usa `parse_mode: 'HTML'` en lugar de `Markdown`. Con Markdown, caracteres como `_`, `*`, `[`, `(` en títulos o razones generadas por GPT rompen el renderizado silenciosamente. HTML tiene un conjunto de caracteres reservados mucho más pequeño (`<`, `>`, `&`) y una función de escape trivial.

```typescript
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
    weekday: 'long', day: 'numeric', month: 'long',
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

  return header + subtitle + items.join('\n\n' + '─'.repeat(20) + '\n\n');
}
```

---

### `src/notifier/telegramNotifier.ts`

```typescript
import { Telegram } from 'telegraf';
import fs from 'fs';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';
import { config } from '../config';

const telegram      = new Telegram(config.telegram.botToken);
const DATA_DIR      = path.join(process.cwd(), 'data');
const CHAT_IDS_FILE = path.join(DATA_DIR, 'chat_ids.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function saveChatId(chatId: number): void {
  ensureDataDir();
  let ids: number[] = [];
  if (fs.existsSync(CHAT_IDS_FILE)) {
    try { ids = JSON.parse(fs.readFileSync(CHAT_IDS_FILE, 'utf-8')); }
    catch { ids = []; }
  }
  if (!ids.includes(chatId)) {
    ids.push(chatId);
    writeFileAtomic.sync(CHAT_IDS_FILE, JSON.stringify(ids, null, 2));
    console.log(`✅ Chat ID guardado: ${chatId}`);
  }
}

export function loadChatIds(): number[] {
  if (!fs.existsSync(CHAT_IDS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(CHAT_IDS_FILE, 'utf-8')); }
  catch { console.warn('⚠️ chat_ids.json corrupto.'); return []; }
}

function removeChatIds(toRemove: number[]): void {
  const cleaned = loadChatIds().filter(id => !toRemove.includes(id));
  writeFileAtomic.sync(CHAT_IDS_FILE, JSON.stringify(cleaned, null, 2));
  console.log(`🗑️ Chat IDs eliminados: ${toRemove.length}`);
}

/** Elimina un único chat_id — usado por el comando /stop */
export function removeChatId(chatId: number): void {
  removeChatIds([chatId]);
}

/** Retorna true si el error de Telegram indica que el chat nunca recibirá mensajes */
function isPermanentError(err: unknown): boolean {
  const code = (err as any)?.response?.error_code;
  const desc: string = (err as any)?.response?.description ?? '';
  // 403 = bot bloqueado / expulsado; 400 chat_not_found = chat borrado o ID inválido
  return code === 403 || (code === 400 && desc.toLowerCase().includes('chat not found'));
}

export async function notifyAllUsers(message: string): Promise<void> {
  const chatIds = loadChatIds();
  console.log(`📨 Enviando a ${chatIds.length} usuario(s)...`);
  const invalidIds: number[] = [];

  for (const chatId of chatIds) {
    try {
      // Timeout explícito: sin esto un cuelgue de Telegram bloquea el loop entero
      await Promise.race([
        telegram.sendMessage(chatId, message, { parse_mode: 'HTML' }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('sendMessage timeout')), config.http.telegramTimeoutMs)
        ),
      ]);
    } catch (err) {
      if (isPermanentError(err)) {
        // Truncar chat_id en logs — últimos 4 dígitos suficientes para debug
        console.warn(`⚠️ Chat ***${String(chatId).slice(-4)} rechazado permanentemente. Eliminando.`);
        invalidIds.push(chatId);
      } else {
        // Log mínimo — no volcar el objeto de error completo (puede incluir payloads)
        const code = (err as any)?.response?.error_code ?? 'unknown';
        console.error(`Error enviando a chat ***${String(chatId).slice(-4)}: código ${code}`);
      }
    }
    if (chatIds.length > 1) await new Promise(r => setTimeout(r, config.rateLimit.telegramSendDelayMs));
  }

  if (invalidIds.length > 0) removeChatIds(invalidIds);
}
```

---

### `src/scheduler/cronJobs.ts`

```typescript
import cron from 'node-cron';
import { fetchAndMarkDeals } from '../services/dealsService';
import { formatDealsMessage } from '../utils/formatMessage';
import { notifyAllUsers }     from '../notifier/telegramNotifier';
import { config }             from '../config';

export function startScheduler(): void {
  console.log(`⏰ Cron activado con schedule: "${config.cron.schedule}"`);

  cron.schedule(config.cron.schedule, async () => {
    console.log(`[${new Date().toISOString()}] 🔄 Ejecutando búsqueda de ofertas...`);
    try {
      const result = await fetchAndMarkDeals();

      if (result.status === 'ai_error') {
        // No enviar broadcast — un mensaje "no hay ofertas" sería engañoso.
        // El error ya fue logueado en runPipeline(); aquí solo registramos el ciclo fallido.
        console.error(`❌ Cron: broadcast omitido por fallo de IA. Razón: ${result.reason}`);
        return;
      }

      if (result.status === 'no_deals' || result.deals.length === 0) {
        // Sin ofertas que superen los filtros hoy — silencio correcto, no es un error.
        console.log('📭 Cron: sin ofertas destacadas hoy. No se envía broadcast.');
        return;
      }

      const message = formatDealsMessage(result.deals);
      await notifyAllUsers(message);
      console.log(`✅ Broadcast enviado: ${result.deals.length} ofertas.`);

    } catch (err) {
      const msg = (err as Error).message ?? 'sin mensaje';
      console.error(`❌ Error inesperado en cron: ${msg}`);
    }
  }, { timezone: 'America/Bogota' });
}
```

---

### `src/bot/commands.ts`

```typescript
import { Telegraf } from 'telegraf';
import { fetchDeals }           from '../services/dealsService';
import { formatDealsMessage }   from '../utils/formatMessage';
import { saveChatId, removeChatId } from '../notifier/telegramNotifier';
import { config }               from '../config';

// Rate limit en memoria: Map<chatId, timestamp último uso>
// Simple, sin dependencias externas. Se resetea al reiniciar el proceso (aceptable para MVP).
const lastDealRequest = new Map<number, number>();

export function registerCommands(bot: Telegraf): void {
  bot.start(async (ctx) => {
    saveChatId(ctx.chat.id);
    await ctx.reply(
      '¡Hola! 🎮 Soy tu bot de ofertas de Steam.\n\n' +
      'Cada día te enviaré las mejores ofertas filtradas por IA: solo AAA, ' +
      'indie premiados y juegos que realmente valen la pena.\n\n' +
      'Comandos:\n' +
      '/deals — Ver ofertas ahora mismo\n' +
      '/stop  — Dejar de recibir notificaciones\n' +
      '/help  — Ver ayuda'
    );
  });

  bot.command('deals', async (ctx) => {
    const chatId = ctx.chat.id;
    const now    = Date.now();
    const last   = lastDealRequest.get(chatId) ?? 0;
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
          '⚠️ El servicio de curación con IA no está disponible ahora mismo.\n' +
          'Intenta de nuevo en unos minutos.'
        );
        return;
      }

      if (result.status === 'no_deals' || result.deals.length === 0) {
        await ctx.reply('🎮 No hay ofertas destacadas en este momento. ¡Vuelve mañana!');
        return;
      }

      await ctx.reply(formatDealsMessage(result.deals), { parse_mode: 'HTML' });

    } catch (err) {
      await ctx.reply('❌ Hubo un error inesperado. Intenta más tarde.');
      // Log mínimo: no volcar el stack ni el objeto de error completo
      console.error('[/deals] Error inesperado:', (err as Error).message ?? 'sin mensaje');
    }
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      '🤖 <b>Steam Deals Bot</b>\n\n' +
      'Busco ofertas en Steam y uso IA para filtrar solo los juegos ' +
      'que realmente valen la pena: AAA, indie reconocidos, juegos trending.\n\n' +
      '<b>Comandos:</b>\n' +
      '/start — Activar notificaciones diarias\n' +
      '/deals — Ver mejores ofertas ahora\n' +
      '/stop  — Dejar de recibir notificaciones\n' +
      '/help  — Esta ayuda',
      { parse_mode: 'HTML' }
    );
  });

  bot.command('stop', async (ctx) => {
    // Baja inmediata: elimina el chat_id de la lista de suscriptores.
    // El usuario puede volver a suscribirse en cualquier momento con /start.
    removeChatId(ctx.chat.id);
    await ctx.reply(
      '✅ Te diste de baja de las notificaciones diarias.\n' +
      'Puedes volver a activarlas cuando quieras con /start.'
    );
  });
}
```

---

### `src/config.ts`

Fuente única de verdad para todas las variables de entorno. Valida tipos, rangos y requeridos al arrancar — falla temprano con mensaje claro en lugar de propagar `NaN` o valores absurdos.

```typescript
import dotenv from 'dotenv';
import cron from 'node-cron';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`❌ Variable requerida no definida: ${key}`);
  return val;
}

function optional(key: string, defaultVal: string): string {
  return process.env[key] ?? defaultVal;
}

/** Lee un entero, valida que sea un número y que esté dentro del rango permitido. */
function optionalInt(key: string, defaultVal: number, min: number, max: number): number {
  const raw = process.env[key];
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n)) {
    throw new Error(`❌ ${key} debe ser un entero, recibido: "${raw}"`);
  }
  if (n < min || n > max) {
    throw new Error(`❌ ${key}=${n} fuera de rango permitido [${min}, ${max}]`);
  }
  return n;
}

function validatedCron(key: string, defaultVal: string): string {
  const val = process.env[key] ?? defaultVal;
  if (!cron.validate(val)) {
    throw new Error(`❌ ${key}="${val}" no es una expresión cron válida`);
  }
  return val;
}

export const config = {
  telegram: {
    botToken: required('BOT_TOKEN'),
  },
  openai: {
    apiKey:  required('OPENAI_API_KEY'),
    model:   optional('OPENAI_MODEL', 'gpt-4o-mini'),
    timeoutMs: 30_000,   // 30s — tiempo razonable para una llamada de curación
  },
  filters: {
    minDiscountPercent:    optionalInt('MIN_DISCOUNT_PERCENT',    50,  0, 100),
    minMetacriticScore:    optionalInt('MIN_METACRITIC_SCORE',    70,  0, 100),
    minSteamRatingPercent: optionalInt('MIN_STEAM_RATING_PERCENT', 70, 0, 100),
    maxPriceUSD:           optionalInt('MAX_PRICE_USD',           60,  1, 999),
    pageSize:              optionalInt('DEALS_PAGE_SIZE',         60,  1,  60),
  },
  dedup: {
    days: optionalInt('DEDUP_DAYS', 7, 1, 365),
  },
  cron: {
    schedule: validatedCron('CRON_SCHEDULE', '0 9 * * *'),
  },
  http: {
    cheapsharkTimeoutMs: 10_000,  // 10s — API pública sin SLA
    telegramTimeoutMs:   15_000,  // 15s — mensajes de texto pequeños
  },
  rateLimit: {
    dealsCooldownMs:  45_000,  // 45s entre invocaciones de /deals por chat_id
    telegramSendDelayMs: 50,   // ms entre envíos en broadcast (rate limiting preventivo)
  },
  ai: {
    maxReasonLength: 120,   // caracteres máximos para el campo `reason` de GPT
  },
} as const;
```

---

### `src/bot/index.ts`

```typescript
import { Telegraf } from 'telegraf';
import { config }             from '../config';
import { registerCommands }   from './commands';
import { startScheduler }     from '../scheduler/cronJobs';
import { clearStaleSnapshot } from '../cache/snapshotCache';

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
```

---

## Comandos del Bot

| Comando | Descripción |
|---|---|
| `/start` | Inicia el bot y registra el chat_id para notificaciones automáticas |
| `/deals` | Consulta y muestra las mejores ofertas del momento (snapshot-first, sin costo si el snapshot es del día) |
| `/stop`  | Baja inmediata: elimina el chat_id de la lista de suscriptores |
| `/help`  | Muestra ayuda con los comandos disponibles |

---

## Sistema de Notificaciones Automáticas

El cron corre una vez al día a la hora configurada en `CRON_SCHEDULE`.

**Ejemplos de schedules útiles:**

```
0 9 * * *      → Todos los días a las 9:00am (Colombia = UTC-5)
0 12 * * *     → Todos los días al mediodía
0 9 * * 1,5    → Solo lunes y viernes a las 9am
0 9,18 * * *   → Dos veces al día: 9am y 6pm
```

Herramienta útil para construir expresiones cron: https://crontab.guru

---

## Prompt de IA

El prompt del sistema está diseñado para que GPT actúe como curador de reconocimiento gamer, no como filtro de métricas (eso ya lo hizo `rulesFilter`). Claves del diseño:

1. **GPT no construye datos** — solo retorna `{ selectedIds: string[], reasons: Record<string, string> }`. Precios, URLs y scores vienen de CheapShark.
2. **Output JSON forzado** — `response_format: { type: 'json_object' }` elimina texto extra o markdown en la respuesta.
3. **Temperatura 0** — máxima repetibilidad. El mismo conjunto de candidatos produce siempre la misma selección, lo que hace la caché por hash confiable.
4. **Razón breve en español** — único campo de texto libre; truncada a `config.ai.maxReasonLength` antes de mostrarse.
5. **Validación de IDs** — antes de usar la respuesta, se verifica que cada `steamAppID` devuelto exista en los candidatos enviados. GPT no puede introducir IDs nuevos.
6. **Fallback explícito en el prompt** — si ningún juego tiene reconocimiento, retorna `{ "selectedIds": [], "reasons": {} }`.

El prompt completo está en `src/services/openaiFilter.ts` — esa es la única fuente de verdad.

---

## Guía de Configuración Inicial

### Paso 1: Crear el bot en Telegram

1. Abre Telegram y busca `@BotFather`
2. Envía el comando `/newbot`
3. Elige un nombre para el bot (ej: `Steam Deals Notifier`)
4. Elige un username único que termine en `bot` (ej: `steamdeals_notify_bot`)
5. Copia el token que te da BotFather → ese es tu `BOT_TOKEN`

### Paso 2: Obtener tu API Key de OpenAI

1. Ve a https://platform.openai.com/api-keys
2. Crea una nueva API Key con un nombre descriptivo
3. Cópiala — no podrás verla de nuevo
4. Asegúrate de tener saldo disponible en tu cuenta

### Paso 3: Clonar e instalar

```bash
git clone <repo>
cd steam-deals-bot
npm install
cp .env.example .env
# Edita .env con tu BOT_TOKEN y OPENAI_API_KEY
```

### Paso 4: Obtener tu chat_id

El chat_id **se obtiene automáticamente** cuando le envías `/start` al bot — no necesitas ningún paso adicional. El bot lo registra en `data/chat_ids.json` en ese momento.

> ⚠️ **No uses `getUpdates` manualmente con el token en la URL del navegador.** Expone tu `BOT_TOKEN` en el historial del navegador, proxies intermedios y logs de servidor. El flujo normal con `/start` es suficiente y más seguro.

### Paso 5: Ejecutar

```bash
# Desarrollo (TypeScript directo, con hot reload via tsx)
npm run dev

# Producción
npm run build
npm start
```

---

## Scripts del Proyecto

### `.gitignore`

```
node_modules/
dist/
.env

# Archivos de datos en runtime — contienen IDs de usuarios y estado operativo
# Nunca deben commitearse
data/
```

---

### `package.json`

```json
{
  "name": "steam-deals-bot",
  "version": "1.0.0",
  "description": "Telegram bot for curated Steam deals powered by AI",
  "main": "dist/bot/index.js",
  "scripts": {
    "dev": "tsx watch src/bot/index.ts",
    "build": "tsc",
    "start": "node dist/bot/index.js",
    "test:deals": "tsx src/scripts/testDeals.ts"
  },
  "dependencies": {
    "axios": "^1.7.0",
    "dotenv": "^16.4.0",
    "node-cron": "^3.0.3",
    "openai": "^4.77.0",
    "telegraf": "^4.16.0",
    "write-file-atomic": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/node-cron": "^3.0.0",
    "@types/write-file-atomic": "^4.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Script de prueba `src/scripts/testDeals.ts`

Útil para probar el pipeline completo antes de conectar el bot de Telegram:

```typescript
import { config } from '../config'; // valida variables de entorno al importar
import { fetchDeals, fetchAndMarkDeals } from '../services/dealsService';
import { formatDealsMessage } from '../utils/formatMessage';

// true  → fetchDeals (sin escribir en notified_games.json)
// false → fetchAndMarkDeals (prueba también la deduplicación)
const DRY_RUN = true;

async function main() {
  console.log(`🔍 Buscando y filtrando ofertas... (dry run: ${DRY_RUN})\n`);

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
    console.log(formatDealsMessage(result.deals));
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
    console.log(formatDealsMessage(result.deals));
    console.log(`\n✅ ${result.deals.length} juegos seleccionados y marcados como notificados.`);
  }
}

main().catch(console.error);
```

Ejecutar con: `npm run test:deals`

> Cambia `DRY_RUN = false` para probar también la escritura en `notified_games.json`.

---

## Consideraciones de Costo

### CheapShark API
**Costo: $0** — completamente gratuita y sin autenticación requerida.

### OpenAI (gpt-4o-mini)

El payload enviado a GPT es mínimo — solo `{ steamAppID, title, metacriticScore, steamRatingText }` por candidato, sin precios ni URLs.

Estimación **sin caché** (peor caso: candidatos cambian todos los días):

| Componente | Tokens | Costo/1K tokens | Total |
|---|---|---|---|
| Input (~25 candidatos × ~40 tokens) | ~1,000 | $0.00015 | ~$0.00015 |
| Output (~10 IDs + razones) | ~200 | $0.00060 | ~$0.00012 |
| **Total por ejecución sin caché** | | | **~$0.00027** |

Con el snapshot cache, la mayoría de los días los candidatos no cambian significativamente — en esos casos **no se hace ninguna llamada a GPT**. El costo real mensual en uso normal es prácticamente $0.

### Telegram Bot API
**Costo: $0** — completamente gratuita.

---

## Roadmap Futuro

### v1.0 — MVP (scope actual de este documento)
- [ ] Fetch de deals de CheapShark
- [ ] CAPA 1: filtros deterministas (`rulesFilter.ts`)
- [ ] CAPA 2: curación con GPT-4o-mini (`openaiFilter.ts`)
- [ ] Deduplicación con JSON + ventana de tiempo configurable
- [ ] Snapshot cache por hash — evita llamadas repetidas a GPT
- [ ] Limpieza de snapshot obsoleto al arrancar
- [ ] Frescura del snapshot en zona horaria de Bogotá
- [ ] Comando `/deals` con rate limit y snapshot-first
- [ ] Comando `/stop` — baja inmediata del chat_id
- [ ] Notificaciones automáticas diarias (cron)
- [ ] Persistencia de `chat_ids` con limpieza automática de IDs inválidos
- [ ] Config centralizado con validación de rangos y cron

### v1.1 — Persistencia real (upgrade natural cuando JSON se vuelva frágil)
- [ ] Migrar a **SQLite** con `better-sqlite3`
- [ ] Esquema mínimo (sin columnas que no se usen):
  - `subscribers(chat_id INTEGER PRIMARY KEY, created_at TEXT)`
  - `notified_items(steam_app_id TEXT PRIMARY KEY, notified_at TEXT)` ← sin `title`
  - `daily_snapshot(snapshot_date TEXT PRIMARY KEY, candidates_hash TEXT, payload_json TEXT, created_at TEXT)`
- [ ] La migración reemplaza solo la implementación interna de `load/save` en los módulos de cache — la lógica de negocio no cambia
- [ ] No introducir ORM, repositorios genéricos ni historial completo; SQLite con acceso directo es suficiente

### v1.2 — Mejoras de UX
- [ ] Comando `/config` para ajustar filtros por usuario (precio máximo, % descuento)
- [ ] Botón inline "💾 Guardar para después" (Telegram InlineKeyboard)

### v1.3 — Múltiples tiendas
- [ ] Agregar Epic Games Store (via IsThereAnyDeal API)
- [ ] Agregar GOG
- [ ] Notificaciones especiales durante grandes sales (Summer Sale, Winter Sale)

---

## Notas para Claude Code

Este documento sirve como spec completo para el proyecto. Al usarlo con Claude Code, el orden de implementación recomendado es:

1. Crear `package.json` y `tsconfig.json`
2. Instalar dependencias (`npm install`)
3. Crear `.env` desde `.env.example`
4. Implementar `src/types/index.ts`
5. Implementar `src/cache/deduplication.ts`
6. Implementar `src/cache/snapshotCache.ts`
7. Implementar `src/services/cheapsharkClient.ts`
8. Implementar `src/services/rulesFilter.ts` ← CAPA 1
9. Implementar `src/services/openaiFilter.ts` ← CAPA 2
10. Implementar `src/services/dealsService.ts` ← orquesta + snapshot cache
11. Implementar `src/utils/formatMessage.ts`
12. Implementar `src/notifier/telegramNotifier.ts`
13. Implementar `src/scheduler/cronJobs.ts`
14. Implementar `src/bot/commands.ts`
15. Implementar `src/config.ts`
16. Implementar `src/bot/index.ts`
17. Crear `src/scripts/testDeals.ts` para prueba del pipeline completo
18. Probar con `npm run test:deals` antes de lanzar el bot

Este orden permite probar cada capa de forma aislada. En particular, probar `rulesFilter` sin tocar OpenAI primero ahorra tokens durante el desarrollo.
