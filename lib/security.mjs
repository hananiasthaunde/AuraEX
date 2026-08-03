import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORAGE_DIR = path.join(ROOT, 'storage');
const USERS_FILE = path.join(STORAGE_DIR, 'users.json');
const TOKENS_FILE = path.join(STORAGE_DIR, 'personal-access-tokens.json');
const AUDIT_FILE = path.join(STORAGE_DIR, 'audit-log.jsonl');

const sessions = new Map();
const loginAttempts = new Map();
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

export function assertLoginAllowed(req, email) {
  const key = loginKey(req, email);
  const current = loginAttempts.get(key);
  if (!current) return { allowed: true };
  const now = Date.now();
  if (current.blockedUntil && current.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.blockedUntil - now) / 1000) };
  }
  if (current.blockedUntil && current.blockedUntil <= now) loginAttempts.delete(key);
  return { allowed: true };
}

export function recordLoginFailure(req, email) {
  const key = loginKey(req, email);
  const now = Date.now();
  const current = loginAttempts.get(key) || { count: 0, firstAt: now, blockedUntil: 0 };
  if (now - current.firstAt > 15 * 60 * 1000) {
    current.count = 0;
    current.firstAt = now;
  }
  current.count += 1;
  if (current.count >= 5) current.blockedUntil = now + 15 * 60 * 1000;
  loginAttempts.set(key, current);
}

export function clearLoginFailures(req, email) {
  loginAttempts.delete(loginKey(req, email));
}

export function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return getUsersDocument().users.find(user => user.active !== false && String(user.email).toLowerCase() === normalized) || null;
}

function sessionHours() {
  const value = Number(process.env.AURAEX_SESSION_HOURS || 12);
  return Number.isFinite(value) && value > 0 ? value : 12;
}

export function createSession(user) {
  const id = crypto.randomBytes(32).toString('base64url');
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const expiresAt = now + sessionHours() * 60 * 60 * 1000;
  sessions.set(id, { id, userId: user.id, csrfToken, createdAt: now, expiresAt, lastSeenAt: now });
  return { id, csrfToken, expiresAt };
}

export function destroySession(req) {
  const id = parseCookies(req).auraex_session;
  if (id) sessions.delete(id);
}

export function sessionCookie(sessionId, { clear = false } = {}) {
  const secure = String(process.env.AURAEX_PUBLIC_URL || '').startsWith('https://');
  const maxAge = clear ? 0 : Math.round(sessionHours() * 60 * 60);
  return [
    `auraex_session=${clear ? '' : encodeURIComponent(sessionId)}`,
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
  const id = parseCookies(req).auraex_session;
  if (!id) return null;
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(id);
    return null;
  }
  const user = userById(session.userId);
  if (!user) {
    sessions.delete(id);
    return null;
  }
  session.lastSeenAt = Date.now();
  return { type: 'session', user: cleanUser(user), session };
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
  for (const [id, session] of sessions) if (session.userId === userId) sessions.delete(id);
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

export function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) if (session.expiresAt <= now) sessions.delete(id);
}

setInterval(cleanupSessions, 15 * 60 * 1000).unref();
