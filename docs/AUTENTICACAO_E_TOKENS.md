# Autenticação e tokens do AuraEX

## Primeiro acesso

1. Inicie o servidor.
2. Abra `http://127.0.0.1:8080`.
3. Use o e-mail e a senha de `CREDENCIAIS_INICIAIS.txt`.
4. Entre em **Configurações** e altere a senha.

A senha nova deve ter pelo menos 12 caracteres.

## Sessão da interface

Ao entrar, o servidor cria:

- um identificador de sessão enviado em cookie `HttpOnly`;
- um token CSRF devolvido à aplicação;
- uma validade definida por `AURAEX_SESSION_HOURS`.

A sessão não fica no `localStorage`. Reiniciar o servidor encerra as sessões existentes.

## Token de acesso pessoal

Um PAT é usado por agentes e integrações que não podem abrir a página de login.

Formato:

```text
auraex_pat_<valor-aleatório>
```

Crie um token pela dashboard em **Configurações → Integrações e MCP** ou no terminal:

```bash
npm run token:create -- --name "Agente leitura" --scopes auraex:read --days 90
```

Para permitir atualizações:

```bash
npm run token:create -- --name "Agente operacional" --scopes auraex:read,auraex:write --days 90
```

O valor completo aparece apenas na criação. Guarde-o num gestor de segredos. O servidor persiste apenas SHA-256, prefixo, escopos, datas e estado de revogação.

## Utilização na API

```bash
curl http://127.0.0.1:8080/api/mentorados \
  -H "Authorization: Bearer SEU_TOKEN"
```

Operações de escrita com PAT não precisam de CSRF, porque não dependem do cookie do navegador.

## Revogação e rotação

- dê um token diferente a cada agente;
- use apenas `auraex:read` quando escrita não for necessária;
- defina validade curta;
- revogue imediatamente um token perdido;
- troque tokens periodicamente;
- nunca coloque PAT em código frontend, repositório ou captura de tela pública.

## Variáveis de ambiente

| Variável | Exemplo | Função |
|---|---|---|
| `AURAEX_PORT` | `8080` | porta HTTP |
| `AURAEX_BIND` | `127.0.0.1` | interface de rede |
| `AURAEX_PUBLIC_URL` | `https://auraex.exemplo.com` | URL pública e metadados MCP |
| `AURAEX_ALLOWED_HOSTS` | `auraex.exemplo.com` | hosts aceitos |
| `AURAEX_ALLOWED_ORIGINS` | `https://auraex.exemplo.com` | origens aceitas |
| `AURAEX_SESSION_SECRET` | valor aleatório longo | chave da sessão |
| `AURAEX_SESSION_HOURS` | `12` | duração da sessão |

## Produção

- gere o segredo com um gerador criptográfico;
- use HTTPS;
- armazene segredos fora do repositório;
- migre sessões e tokens para uma base transacional;
- aplique RBAC e política de senha;
- ative MFA por meio de um provedor de identidade;
- use OAuth 2.1 quando clientes MCP de terceiros precisarem de autorização delegada.
