import fs from 'node:fs';

const configuredUrl = process.env.AURAEX_TEST_URL || process.env.AURAEX_URL || 'http://127.0.0.1:8080/mcp';
const endpoint = configuredUrl.endsWith('/mcp') ? configuredUrl : `${configuredUrl.replace(/\/$/, '')}/mcp`;
let token = process.env.AURAEX_TEST_TOKEN || process.env.AURAEX_PAT || '';
const credentialsFile = new URL('../CREDENCIAIS_INICIAIS.txt', import.meta.url);

if (!token && fs.existsSync(credentialsFile)) {
  const text = fs.readFileSync(credentialsFile, 'utf8');
  token = text.match(/auraex_pat_[A-Za-z0-9_-]+/)?.[0] || '';
}
if (!token) {
  console.error('Defina AURAEX_TEST_TOKEN/AURAEX_PAT ou mantenha CREDENCIAIS_INICIAIS.txt na raiz.');
  process.exit(1);
}

async function rpc(id, method, params = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2026-07-28'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

try {
  const initialized = await rpc(1, 'initialize', {
    protocolVersion: '2026-07-28',
    capabilities: {},
    clientInfo: { name: 'auraex-smoke-test', version: '1.0.0' }
  });
  console.log('Initialize:', initialized.result?.serverInfo || initialized);
  const tools = await rpc(2, 'tools/list');
  console.log('Ferramentas:', tools.result?.tools?.map(tool => tool.name).join(', '));
  const status = await rpc(3, 'tools/call', { name: 'auraex_status', arguments: {} });
  console.log('Status:', status.result?.content?.[0]?.text || status);
  console.log('\nTeste MCP concluído com sucesso.');
} catch (error) {
  console.error(`Falha no teste MCP: ${error.message}`);
  process.exit(1);
}
