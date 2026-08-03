# AuraEX 3.0 — Gestão de Mentorias com Login, API e MCP

O AuraEX é uma dashboard web para gerir mentorados, sessões, agenda e exportações Excel. Esta versão acrescenta autenticação, gestão de tokens de acesso pessoal e um servidor MCP para permitir que agentes de IA consultem e atualizem dados de forma controlada.

> Este pacote é um sistema executável para validação e evolução técnica. Antes de uma publicação pública com dados reais, aplique o checklist de produção descrito neste documento e no prompt do agente.

## O que está incluído

- página de login com a identidade visual AuraEX;
- sessão autenticada por cookie `HttpOnly`;
- proteção CSRF nas operações feitas pela interface;
- limitação de tentativas de login;
- alteração de senha dentro do sistema;
- criação, listagem e revogação de tokens pessoais;
- API protegida por sessão ou PAT;
- endpoint MCP em Streamable HTTP;
- escopos separados para leitura e escrita;
- registo de auditoria em JSONL;
- dashboard, onboarding, mentorados, tabela grande de sessões, agenda e Excel;
- servidor MCP oficial v2 quando as dependências estiverem instaladas;
- implementação MCP compatível embutida como contingência local;
- scripts de administração, teste e inicialização;
- Dockerfile e Docker Compose;
- documentação e prompt completo para o próximo agente de programação.

## Credenciais iniciais

As credenciais entregues estão em `CREDENCIAIS_INICIAIS.txt`.

```text
E-mail: ananias.thaunde@sbdc.com.br
Senha: AuraEX#mYDgBGpaBTjJiQ
```

O token inicial para API/MCP também está nesse arquivo. Troque a senha e revogue o token inicial antes de publicar a aplicação.

## Executar no Windows

1. Instale o Node.js 20 ou superior.
2. Extraia a pasta do projeto.
3. Execute `INICIAR_AURAEX.bat`.
4. Abra `http://127.0.0.1:8080`.
5. Entre com as credenciais iniciais.

O iniciador tenta instalar as dependências. Quando não houver acesso ao registro npm, o servidor continua funcional com a implementação MCP compatível embutida.

## Executar no Linux ou macOS

```bash
chmod +x iniciar-auraex.sh
./iniciar-auraex.sh
```

Execução manual:

```bash
npm install
npm start
```

## Executar com Docker

```bash
docker compose up --build
```

Depois, abra `http://localhost:8080`.

Para acesso por outro computador da rede, altere `AURAEX_PUBLIC_URL`, `AURAEX_ALLOWED_HOSTS` e `AURAEX_ALLOWED_ORIGINS`. Não exponha a porta diretamente à internet sem HTTPS e proxy reverso.

## Login e segurança

A interface usa:

- cookie de sessão `HttpOnly`, `SameSite=Strict`;
- token CSRF para ações de escrita;
- hash de senha PBKDF2-SHA256 com salt;
- headers de segurança e Content Security Policy;
- validação de Host e Origin;
- rate limit de login;
- auditoria de login, tokens, API e MCP.

As sessões ficam em memória e terminam ao reiniciar o servidor. Para produção, migre sessões, utilizadores, tokens e auditoria para PostgreSQL ou Redis conforme a arquitetura final.

## Tokens de acesso pessoal

Aceda a **Configurações → Integrações e MCP** para:

- criar um token;
- selecionar os escopos;
- definir a validade;
- copiar o token, mostrado apenas uma vez;
- revogar tokens antigos.

Escopos:

```text
auraex:read   consulta mentorados, agenda e indicadores
auraex:write  adiciona mentorados e atualiza sessões
```

Também pode criar um token no terminal:

```bash
npm run token:create -- --name "Agente de produção" --scopes auraex:read,auraex:write --days 365
```

## Conectar um agente por MCP

Endpoint local:

```text
http://127.0.0.1:8080/mcp
```

Cabeçalho obrigatório:

```http
Authorization: Bearer SEU_TOKEN_AURAEX
```

Exemplo de configuração em `config/mcp-client.example.json`:

```json
{
  "mcpServers": {
    "auraex": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:8080/mcp",
      "headers": {
        "Authorization": "Bearer COLE_AQUI_O_SEU_TOKEN_AURAEX"
      }
    }
  }
}
```

Ferramentas disponíveis:

| Ferramenta | Escopo | Finalidade |
|---|---|---|
| `auraex_status` | leitura | verificar servidor e base |
| `listar_programas` | leitura | listar abas/programas |
| `resumo_mentorias` | leitura | obter indicadores |
| `listar_mentorados` | leitura | pesquisar mentorados |
| `obter_mentorado` | leitura | consultar cadastro e sessões |
| `listar_agenda` | leitura | consultar agenda e pendências |
| `atualizar_sessao` | escrita | alterar uma sessão |
| `adicionar_mentorado` | escrita | criar um mentorado |

Guia detalhado: `docs/CONFIGURAR_MCP.md`.

## API da dashboard

```text
GET  /health
GET  /api/auth/session
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/password
GET  /api/tokens
POST /api/tokens
DELETE /api/tokens/:id
GET  /api/mentorados
POST /api/mentorados
POST /mcp
```

A API de mentorados aceita uma sessão da interface ou um PAT. Requisições com PAT usam `Authorization: Bearer ...` e não precisam de CSRF.

## Excel e persistência

- fonte original: `document/02.07.2026 - Mentorados Atualizada.xlsx`;
- modelo organizado: `document/AuraEX - Modelo Organizado.xlsx`;
- exemplo de exportação: `exemplo/AuraEX - Exportacao de Exemplo.xlsx`;
- base operacional atual: `storage/dashboard-data.json`;
- cópia inicial: `storage/initial-workbook.json`.

O Excel pode ser importado e exportado pela dashboard. A planilha continua sendo uma camada de intercâmbio; para produção multiutilizador, a base principal deve ser PostgreSQL.

## Comandos úteis

```bash
npm run check
npm run test:mcp
npm run token:create -- --name "Meu agente" --scopes auraex:read --days 90
npm run admin:password -- --email ananias.thaunde@sbdc.com.br
```

O teste MCP lê o token inicial em `CREDENCIAIS_INICIAIS.txt`, salvo quando `AURAEX_TEST_TOKEN` for informado no ambiente.

## Estrutura

```text
AuraEX_Sistema_MCP/
├── login.html / login.css / login.js
├── index.html / styles.css / app.js
├── server.mjs
├── mcp.mjs
├── mcp-fallback.mjs
├── lib/
├── scripts/
├── config/
├── storage/
├── document/
├── exemplo/
├── docs/
├── Dockerfile
├── docker-compose.yml
├── CREDENCIAIS_INICIAIS.txt
└── PROMPT_PARA_AGENTE_DE_PROGRAMACAO.md
```

## Checklist antes de produção

- alterar a senha inicial;
- revogar o PAT inicial e gerar um token por agente;
- remover `CREDENCIAIS_INICIAIS.txt` do servidor final;
- gerar outro `AURAEX_SESSION_SECRET`;
- usar HTTPS com Caddy, Nginx ou load balancer;
- configurar hosts e origens permitidos;
- migrar JSON, sessões, utilizadores, tokens e auditoria para PostgreSQL/Redis;
- implementar backups, observabilidade e rotação de logs;
- limitar uploads e validar arquivos Excel;
- definir papéis e permissões por utilizador;
- executar testes automatizados e revisão de segurança;
- para clientes MCP públicos, substituir o PAT estático por OAuth 2.1.

## Documentos técnicos

- `docs/GUIA_DO_USUARIO.md` — uso da dashboard;
- `docs/AUTENTICACAO_E_TOKENS.md` — login, sessões e PATs;
- `docs/CONFIGURAR_MCP.md` — conexão de agentes;
- `docs/ARQUITETURA.md` — componentes e fluxo de dados;
- `docs/MAPA_DO_EXCEL.md` — estrutura da planilha;
- `docs/RELATORIO_DE_VALIDACAO.md` — testes realizados e limites da validação;
- `PROMPT_PARA_AGENTE_DE_PROGRAMACAO.md` — especificação para evolução até produção.
