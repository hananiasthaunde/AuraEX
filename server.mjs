import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { readWorkbook, validateWorkbook, writeWorkbook } from './lib/data-store.mjs';
import {
  assertLoginAllowed,
  audit,
  authInfoFromPat,
  authenticateApi,
  authenticatePat,
  authenticateSession,
  changePassword,
  clearLoginFailures,
  createPat,
  createSession,
  csrfValid,
  destroySession,
  findUserByEmail,
  listTokens,
  loadDotEnv,
  recordLoginFailure,
  revokePat,
  sessionCookie,
  sessionPayload,
  verifyPassword
} from './lib/security.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = fs.existsSync(path.join(ROOT, 'public')) ? path.join(ROOT, 'public') : ROOT;
loadDotEnv(path.join(ROOT, '.env'));

let mcpHandler;
let mcpImplementation = 'official-sdk-v2';
try {
  ({ mcpHandler } = await import('./mcp.mjs'));
} catch (error) {
  ({ mcpFallbackHandler: mcpHandler } = await import('./mcp-fallback.mjs'));
  mcpImplementation = 'builtin-fallback';
  console.warn('[AuraEX] SDK MCP oficial não instalado; usando implementação compatível embutida. Execute npm install para ativar o SDK v2.');
}

const PORT = Number(process.env.AURAEX_PORT || process.env.PORT || 8080);
const BIND = process.env.AURAEX_BIND || '127.0.0.1';
const PUBLIC_URL = process.env.AURAEX_PUBLIC_URL || `http://${BIND}:${PORT}`;
const MAX_BODY = 20 * 1024 * 1024;
const LOGIN_MAX_BODY = 64 * 1024;
const ALLOWED_HOSTS = new Set(String(process.env.AURAEX_ALLOWED_HOSTS || '127.0.0.1,localhost').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
const ALLOWED_ORIGINS = new Set(String(process.env.AURAEX_ALLOWED_ORIGINS || PUBLIC_URL).split(',').map(value => value.trim()).filter(Boolean));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const PUBLIC_FILES = new Set(['/login.html', '/login.js', '/login.css', '/assets/logo.svg']);
const BLOCKED_PATHS = ['/storage/', '/lib/', '/scripts/', '/config/', '/node_modules/', '/.env', '/CREDENCIAIS_INICIAIS.txt', '/server.mjs', '/server.js', '/mcp.mjs', '/package.json', '/package-lock.json'];

function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function requestHost(req) {
  try { return new URL(`http://${req.headers.host || ''}`).hostname.toLowerCase(); }
  catch { return ''; }
}

function isAllowedHost(req) {
  const host = requestHost(req);
  return Boolean(host) && (ALLOWED_HOSTS.has(host) || host === '::1');
}

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
    ...extra
  };
}

function corsHeaders(req) {
  const origin = String(req.headers.origin || '');
  if (!origin || !isAllowedOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-Id',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate, Last-Event-Id, Mcp-Protocol-Version'
  };
}

function sendJson(req, res, status, payload, extra = {}) {
  const body = status === 204 ? '' : JSON.stringify(payload);
  res.writeHead(status, securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...corsHeaders(req),
    ...extra
  }));
  res.end(body);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, securityHeaders({ Location: location, 'Cache-Control': 'no-store' }));
  res.end();
}

async function readJsonBody(req, limit = MAX_BODY) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Corpo demasiado grande.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch {
    const error = new Error('JSON inválido.');
    error.statusCode = 400;
    throw error;
  }
}

function serveFile(req, res, filePath, { noCache = false } = {}) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return sendJson(req, res, 404, { error: 'Ficheiro não encontrado.' });
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, securityHeaders({
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': noCache || filePath.endsWith('.html') ? 'no-store' : 'private, max-age=300'
    }));
    fs.createReadStream(filePath).pipe(res);
  });
}

