import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearFailures, isBlocked, recordFailure } from './rate-limit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORAGE_DIR = path.join(ROOT, 'storage');
const USERS_FILE = path.join(STORAGE_DIR, 'users.json');
const TOKENS_FILE = path.join(STORAGE_DIR, 'personal-access-tokens.json');
const AUDIT_FILE = path.join(STORAGE_DIR, 'audit-log.jsonl');

const tokenTouch = new Map();

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function atomicWriteJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temp, file);
  } catch (err) {
    console.warn('Persistência em disco ignorada (ambiente Serverless/Read-only):', err.message);
  }
}

export function loadDotEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function parseCookies(req) {
  const result = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = decodeURIComponent(part.slice(0, index).trim());
    const value = decodeURIComponent(part.slice(index + 1).trim());
    result[key] = value;
  }
  return result;
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex'), iterations = 210000) {
  const hash = crypto.pbkdf2Sync(String(password), Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex');
  return { algorithm: 'pbkdf2-sha256', salt, iterations, hash };
}

export function verifyPassword(password, passwordRecord) {
  if (!passwordRecord || passwordRecord.algorithm !== 'pbkdf2-sha256') return false;
  const candidate = hashPassword(password, passwordRecord.salt, passwordRecord.iterations).hash;
  return safeEqualText(candidate, passwordRecord.hash);
}

function getUsersDocument() {
  return readJson(USERS_FILE, { version: 1, users: [] });
}

function getTokensDocument() {
  return readJson(TOKENS_FILE, { version: 1, tokens: [] });
}

function cleanUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function requestIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

export function audit(req, action, details = {}, actor = null) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    const row = {
      at: new Date().toISOString(),
      action,
      actor: actor ? { id: actor.id, email: actor.email, type: actor.type || 'user' } : null,
      ip: req ? requestIp(req) : null,
      userAgent: req?.headers?.['user-agent'] || null,
      details
    };
    fs.appendFileSync(AUDIT_FILE, `${JSON.stringify(row)}\n`, 'utf8');
  } catch (err) {
    // Ignore read-only audit log write failures on serverless platforms
  }
}

function loginKey(req, email) {
  return `${requestIp(req)}|${String(email).trim().toLowerCase()}`;
}

export async function assertLoginAllowed(req, email) {
  const { blocked, retryAfterSeconds } = await isBlocked(loginKey(req, email));
  return blocked ? { allowed: false, retryAfterSeconds } : { allowed: true };
}

export async function recordLoginFailure(req, email) {
  await recordFailure(loginKey(req, email));
}

export async function clearLoginFailures(req, email) {
  await clearFailures(loginKey(req, email));
}

export function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return getUsersDocument().users.find(user => user.active !== false && String(user.email).toLowerCase() === normalized) || null;
}

function sessionHours() {
  const value = Number(process.env.AURAEX_SESSION_HOURS || 12);
  return Number.isFinite(value) && value > 0 ? value : 12;
}

// As sessões são assinadas e transportadas inteiramente no cookie: em ambientes
// serverless cada pedido pode cair numa instância diferente, pelo que guardar
// sessões em memória faria o login expirar de forma aleatória.
let sessionSecretCache = null;

function sessionSecret() {
  if (sessionSecretCache) return sessionSecretCache;
  const configured = String(process.env.AURAEX_SESSION_SECRET || '').trim();
  if (configured.length >= 16 && !configured.startsWith('troque-por')) {
    sessionSecretCache = configured;
  } else {
    sessionSecretCache = crypto.randomBytes(32).toString('hex');
    console.warn('[AuraEX] AURAEX_SESSION_SECRET ausente ou por configurar: a usar um segredo efémero. As sessões não sobrevivem a reinícios nem a múltiplas instâncias.');
  }
  return sessionSecretCache;
}

function signValue(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('base64url');
}

function csrfFor(sessionId) {
  return signValue(`csrf:${sessionId}`);
}

