import { addMentee, getMentee, getSummary, listAgenda, listMentees, readWorkbook, updateSession } from './lib/data-store.mjs';

const TOOLS = [
  {
    name: 'auraex_status',
    title: 'Estado do AuraEX',
    description: 'Verifica se o servidor AuraEX e a base de mentorias estão acessíveis.',
    inputSchema: { type: 'object', additionalProperties: false }
  },
  {
    name: 'listar_programas',
    title: 'Listar programas',
    description: 'Lista as abas/programas disponíveis no documento conectado.',
    inputSchema: { type: 'object', additionalProperties: false }
  },
  {
    name: 'resumo_mentorias',
    title: 'Resumo das mentorias',
    description: 'Retorna indicadores gerais de um programa.',
    inputSchema: { type: 'object', properties: { program: { type: 'string' } }, additionalProperties: false }
  },
  {
    name: 'listar_mentorados',
    title: 'Listar mentorados',
    description: 'Pesquisa mentorados por programa, texto, empresa ou estado.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' }, search: { type: 'string' }, company: { type: 'string' },
        status: { type: 'string', enum: ['not-started', 'in-progress', 'completed'] },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'obter_mentorado',
    title: 'Obter mentorado',
    description: 'Obtém o cadastro e as sessões de um mentorado.',
    inputSchema: {
      type: 'object',
      properties: { program: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, rowIndex: { type: 'integer', minimum: 0 } },
      anyOf: [{ required: ['name'] }, { required: ['email'] }, { required: ['rowIndex'] }],
      additionalProperties: false
    }
  },
  {
    name: 'listar_agenda',
    title: 'Listar agenda',
    description: 'Lista sessões agendadas e pendências.',
    inputSchema: { type: 'object', properties: { program: { type: 'string' }, search: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 } }, additionalProperties: false }
  },
  {
    name: 'atualizar_sessao',
    title: 'Atualizar sessão',
    description: 'Atualiza a marcação de uma sessão.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string' }, name: { type: 'string' }, email: { type: 'string' }, rowIndex: { type: 'integer', minimum: 0 },
        sessionNumber: { type: 'integer', minimum: 1, maximum: 12 }, value: { type: 'string', maxLength: 500 }
      },
      required: ['sessionNumber', 'value'],
      anyOf: [{ required: ['name'] }, { required: ['email'] }, { required: ['rowIndex'] }],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  },
  {
    name: 'adicionar_mentorado',
    title: 'Adicionar mentorado',
    description: 'Cria um novo mentorado.',
    inputSchema: {
      type: 'object',
      properties: { program: { type: 'string' }, name: { type: 'string', minLength: 2 }, email: { type: 'string' }, phone: { type: 'string' }, company: { type: 'string' } },
      required: ['name'], additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }
];

function result(id, value) { return Response.json({ jsonrpc: '2.0', id, result: value }); }
function error(id, code, message, data) { return Response.json({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } }); }
function text(value, isError = false) { return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }], isError }; }
function hasScope(authInfo, scope) { return Array.isArray(authInfo?.scopes) && authInfo.scopes.includes(scope); }

async function callTool(name, args, authInfo) {
  const write = ['atualizar_sessao', 'adicionar_mentorado'].includes(name);
  const required = write ? 'auraex:write' : 'auraex:read';
  if (!hasScope(authInfo, required)) return text({ error: 'insufficient_scope', requiredScope: required }, true);
  try {
    if (name === 'auraex_status') {
      const workbook = readWorkbook();
      return text({ ok: true, app: 'AuraEX', version: '3.0.0', transport: 'builtin-streamable-http', workbook: workbook.workbookName, sheets: workbook.sheets.map(sheet => sheet.name), time: new Date().toISOString() });
    }
    if (name === 'listar_programas') {
      const workbook = readWorkbook();
      return text({ workbook: workbook.workbookName, programs: workbook.sheets.map(sheet => ({ name: sheet.name, rows: Math.max(0, sheet.rows.length - (sheet.layout?.dataStart ?? 1)) })) });
    }
    if (name === 'resumo_mentorias') return text(getSummary({ sheetName: args.program }));
    if (name === 'listar_mentorados') return text(listMentees({ sheetName: args.program, search: args.search, company: args.company, status: args.status, limit: args.limit || 50 }));
    if (name === 'obter_mentorado') {
      const item = getMentee({ sheetName: args.program, name: args.name, email: args.email, rowIndex: args.rowIndex });
      return item ? text(item) : text({ error: 'Mentorado não encontrado.' }, true);
    }
    if (name === 'listar_agenda') return text(listAgenda({ sheetName: args.program, search: args.search, limit: args.limit || 100 }));
    if (name === 'atualizar_sessao') return text({ ok: true, mentorado: updateSession({ sheetName: args.program, name: args.name, email: args.email, rowIndex: args.rowIndex, sessionNumber: args.sessionNumber, value: args.value }) });
    if (name === 'adicionar_mentorado') return text({ ok: true, mentorado: addMentee({ sheetName: args.program, name: args.name, email: args.email, phone: args.phone, company: args.company }) });
    return text({ error: `Ferramenta desconhecida: ${name}` }, true);
  } catch (cause) {
    return text({ error: cause.message }, true);
  }
}

export const mcpFallbackHandler = {
  async fetch(request, context = {}) {
    if (request.method === 'GET') return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS' } });
    let message;
    try { message = await request.json(); }
    catch { return error(null, -32700, 'Parse error'); }
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return error(message?.id ?? null, -32600, 'Invalid Request');
    const id = message.id;
    if (message.method === 'notifications/initialized' || message.method.startsWith('notifications/')) return new Response(null, { status: 202 });
    if (id === undefined) return new Response(null, { status: 202 });
    if (message.method === 'initialize') {
      const requested = message.params?.protocolVersion;
      const supported = ['2026-07-28', '2025-11-25', '2025-03-26', '2024-11-05'];
      const protocolVersion = supported.includes(requested) ? requested : '2026-07-28';
      return result(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'auraex-mentorias', title: 'AuraEX — Gestão de Mentorias', version: '3.0.0', description: 'Servidor MCP protegido por token pessoal.' },
        instructions: 'Use as ferramentas de leitura para consultar mentorados e agenda. Ferramentas de escrita exigem o escopo auraex:write.'
      });
    }
    if (message.method === 'ping') return result(id, {});
    if (message.method === 'tools/list') return result(id, { tools: TOOLS });
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      const args = message.params?.arguments || {};
      if (typeof name !== 'string') return error(id, -32602, 'Invalid params');
      return result(id, await callTool(name, args, context.authInfo));
    }
    if (message.method === 'resources/list') return result(id, { resources: [] });
    if (message.method === 'prompts/list') return result(id, { prompts: [] });
    return error(id, -32601, 'Method not found');
  },
  async close() {}
};