function requireApiAuth(req, res, scope) {
  const auth = authenticateApi(req, scope ? [scope] : []);
  if (!auth) {
    sendJson(req, res, 401, { error: 'Não autenticado.' }, { 'WWW-Authenticate': 'Bearer realm="AuraEX API"' });
    return null;
  }
  if (auth.forbidden) {
    sendJson(req, res, 403, { error: 'Permissão insuficiente.', missingScopes: auth.missingScopes });
    return null;
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET') && !csrfValid(req, auth)) {
    sendJson(req, res, 403, { error: 'Token CSRF inválido. Atualize a página e tente novamente.' });
    return null;
  }
  return auth;
}

function handleOptions(req, res) {
  if (!isAllowedOrigin(req.headers.origin)) return sendJson(req, res, 403, { error: 'Origem não permitida.' });
  res.writeHead(204, securityHeaders({ ...corsHeaders(req), 'Cache-Control': 'no-store' }));
  res.end();
}

async function handleAuth(req, res, pathname) {
  if (pathname === '/api/auth/session' && req.method === 'GET') {
    return sendJson(req, res, 200, sessionPayload(authenticateSession(req)));
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJsonBody(req, LOGIN_MAX_BODY);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const limit = assertLoginAllowed(req, email);
    if (!limit.allowed) return sendJson(req, res, 429, { error: 'Muitas tentativas. Tente novamente mais tarde.', retryAfterSeconds: limit.retryAfterSeconds }, { 'Retry-After': String(limit.retryAfterSeconds) });
    const user = findUserByEmail(email);
    if (!user || !verifyPassword(password, user.password)) {
      recordLoginFailure(req, email);
      audit(req, 'auth.login_failed', { email });
      return sendJson(req, res, 401, { error: 'E-mail ou senha incorretos.' });
    }
    clearLoginFailures(req, email);
    const session = createSession(user);
    audit(req, 'auth.login_success', {}, { id: user.id, email: user.email, type: 'user' });
    return sendJson(req, res, 200, sessionPayload({ type: 'session', user: { id: user.id, name: user.name, email: user.email, role: user.role }, session }), { 'Set-Cookie': sessionCookie(session.id) });
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const auth = requireApiAuth(req, res);
    if (!auth || auth.type !== 'session') return;
    destroySession(req);
    audit(req, 'auth.logout', {}, { ...auth.user, type: 'user' });
    return sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', { clear: true }) });
  }

  if (pathname === '/api/auth/password' && req.method === 'POST') {
    const auth = requireApiAuth(req, res);
    if (!auth || auth.type !== 'session') return;
    const body = await readJsonBody(req, LOGIN_MAX_BODY);
    const result = changePassword(auth.user.id, body.currentPassword, body.newPassword);
    if (!result.ok) return sendJson(req, res, 400, { error: result.error });
    audit(req, 'auth.password_changed', {}, { ...auth.user, type: 'user' });
    return sendJson(req, res, 200, { ok: true, message: 'Senha alterada. Entre novamente.' }, { 'Set-Cookie': sessionCookie('', { clear: true }) });
  }

  return sendJson(req, res, 404, { error: 'Rota de autenticação não encontrada.' });
}

async function handleTokens(req, res, pathname) {
  const auth = requireApiAuth(req, res);
  if (!auth || auth.type !== 'session') return;
  if (auth.user.role !== 'admin') return sendJson(req, res, 403, { error: 'Apenas administradores podem gerir tokens.' });

  if (pathname === '/api/tokens' && req.method === 'GET') {
    return sendJson(req, res, 200, { tokens: listTokens(auth.user.id) });
  }

  if (pathname === '/api/tokens' && req.method === 'POST') {
    const body = await readJsonBody(req, LOGIN_MAX_BODY);
    const created = createPat(auth.user.id, { name: body.name, scopes: body.scopes, expiresInDays: body.expiresInDays });
    audit(req, 'pat.created', { tokenId: created.record.id, name: created.record.name, scopes: created.record.scopes }, { ...auth.user, type: 'user' });
    return sendJson(req, res, 201, { token: created.token, metadata: created.record, warning: 'Este token só será mostrado uma vez.' });
  }

  const match = pathname.match(/^\/api\/tokens\/([^/]+)$/);
  if (match && req.method === 'DELETE') {
    const ok = revokePat(auth.user.id, decodeURIComponent(match[1]));
    if (!ok) return sendJson(req, res, 404, { error: 'Token não encontrado.' });
    audit(req, 'pat.revoked', { tokenId: match[1] }, { ...auth.user, type: 'user' });
    return sendJson(req, res, 200, { ok: true });
  }

  return sendJson(req, res, 405, { error: 'Método não permitido.' });
}

