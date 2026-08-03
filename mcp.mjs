import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { addMentee, getMentee, getSummary, listAgenda, listMentees, readWorkbook, updateSession } from './lib/data-store.mjs';

function textResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    isError
  };
}

function requireScope(ctx, scope) {
  const scopes = ctx?.http?.authInfo?.scopes || [];
  if (scopes.includes(scope)) return null;
  return textResult({ error: 'insufficient_scope', requiredScope: scope }, true);
}

function buildMcpServer() {
  const server = new McpServer({
    name: 'auraex-mentorias',
    title: 'AuraEX — Gestão de Mentorias',
    version: '3.0.0',
    description: 'Consulta e atualização controlada de mentorados, sessões e agenda do AuraEX.'
  });

  server.registerTool(
    'auraex_status',
    {
      title: 'Estado do AuraEX',
      description: 'Verifica se o servidor AuraEX e a base de mentorias estão acessíveis.',
      inputSchema: z.object({})
    },
    async (_args, ctx) => {
      const denied = requireScope(ctx, 'auraex:read');
      if (denied) return denied;
      const workbook = readWorkbook();
      return textResult({ ok: true, app: 'AuraEX', version: '3.0.0', workbook: workbook.workbookName, sheets: workbook.sheets.map(sheet => sheet.name), time: new Date().toISOString() });
    }
  );

  server.registerTool(
    'listar_programas',
    {
      title: 'Listar programas',
      description: 'Lista as abas/programas disponíveis no documento conectado.',
      inputSchema: z.object({})
    },
    async (_args, ctx) => {
      const denied = requireScope(ctx, 'auraex:read');
      if (denied) return denied;
      const workbook = readWorkbook();
      return textResult({ workbook: workbook.workbookName, programs: workbook.sheets.map(sheet => ({ name: sheet.name, rows: Math.max(0, sheet.rows.length - (sheet.layout?.dataStart ?? 1)) })) });
    }
  );

  server.registerTool(
    'resumo_mentorias',
    {
      title: 'Resumo das mentorias',
      description: 'Retorna indicadores gerais de um programa: mentorados, progresso e empresas.',
      inputSchema: z.object({ program: z.string().optional().describe('Nome da aba/programa. Quando omitido, usa 2026 ou a primeira aba.') })
    },
    async ({ program }, ctx) => {
      const denied = requireScope(ctx, 'auraex:read');
      return denied || textResult(getSummary({ sheetName: program }));
    }
  );

  server.registerTool(
    'listar_mentorados',
    {
      title: 'Listar mentorados',
      description: 'Pesquisa mentorados por programa, nome, e-mail, telefone, empresa ou estado de progresso.',
      inputSchema: z.object({
        program: z.string().optional(),
        search: z.string().optional(),
        company: z.string().optional(),
        status: z.enum(['not-started', 'in-progress', 'completed']).optional(),
        limit: z.number().int().min(1).max(200).default(50)
      })
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, 'auraex:read');
      if (denied) return denied;
      return textResult(listMentees({ sheetName: args.program, search: args.search, company: args.company, status: args.status, limit: args.limit }));
    }
  );

  server.registerTool(
    'obter_mentorado',
    {
      title: 'Obter mentorado',
      description: 'Obtém o cadastro e as doze sessões de um mentorado. Prefira pesquisar por e-mail.',
      inputSchema: z.object({
        program: z.string().optional(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        rowIndex: z.number().int().min(0).optional()
      }).refine(value => value.name || value.email || value.rowIndex !== undefined, { message: 'Informe name, email ou rowIndex.' })
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, 'auraex:read');
      if (denied) return denied;
      const item = getMentee({ sheetName: args.program, name: args.name, email: args.email, rowIndex: args.rowIndex });
      return item ? textResult(item) : textResult({ error: 'Mentorado não encontrado.' }, true);
    }
  );

  server.registerTool(
    'listar_agenda',
    {
      title: 'Listar agenda',
      description: 'Lista sessões agendadas e pendências identificadas na planilha.',
      inputSchema: z.object({ program: z.string().optional(), search: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) })
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, 'auraex:read');
      return denied || textResult(listAgenda({ sheetName: args.program, search: args.search, limit: args.limit }));
    }
  );

  server.registerTool(
    'atualizar_sessao',
    {
      title: 'Atualizar sessão',
      description: 'Atualiza a marcação de uma sessão. Use “ok” para concluída ou uma data/observação para agenda e pendência.',
      inputSchema: z.object({
        program: z.string().optional(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        rowIndex: z.number().int().min(0).optional(),
        sessionNumber: z.number().int().min(1).max(12),
        value: z.string().max(500)
      }).refine(value => value.name || value.email || value.rowIndex !== undefined, { message: 'Informe name, email ou rowIndex.' }),
      annotations: { title: 'Atualizar sessão', readOnlyHint: false, destructiveHint: false, idempotentHint: true }
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, 'auraex:write');
      if (denied) return denied;
      try {
        const item = updateSession({ sheetName: args.program, name: args.name, email: args.email, rowIndex: args.rowIndex, sessionNumber: args.sessionNumber, value: args.value });
        return textResult({ ok: true, mentorado: item });
      } catch (error) {
        return textResult({ error: error.message }, true);
      }
    }
  );

  server.registerTool(
    'adicionar_mentorado',
    {
      title: 'Adicionar mentorado',
      description: 'Cria um novo mentorado no programa selecionado.',
      inputSchema: z.object({
        program: z.string().optional(),
        name: z.string().min(2).max(160),
        email: z.string().email().or(z.literal('')).optional(),
        phone: z.string().max(60).optional(),
        company: z.string().max(120).optional()
      }),
      annotations: { title: 'Adicionar mentorado', readOnlyHint: false, destructiveHint: false, idempotentHint: false }
    },
    async (args, ctx) => {
      const denied = requireScope(ctx, 'auraex:write');
      if (denied) return denied;
      try {
        return textResult({ ok: true, mentorado: addMentee({ sheetName: args.program, name: args.name, email: args.email, phone: args.phone, company: args.company }) });
      } catch (error) {
        return textResult({ error: error.message }, true);
      }
    }
  );

  return server;
}

export const mcpHandler = createMcpHandler(buildMcpServer, { responseMode: 'json' });
