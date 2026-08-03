# Prompt mestre — evoluir o AuraEX 3.0 para produção

Copie o conteúdo abaixo e entregue ao agente de programação juntamente com toda a pasta do projeto.

---

Você é o engenheiro de software sênior responsável por auditar, melhorar e colocar em produção o **AuraEX — Gestão de Mentorias**.

## Estado atual do projeto

O pacote já possui:

- frontend em HTML, CSS e JavaScript;
- página de login;
- sessão por cookie `HttpOnly` e proteção CSRF;
- senha com PBKDF2-SHA256;
- gestão de tokens de acesso pessoal;
- API protegida por sessão ou PAT;
- dashboard de mentorados, sessões, agenda e Excel;
- onboarding para novos utilizadores;
- servidor MCP em `/mcp` com Streamable HTTP;
- SDK MCP oficial v2 em `mcp.mjs`;
- fallback MCP local em `mcp-fallback.mjs`;
- ferramentas MCP com escopos de leitura e escrita;
- armazenamento atual em JSON;
- scripts, Dockerfile, Docker Compose e documentação.

Leia, nesta ordem, antes de escrever código:

1. `README.md`;
2. `docs/ARQUITETURA.md`;
3. `docs/AUTENTICACAO_E_TOKENS.md`;
4. `docs/CONFIGURAR_MCP.md`;
5. `docs/GUIA_DO_USUARIO.md`;
6. `docs/MAPA_DO_EXCEL.md`;
7. `server.mjs`;
8. `lib/security.mjs`;
9. `lib/data-store.mjs`;
10. `mcp.mjs` e `mcp-fallback.mjs`;
11. `login.html`, `login.css`, `login.js`;
12. `index.html`, `styles.css`, `app.js`, `excel-bridge.js`.

Use como dados de validação:

- `document/02.07.2026 - Mentorados Atualizada.xlsx`;
- `document/AuraEX - Modelo Organizado.xlsx`;
- `exemplo/AuraEX - Exportacao de Exemplo.xlsx`.

## Regra de segurança imediata

Não publique as credenciais entregues. No primeiro ambiente:

- troque a senha inicial;
- revogue o PAT inicial;
- remova `CREDENCIAIS_INICIAIS.txt`;
- gere outro `AURAEX_SESSION_SECRET`;
- verifique que `.env`, tokens e dados pessoais estão ignorados pelo Git.

## Objetivo

Transformar o protótipo executável num sistema multiutilizador seguro e observável, mantendo a identidade AuraEX, a simplicidade operacional e a compatibilidade com a planilha atual e com agentes MCP.

Cores de referência:

- laranja: `#ff5a1f`;
- cinza: `#66676b`;
- fundo: `#f7f7f8`;
- branco: `#ffffff`.

## Etapa 1 — auditoria antes da implementação

Antes de alterar o código, entregue:

1. inventário de funcionalidades;
2. diagrama da arquitetura atual;
3. riscos de segurança e dados;
4. inconsistências e débitos técnicos;
5. plano de migração em fases;
6. modelo relacional proposto;
7. contrato da API e das ferramentas MCP;
8. critérios de aceitação e rollback.

Não comece pela reescrita total. Preserve o sistema funcional durante a migração.

## Etapa 2 — arquitetura alvo

Implemente preferencialmente:

- frontend: Next.js ou React/Vite com TypeScript;
- backend: Fastify, NestJS ou rotas server-side tipadas;
- banco: PostgreSQL;
- ORM: Prisma, Drizzle ou equivalente;
- sessões/rate limit: Redis quando houver mais de uma instância;
- Excel no backend: ExcelJS ou biblioteca mantida;
- validação: Zod;
- logs estruturados: Pino/OpenTelemetry;
- proxy e TLS: Caddy, Nginx ou infraestrutura gerenciada.

Pode escolher outra stack, mas justifique com segurança, manutenção, custo e disponibilidade da equipa.

## Etapa 3 — modelo de dados

Crie migrations para, no mínimo:

- users;
- roles e permissions;
- sessions ou identity_provider_links;
- personal_access_tokens;
- programs;
- companies;
- mentees;
- mentorship_sessions;
- appointments;
- notes;
- imports;
- exports;
- audit_logs;
- app_settings.

Requisitos:

- UUIDs;
- timestamps;
- soft delete quando necessário;
- versionamento/controle otimista;
- índices para pesquisa e agenda;
- relações e constraints;
- encriptação ou proteção de campos sensíveis conforme análise de risco.

## Etapa 4 — autenticação e autorização

Entregue:

- login seguro;
- recuperação de senha;
- MFA opcional ou integração com provedor OIDC;
- perfis Administrador, Gestor, Mentor e Leitor;
- RBAC aplicado no backend e no MCP;
- sessões revogáveis e persistidas;
- rate limiting distribuído;
- política de senha;
- rotação e revogação de PAT;
- PAT mostrado apenas uma vez e guardado com hash;
- escopos mínimos por token;
- histórico de uso e último IP, respeitando a política de privacidade.

Nunca aceite autorização apenas no frontend.

## Etapa 5 — MCP

Preserve o endpoint Streamable HTTP e as ferramentas existentes:

- `auraex_status`;
- `listar_programas`;
- `resumo_mentorias`;
- `listar_mentorados`;
- `obter_mentorado`;
- `listar_agenda`;
- `atualizar_sessao`;
- `adicionar_mentorado`.

