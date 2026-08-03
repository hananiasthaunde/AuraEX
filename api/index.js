// Sem await de topo: se o builder compilar este ficheiro para CommonJS, um
// top-level await parte o build. A importação dinâmica preguiçosa funciona nos
// dois formatos e continua a apanhar falhas de carregamento do server.mjs, que
// de outro modo produziriam um FUNCTION_INVOCATION_FAILED sem qualquer detalhe.
let serverPromise = null;

function loadServer() {
  if (!serverPromise) serverPromise = import('../server.mjs');
  return serverPromise;
}

function sendError(res, error, phase) {
  console.error(`[AuraEX] Falha na fase "${phase}":`, error);
  if (res.headersSent) return res.end();
  const body = JSON.stringify({
    error: 'Falha ao inicializar a aplicação.',
    phase,
    name: error?.name || null,
    code: error?.code || null,
    message: error?.message || String(error),
    frames: String(error?.stack || '').split('\n').slice(1, 5).map(line => line.trim())
  });
  res.writeHead(500, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

export default async function handler(req, res) {
  let handleRequest;
  try {
    ({ handleRequest } = await loadServer());
  } catch (error) {
    serverPromise = null; // permite nova tentativa na invocação seguinte
    return sendError(res, error, 'import');
  }
  try {
    return await handleRequest(req, res);
  } catch (error) {
    return sendError(res, error, 'handler');
  }
}
