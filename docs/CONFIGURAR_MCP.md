# Configurar um agente MCP no AuraEX

## 1. Iniciar o servidor

```bash
npm start
```

Confirme:

```bash
curl http://127.0.0.1:8080/health
```

## 2. Criar um PAT

Pela interface:

1. entre no AuraEX;
2. abra **Configurações**;
3. vá a **Integrações e MCP**;
4. escolha nome, validade e escopos;
5. clique em **Gerar token**;
6. copie o token imediatamente.

Pelo terminal:

```bash
npm run token:create -- --name "Agente AuraEX" --scopes auraex:read,auraex:write --days 365
```

## 3. Configurar o cliente

Use o conteúdo de `config/mcp-client.example.json` e substitua o token:

```json
{
  "mcpServers": {
    "auraex": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:8080/mcp",
      "headers": {
        "Authorization": "Bearer auraex_pat_COLE_O_TOKEN"
      }
    }
  }
}
```

Alguns clientes usam os nomes `http`, `streamableHttp` ou uma lista de `headers`. Adapte apenas o formato externo; mantenha a URL e o cabeçalho Bearer.

## 4. Testar

Com o sistema ligado:

```bash
npm run test:mcp
```

Ou informe explicitamente:

```bash
AURAEX_TEST_URL=http://127.0.0.1:8080/mcp \
AURAEX_TEST_TOKEN=auraex_pat_SEU_TOKEN \
npm run test:mcp
```

O teste realiza:

1. `initialize`;
2. `tools/list`;
3. chamada de `auraex_status`.

## 5. Ferramentas

### Leitura

- `auraex_status`;
- `listar_programas`;
- `resumo_mentorias`;
- `listar_mentorados`;
- `obter_mentorado`;
- `listar_agenda`.

### Escrita

- `atualizar_sessao`;
- `adicionar_mentorado`.

As ferramentas de escrita exigem `auraex:write`. Para agentes de análise, use um token somente de leitura.

## 6. Prompt recomendado para o agente operador

```text
Você está conectado ao AuraEX por MCP.
Antes de executar qualquer alteração, consulte o mentorado e confirme programa, pessoa e sessão.
Não invente dados ausentes.
Para consultas, use ferramentas de leitura.
Para escrita, explique a alteração proposta e peça confirmação humana, salvo quando a instrução do utilizador já for explícita e inequívoca.
Depois de escrever, consulte novamente o registo e apresente o resultado.
Nunca revele tokens, credenciais, e-mails em massa ou conteúdo pessoal desnecessário.
```

## 7. Exposição em rede

Para acesso fora da máquina:

- use HTTPS;
- coloque um proxy reverso à frente do Node.js;
- altere `AURAEX_BIND` para `0.0.0.0` apenas na rede controlada;
- configure `AURAEX_PUBLIC_URL` com a URL HTTPS;
- restrinja `AURAEX_ALLOWED_HOSTS` e `AURAEX_ALLOWED_ORIGINS`;
- aplique firewall e rotação de PATs.

Não exponha o token em parâmetros de URL. Envie-o somente no cabeçalho `Authorization`.
