// Contador de tentativas de login falhadas.
//
// Em serverless cada pedido pode cair numa instância diferente, pelo que um
// contador em memória só bloqueia por instância. Quando existir um Redis REST
// (Vercel KV ou Upstash) o contador passa a ser partilhado por todas elas; sem
// ele mantém-se o comportamento em memória, que continua correcto num servidor
// de processo único (local, Docker).
//
// O store externo falha sempre em aberto: se o Redis não responder, o login não
// pode ficar bloqueado por causa disso.

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;
const KV_TIMEOUT_MS = 1500;

const memory = new Map();

function kvConfig() {
  const url = String(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/$/, '');
  const token = String(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

export function usingSharedStore() {
  return Boolean(kvConfig());
}

async function kvCommand(command) {
  const config = kvConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KV_TIMEOUT_MS);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data && Object.prototype.hasOwnProperty.call(data, 'result') ? data.result : null;
  } catch (error) {
    console.warn('[AuraEX] Store de rate limiting indisponível, a usar contador local:', error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function memoryState(key) {
  const entry = memory.get(key);
  if (!entry) return { count: 0, ttlSeconds: 0 };
  const elapsed = (Date.now() - entry.firstAt) / 1000;
  if (elapsed >= WINDOW_SECONDS) {
    memory.delete(key);
    return { count: 0, ttlSeconds: 0 };
  }
  return { count: entry.count, ttlSeconds: Math.ceil(WINDOW_SECONDS - elapsed) };
}

async function state(key) {
  const redisKey = `auraex:login:${key}`;
  const count = await kvCommand(['GET', redisKey]);
  if (count === null) return memoryState(key);
  const ttl = await kvCommand(['TTL', redisKey]);
  return {
    count: Number(count) || 0,
    ttlSeconds: Number(ttl) > 0 ? Number(ttl) : WINDOW_SECONDS
  };
}

export async function isBlocked(key) {
  const { count, ttlSeconds } = await state(key);
  if (count < MAX_ATTEMPTS) return { blocked: false };
  return { blocked: true, retryAfterSeconds: Math.max(ttlSeconds, 1) };
}

export async function recordFailure(key) {
  const redisKey = `auraex:login:${key}`;
  const count = await kvCommand(['INCR', redisKey]);
  if (count !== null) {
    // Janela deslizante: cada falha renova o prazo de expiração da chave.
    await kvCommand(['EXPIRE', redisKey, String(WINDOW_SECONDS)]);
    return Number(count) || 0;
  }
  const current = memoryState(key);
  const existing = memory.get(key); // memoryState pode ter limpado uma janela expirada
  const next = current.count + 1;
  memory.set(key, { count: next, firstAt: existing ? existing.firstAt : Date.now() });
  return next;
}

export async function clearFailures(key) {
  const cleared = await kvCommand(['DEL', `auraex:login:${key}`]);
  if (cleared === null) memory.delete(key);
}

export const limits = { WINDOW_SECONDS, MAX_ATTEMPTS };