Melhorias obrigatórias:

- usar apenas o SDK MCP oficial na produção;
- remover o fallback do caminho produtivo depois de testes;
- manter schemas estritos e respostas estruturadas;
- autorização por escopo em todas as ferramentas;
- solicitar confirmação humana para ações destrutivas ou sensíveis;
- idempotência em escritas quando aplicável;
- paginação e limites;
- logs com `request_id`, cliente e ferramenta;
- timeout e cancelamento;
- testes de protocolo;
- metadados de recurso protegido;
- OAuth 2.1 para integrações públicas/delegadas;
- PAT apenas para agentes internos e controlados;
- impedir tokens em query string;
- validar `Origin` e proteger contra DNS rebinding.

Considere separar ferramentas de leitura e escrita em políticas ou servidores quando isso reduzir risco.

## Etapa 6 — mentorados, sessões e agenda

- CRUD completo com validação;
- pesquisa e filtros no servidor;
- prevenção de duplicados configurável;
- importação em lote com pré-visualização;
- histórico por registo;
- tabela grande de 12 sessões com cabeçalho e colunas fixas;
- estados estruturados: não iniciada, agendada, concluída, cancelada e pendente;
- data, hora, responsável e observações em campos próprios;
- edição em lote;
- calendário mensal, semanal e tabela;
- deteção de conflitos;
- fusos horários;
- preparação para Google Calendar e Microsoft Outlook.

Calendário, tabela, API e MCP devem refletir a mesma fonte transacional.

## Etapa 7 — Excel

- manter compatibilidade com a planilha anexada;
- assistente de mapeamento de colunas;
- validação e relatório de erros;
- importação idempotente ou com estratégia de reconciliação;
- exportação bonita com Resumo, Mentorados, Sessões, Agenda e Empresas;
- filtros, painéis congelados, larguras, datas e percentagens;
- testes que abram o arquivo gerado e validem estrutura;
- execução de importações em job quando o volume justificar;
- não usar Excel como banco principal.

## Etapa 8 — experiência do utilizador

- manter o pop-up de onboarding;
- permitir reabrir a ajuda;
- interface acessível WCAG 2.2 AA;
- navegação por teclado;
- estados de carregamento, vazio e erro;
- textos simples em português;
- responsividade;
- ações principais em até três cliques;
- confirmação clara para exclusão, revogação e escrita por agente.

## Etapa 9 — API e segurança

- OpenAPI versionada;
- validação de entrada e saída;
- paginação;
- CORS restrito;
- CSRF onde houver cookie;
- CSP sem `unsafe-inline` na versão final;
- headers de segurança;
- limite e inspeção de uploads;
- proteção contra fórmulas maliciosas em CSV/Excel;
- HTTPS obrigatório;
- secrets manager;
- backups cifrados;
- política de retenção;
- auditoria imutável ou exportável;
- testes SAST, dependências e DAST no CI.

## Etapa 10 — testes

Crie:

- testes unitários;
- testes de integração da API e PostgreSQL;
- testes de autenticação, expiração e revogação de PAT;
- testes MCP de `initialize`, `tools/list`, leitura, escrita e escopo insuficiente;
- testes de importação/exportação Excel;
- testes E2E com Playwright;
- testes de acessibilidade;
- testes de concorrência e idempotência;
- testes de backup e restauração.

Fluxos E2E mínimos:

1. primeiro login e troca de senha;
2. onboarding;
3. criação de mentorado;
4. marcação de sessão;
5. visualização no calendário e tabela;
6. exportação Excel;
7. importação válida e inválida;
8. criação, uso e revogação de PAT;
9. agente MCP somente leitura não consegue escrever;
10. agente MCP com escrita atualiza e confirma o resultado;
11. dois utilizadores não sobrescrevem alterações silenciosamente.

## Etapa 11 — implantação

Entregue:

- imagens Docker reproduzíveis;
- Compose de desenvolvimento e homologação;
- migrations automáticas controladas;
- proxy reverso e TLS;
- health, readiness e liveness;
- backups e restauração documentados;
- CI/CD com aprovação para produção;
- rollback;
- seed sem dados pessoais;
- configuração por ambiente;
- observabilidade e alertas.

## Critérios de conclusão

O projeto só estará pronto quando:

- login, RBAC e recuperação de acesso estiverem testados;
- PostgreSQL for a fonte principal;
- Excel anexado importar corretamente;
- exportação abrir sem alertas e estiver visualmente correta;
- sessões e agenda estiverem consistentes;
- API e MCP usarem a mesma camada de domínio;
- PATs forem revogáveis, expirarem e respeitarem escopos;
- o servidor MCP oficial passar testes de protocolo;
- não houver segredos no repositório;
- Docker e documentação reproduzirem o ambiente;
- backup e recuperação forem testados;
- checklist de segurança estiver aprovado.

## Saída esperada do agente

Ao final de cada fase, apresente:

- alterações realizadas;
- arquivos modificados;
- migrations;
- testes executados e resultados;
- riscos restantes;
- instruções de execução;
- decisão arquitetural registrada;
- próximo passo recomendado.

Comece pela auditoria e pelo plano. Não reescreva o sistema antes de mostrar o modelo de dados, a estratégia de migração do Excel, o modelo de autorização e o contrato MCP.

---
