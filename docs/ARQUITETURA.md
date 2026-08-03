# Arquitetura do AuraEX 3.0

## Visão geral

```text
Navegador                              Agente de IA
    │                                      │
    │ login + cookie + CSRF                │ Bearer PAT
    ▼                                      ▼
┌──────────────────────────────────────────────────────┐
│                   server.mjs                         │
│ autenticação | API | arquivos | segurança | auditoria│
└───────────────┬──────────────────────┬───────────────┘
                │                      │
                ▼                      ▼
      dashboard-data.json       /mcp Streamable HTTP
                │                      │
                ▼                      ▼
         Excel import/export     ferramentas AuraEX
```

## Frontend

Aplicação sem framework para facilitar inspeção e entrega:

- `login.html`, `login.css`, `login.js`: autenticação inicial;
- `index.html`: dashboard e modais;
- `styles.css`: design system AuraEX e responsividade;
- `app.js`: estado, CRUD, filtros, calendário, onboarding, sessão e PATs;
- `excel-bridge.js`: leitura e geração de `.xlsx` no navegador;
- `vendor/jszip.min.js`: manipulação do pacote Open XML.

O navegador verifica `/api/auth/session` antes de carregar dados. Operações de escrita enviam o `X-CSRF-Token` recebido na sessão.

## Servidor HTTP

`server.mjs` concentra:

- arquivos estáticos protegidos;
- login, logout, sessão e troca de senha;
- gestão de PATs;
- API do workbook;
- endpoint MCP;
- validação de Host e Origin;
- Content Security Policy e demais headers;
- rate limit de login;
- auditoria;
- encerramento gracioso.

## Autenticação

### Interface

1. utilizador envia e-mail e senha;
2. servidor valida o hash PBKDF2;
3. cria sessão em memória;
4. devolve cookie `HttpOnly` e token CSRF;
5. frontend usa o token CSRF em operações de escrita.

### API e MCP

1. cliente envia `Authorization: Bearer auraex_pat_...`;
2. servidor calcula SHA-256 do token;
3. compara com o hash armazenado;
4. verifica validade, revogação e escopos;
5. injeta `authInfo` no contexto MCP.

O token completo nunca é guardado no arquivo de tokens; apenas o hash e o prefixo ficam persistidos.

## MCP

- endpoint: `POST /mcp`;
- transporte: Streamable HTTP;
- modo de resposta: JSON;
- autorização: PAT Bearer;
- escopos: `auraex:read` e `auraex:write`;
- metadados do recurso: `/.well-known/oauth-protected-resource/mcp`.

`mcp.mjs` usa o SDK oficial v2. Quando as dependências npm não estão disponíveis, `server.mjs` carrega `mcp-fallback.mjs`, que oferece as mesmas oito ferramentas essenciais por JSON-RPC/HTTP. O fallback existe para execução e demonstração local; a produção deve instalar e validar o SDK oficial.

## Dados

O estado principal segue o formato:

```json
{
  "workbookName": "Mentorados.xlsx",
  "sheets": [
    {
      "name": "2026",
      "rows": [["..."], ["..."]],
      "maxColumns": 20,
      "layout": {
        "nameCol": 1,
        "companyCol": 4,
        "sessionCols": [5, 6, 7]
      }
    }
  ]
}
```

Arquivos atuais:

- `storage/dashboard-data.json`: base operacional;
- `storage/initial-workbook.json`: seed/cópia inicial;
- `storage/users.json`: utilizadores com hash de senha;
- `storage/personal-access-tokens.json`: hashes e metadados dos PATs;
- `storage/audit-log.jsonl`: criado em execução.

As gravações do workbook são atómicas e preservam uma cópia anterior. Esta estratégia é adequada para protótipo e homologação, não para concorrência em produção.

## Limites conhecidos

- sessões ficam em memória;
- JSON não oferece transações multiutilizador;
- papéis ainda estão concentrados no administrador;
- auditoria está em arquivo local;
- PAT é apropriado para integração controlada, mas não substitui OAuth em um serviço MCP público;
- o fallback MCP não deve ser a implementação principal de produção;
- não há sincronização bidirecional automática com Microsoft Excel/OneDrive.

## Arquitetura alvo

```text
Frontend TypeScript
      │
API / BFF com RBAC
      ├── PostgreSQL
      ├── Redis para sessões/rate limit
      ├── armazenamento de arquivos
      ├── serviço de importação/exportação Excel
      ├── auditoria e observabilidade
      └── servidor MCP oficial + OAuth 2.1/PAT administrado
```

A migração deve preservar o mapeamento da planilha atual, as ferramentas MCP e a simplicidade visual da dashboard.
