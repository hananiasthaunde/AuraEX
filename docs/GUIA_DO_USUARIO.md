# Guia do utilizador — AuraEX 3.0

## 1. Entrar no sistema

1. Abra `http://127.0.0.1:8080`.
2. Informe o e-mail e a senha.
3. Clique em **Entrar**.

As credenciais iniciais estão em `CREDENCIAIS_INICIAIS.txt`. Altere a senha em **Configurações → Segurança da conta** depois do primeiro acesso.

## 2. Guia para novo utilizador

No primeiro acesso à dashboard, aparece um pop-up em quatro etapas. Ele explica a navegação, a tabela de sessões, a agenda e a exportação do Excel.

O guia pode ser reaberto em:

- botão **Ajuda**, no topo;
- opção **Ver guia**, no menu lateral;
- **Configurações → Abrir guia inicial**.

## 3. Escolher o programa

No topo da página existe o campo **Programa**. Ele corresponde às abas importadas do Excel. Ao trocar o programa, a dashboard mostra os dados daquela aba.

## 4. Adicionar ou editar um mentorado

Clique em **Novo mentorado** ou **Adicionar mentorado**. O formulário está dividido em:

1. dados básicos;
2. sessões;
3. acompanhamento.

Na tabela de mentorados, o botão de lápis abre o registo para edição.

## 5. Marcar sessões

Abra **Tabela de sessões**.

- escreva `ok` para uma sessão concluída;
- escreva uma data e hora para uma sessão agendada;
- escreva uma observação para uma pendência;
- deixe em branco quando ainda não houver marcação.

As alterações são guardadas ao sair do campo. O botão ✓ na célula marca imediatamente a sessão como concluída.

## 6. Consultar dias e marcações

Abra **Agenda e marcações**.

- **Calendário**: mostra itens com data reconhecida;
- **Tabela completa**: mostra datas, sessões e pendências numa tabela grande;
- **Sem data exata**: mostra itens cujo texto não contém uma data identificável.

## 7. Importar e exportar Excel

Em **Planilha** ou nas ações rápidas:

- **Importar Excel** lê um `.xlsx` e permite validar o conteúdo;
- **Relatório organizado** gera um arquivo com Resumo, Mentorados, Sessões, Agenda e Empresas;
- **Cópia da base original** preserva a estrutura matricial das planilhas atuais.

Revise o resultado antes de o distribuir, principalmente após alterar cabeçalhos da planilha de origem.

## 8. Backups

Em **Configurações**:

- **Baixar backup JSON** cria uma cópia completa;
- **Restaurar backup** carrega uma cópia anterior;
- **Restaurar dados iniciais** apaga alterações e recupera a base inicial.

## 9. Conectar um agente

Somente administradores podem gerir tokens.

1. Abra **Configurações → Integrações e MCP**.
2. Crie um token com nome e validade.
3. Use apenas leitura quando o agente não precisar alterar dados.
4. Copie o token, pois ele aparece apenas uma vez.
5. Configure o endpoint `http://127.0.0.1:8080/mcp` no cliente MCP.

Consulte `docs/CONFIGURAR_MCP.md` para a configuração completa.

## 10. Encerrar a sessão

Clique no utilizador no topo e escolha **Sair**. Em computador compartilhado, feche também o navegador e não deixe tokens copiados na área de transferência.