// Amarra o cookie à senha atual: ao alterá-la, todas as sessões deixam de validar.
function passwordFingerprint(user) {
  return crypto.createHash('sha256').update(String(user?.password?.hash || '')).digest('base64url').slice(0, 16);
}

export function createSession(user) {
  const id = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = now + sessionHours() * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({
    sid: id,
    uid: user.id,
    pwd: passwordFingerprint(user),
    iat: now,
    exp: expiresAt
  }), 'utf8').toString('base64url');
  return { id, csrfToken: csrfFor(id), createdAt: now, expiresAt, token: `${body}.${signValue(body)}` };
}

function verifySessionToken(token) {
  if (typeof token !== 'string') return null;
  const index = token.lastIndexOf('.');
  if (index < 1) return null;
  const body = token.slice(0, index);
  if (!safeEqualText(token.slice(index + 1), signValue(body))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return null; }
  if (!payload || typeof payload.sid !== 'string' || typeof payload.uid !== 'string') return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
  return payload;
}

// Sem estado no servidor não há revogação imediata; o logout limpa o cookie e o
// token restante expira sozinho.
export function destroySession() {}

export function sessionCookie(token, { clear = false } = {}) {
  const secure = String(process.env.AURAEX_PUBLIC_URL || '').startsWith('https://') || Boolean(process.env.VERCEL);
  const maxAge = clear ? 0 : Math.round(sessionHours() * 60 * 60);
  return [
    `auraex_session=${clear ? '' : encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function userById(id) {
  return getUsersDocument().users.find(user => user.id === id && user.active !== false) || null;
}

export function authenticateSession(req) {
  const token = parseCookies(req).auraex_session;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const user = userById(payload.uid);
  if (!user || payload.pwd !== passwordFingerprint(user)) return null;
  return {
    type: 'session',
    user: cleanUser(user),
    session: {
      id: payload.sid,
      userId: payload.uid,
      csrfToken: csrfFor(payload.sid),
      createdAt: payload.iat,
      expiresAt: payload.exp,
      lastSeenAt: Date.now()
    }
  };
}

function extractBearer(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function authenticatePat(req, requiredScopes = []) {
  const rawToken = extractBearer(req);
  if (!rawToken) return null;
  const document = getTokensDocument();
  const hash = tokenHash(rawToken);
  const tokenRecord = document.tokens.find(item => !item.revokedAt && safeEqualText(item.tokenHash, hash));
  if (!tokenRecord) return null;
  if (tokenRecord.expiresAt && Date.parse(tokenRecord.expiresAt) <= Date.now()) return null;
  const user = userById(tokenRecord.userId);
  if (!user) return null;
  const scopes = Array.isArray(tokenRecord.scopes) ? tokenRecord.scopes : [];
  if (requiredScopes.some(scope => !scopes.includes(scope))) {
    return { type: 'pat', forbidden: true, missingScopes: requiredScopes.filter(scope => !scopes.includes(scope)), user: cleanUser(user), token: tokenRecord };
  }
  const lastTouch = tokenTouch.get(tokenRecord.id) || 0;
  if (Date.now() - lastTouch > 5 * 60 * 1000) {
    tokenRecord.lastUsedAt = new Date().toISOString();
    atomicWriteJson(TOKENS_FILE, document);
    tokenTouch.set(tokenRecord.id, Date.now());
  }
  return { type: 'pat', user: cleanUser(user), token: tokenRecord, rawToken, scopes };
}

export function authenticateApi(req, requiredScopes = []) {
  const sessionAuth = authenticateSession(req);
  if (sessionAuth) return sessionAuth;
  return authenticatePat(req, requiredScopes);
}

export function csrfValid(req, auth) {
  if (!auth || auth.type !== 'session') return true;
  const header = String(req.headers['x-csrf-token'] || '');
  return Boolean(header) && safeEqualText(header, auth.session.csrfToken);
}

export function sessionPayload(auth) {
  if (!auth) return { authenticated: false };
  return {
    authenticated: true,
    user: auth.user,
    csrfToken: auth.type === 'session' ? auth.session.csrfToken : null,
    expiresAt: auth.type === 'session' ? new Date(auth.session.expiresAt).toISOString() : auth.token?.expiresAt || null,
    authType: auth.type
  };
}

export function changePassword(userId, oldPassword, newPassword) {
  const doc = getUsersDocument();
  const user = doc.users.find(item => item.id === userId && item.active !== false);
  if (!user || !verifyPassword(oldPassword, user.password)) return { ok: false, error: 'Senha atual incorreta.' };
  if (typeof newPassword !== 'string' || newPassword.length < 12) return { ok: false, error: 'A nova senha deve ter pelo menos 12 caracteres.' };
  user.password = hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  atomicWriteJson(USERS_FILE, doc);
  // A nova senha muda o passwordFingerprint, invalidando os cookies emitidos antes.
  return { ok: true };
}

export function resetPasswordByEmail(email, newPassword) {
  const doc = getUsersDocument();
  const user = doc.users.find(item => String(item.email).toLowerCase() === String(email).trim().toLowerCase());
  if (!user) return { ok: false, error: 'Utilizador não encontrado.' };
  if (typeof newPassword !== 'string' || newPassword.length < 12) return { ok: false, error: 'A senha deve ter pelo menos 12 caracteres.' };
  user.password = hashPassword(newPassword);
  user.updatedAt = new Date().toISOString();
  atomicWriteJson(USERS_FILE, doc);
  return { ok: true, user: cleanUser(user) };
}

export function listTokens(userId) {
  return getTokensDocument().tokens
    .filter(token => token.userId === userId)
    .map(token => ({
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      scopes: token.scopes,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
      revokedAt: token.revokedAt
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function createPat(userId, { name = 'Token pessoal', scopes = ['auraex:read'], expiresInDays = 365 } = {}) {
  const allowedScopes = ['auraex:read', 'auraex:write'];
  const normalizedScopes = [...new Set((Array.isArray(scopes) ? scopes : []).filter(scope => allowedScopes.includes(scope)))];
  if (!normalizedScopes.includes('auraex:read')) normalizedScopes.unshift('auraex:read');
  const rawToken = `auraex_pat_${crypto.randomBytes(36).toString('base64url')}`;
  const now = new Date();
  const days = Math.min(Math.max(Number(expiresInDays) || 365, 1), 3650);
  const expiresAt = new Date(now.getTime() + days * 86400000).toISOString();
  const doc = getTokensDocument();
  const record = {
    id: `pat_${crypto.randomUUID()}`,
    name: String(name || 'Token pessoal').trim().slice(0, 80),
    prefix: rawToken.slice(0, 18),
    tokenHash: tokenHash(rawToken),
    userId,
    scopes: normalizedScopes,
    createdAt: now.toISOString(),
    expiresAt,
    lastUsedAt: null,
    revokedAt: null
  };
  doc.tokens.push(record);
  atomicWriteJson(TOKENS_FILE, doc);
  return { token: rawToken, record: { ...record, tokenHash: undefined } };
}

export function revokePat(userId, tokenId) {
  const doc = getTokensDocument();
  const record = doc.tokens.find(token => token.id === tokenId && token.userId === userId);
  if (!record) return false;
  record.revokedAt = new Date().toISOString();
  atomicWriteJson(TOKENS_FILE, doc);
  return true;
}

export function authInfoFromPat(auth) {
  if (!auth || auth.type !== 'pat' || auth.forbidden) return null;
  return {
    token: auth.rawToken,
    clientId: auth.token.id,
    scopes: auth.scopes,
    expiresAt: Math.floor(Date.parse(auth.token.expiresAt) / 1000)
  };
}

// Os cookies de sessão expiram sozinhos pelo campo `exp` assinado; não há
// estado em memória para limpar periodicamente.