async function handleWorkbookApi(req, res) {
  if (req.method === 'GET') {
    const auth = requireApiAuth(req, res, 'auraex:read');
    if (!auth) return;
    audit(req, 'workbook.read', {}, { ...auth.user, type: auth.type });
    return sendJson(req, res, 200, readWorkbook());
  }

  if (req.method === 'POST') {
    const auth = requireApiAuth(req, res, 'auraex:write');
    if (!auth) return;
    const data = await readJsonBody(req, MAX_BODY);
    const error = validateWorkbook(data);
    if (error) return sendJson(req, res, 400, { error });
    const saved = writeWorkbook(data);
    audit(req, 'workbook.write', { sheets: saved.sheets.length }, { ...auth.user, type: auth.type });
    return sendJson(req, res, 200, { ok: true, savedAt: saved.generatedAt });
  }

  return sendJson(req, res, 405, { error: 'Método não permitido.' });
}

function handleExportExcelApi(req, res) {
  const auth = requireApiAuth(req, res, 'auraex:read');
  if (!auth) return;
  const filePath = path.join(ROOT, '02.07.2026 - Mentorados Atualizada (Visualmente Aprimorada).xlsx');
  if (!fs.existsSync(filePath)) return sendJson(req, res, 404, { error: 'Ficheiro não encontrado.' });
  audit(req, 'workbook.export', { type: 'beautiful' }, { ...auth.user, type: auth.type });
  res.writeHead(200, securityHeaders({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="AuraEX-Relatorio-Mentorias-Aprimorado.xlsx"',
    'Cache-Control': 'no-store'
  }));
  fs.createReadStream(filePath).pipe(res);
}

function nodeRequestToWebRequest(req) {
  const url = new URL(req.url, PUBLIC_URL);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
    else if (value !== undefined) headers.set(key, value);
  }
  const options = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    options.body = req;
    options.duplex = 'half';
  }
  return new Request(url, options);
}

async function sendWebResponse(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  res.writeHead(response.status, securityHeaders(headers));
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).pipe(res);
}

async function handleMcp(req, res) {
  if (!isAllowedHost(req)) return sendJson(req, res, 403, { error: 'Host não permitido.' });
  if (!isAllowedOrigin(req.headers.origin)) return sendJson(req, res, 403, { error: 'Origem não permitida.' });
  if (req.method === 'OPTIONS') return handleOptions(req, res);
  const auth = authenticatePat(req, ['auraex:read']);
  const resourceMetadata = `${PUBLIC_URL.replace(/\/$/, '')}/.well-known/oauth-protected-resource/mcp`;
  if (!auth) {
    return sendJson(req, res, 401, { error: 'invalid_token', error_description: 'Informe um token AuraEX válido no cabeçalho Authorization.' }, {
      'WWW-Authenticate': `Bearer realm="AuraEX MCP", resource_metadata="${resourceMetadata}", scope="auraex:read"`
    });
  }
  if (auth.forbidden) {
    return sendJson(req, res, 403, { error: 'insufficient_scope', missingScopes: auth.missingScopes }, {
      'WWW-Authenticate': `Bearer realm="AuraEX MCP", scope="auraex:read"`
    });
  }
  const authInfo = authInfoFromPat(auth);
  audit(req, 'mcp.request', { method: req.method }, { ...auth.user, type: 'pat' });
  const webRequest = nodeRequestToWebRequest(req);
  const response = await mcpHandler.fetch(webRequest, { authInfo });
  return sendWebResponse(res, response);
}

export async function handleRequest(req, res) {
  try {
    const requestUrl = new URL(req.url, PUBLIC_URL);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (req.method === 'OPTIONS' && (pathname.startsWith('/api/') || pathname === '/mcp')) return handleOptions(req, res);

    if (pathname === '/health') {
      return sendJson(req, res, 200, { ok: true, app: 'AuraEX', version: '3.0.0', auth: true, mcp: true, mcpImplementation, time: new Date().toISOString() });
    }

    if (pathname === '/.well-known/oauth-protected-resource/mcp') {
      return sendJson(req, res, 200, {
        resource: `${PUBLIC_URL.replace(/\/$/, '')}/mcp`,
        scopes_supported: ['auraex:read', 'auraex:write'],
        bearer_methods_supported: ['header'],
        authorization_note: 'Este pacote usa tokens de acesso pessoal pré-configurados. Para produção pública, migre para OAuth 2.1.'
      });
    }

    if (pathname === '/mcp') return handleMcp(req, res);
    if (pathname.startsWith('/api/auth/')) return handleAuth(req, res, pathname);
    if (pathname === '/api/tokens' || pathname.startsWith('/api/tokens/')) return handleTokens(req, res, pathname);
    if (pathname === '/api/mentorados') return handleWorkbookApi(req, res);
    if (pathname === '/api/export/excel') return handleExportExcelApi(req, res);

    if (process.env.VERCEL) {
      return sendJson(req, res, 404, { error: 'Rota não encontrada.' });
    }

    if (pathname === '/login' || pathname === '/login.html') {
      if (authenticateSession(req)) return redirect(res, '/');
      return serveFile(req, res, path.join(PUBLIC_DIR, 'login.html'), { noCache: true });
    }

    if (pathname === '/') {
      if (!authenticateSession(req)) return redirect(res, '/login.html');
      return serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'), { noCache: true });
    }

    if (BLOCKED_PATHS.some(blocked => pathname === blocked || pathname.startsWith(blocked))) return sendJson(req, res, 403, { error: 'Acesso negado.' });

    if (!PUBLIC_FILES.has(pathname) && !authenticateSession(req)) {
      if (pathname.startsWith('/api/')) return sendJson(req, res, 401, { error: 'Não autenticado.' });
      return redirect(res, '/login.html');
    }

    const candidate = path.resolve(PUBLIC_DIR, `.${pathname}`);
    if (!candidate.startsWith(`${PUBLIC_DIR}${path.sep}`) && candidate !== PUBLIC_DIR) return sendJson(req, res, 403, { error: 'Acesso negado.' });
    return serveFile(req, res, candidate, { noCache: true });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error(error);
    if (!res.headersSent) return sendJson(req, res, status, { error: status >= 500 ? 'Erro interno do servidor.' : error.message, detail: process.env.NODE_ENV === 'development' ? error.message : undefined });
    res.end();
  }
}

const server = http.createServer(handleRequest);

if (!process.env.VERCEL) {
  server.listen(PORT, BIND, () => {
    console.log('\nAuraEX 3.0 em execução:');
    console.log(`  Sistema: ${PUBLIC_URL}`);
    console.log(`  Login:   ${PUBLIC_URL.replace(/\/$/, '')}/login.html`);
    console.log(`  MCP:     ${PUBLIC_URL.replace(/\/$/, '')}/mcp (${mcpImplementation})`);
    console.log('\nCredenciais iniciais: CREDENCIAIS_INICIAIS.txt');
    console.log('Para encerrar, pressione Ctrl+C.\n');
  });

  async function shutdown(signal) {
    console.log(`\nRecebido ${signal}. A encerrar...`);
    server.close();
    await mcpHandler.close();
    process.exit(0);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
