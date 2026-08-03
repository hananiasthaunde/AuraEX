# Mapa do Excel e regras de interpretação

## Planilha 2026

| Campo | Coluna de origem |
|---|---:|
| ID | A |
| Mentorado | B |
| E-mail | C |
| Celular | D |
| Empresa | E |
| Sessões 1–5 | F–J |
| Avaliação parcial | K |
| Sessões 6–12 | L–R |
| Encerramento | S |
| Relatório | T |

## Regras de estado

- `ok`, `concluído`, `realizada`, `encerrado` e equivalentes são tratados como concluídos;
- conteúdo com data no formato `dia/mês` é tratado como agendamento;
- qualquer outro conteúdo não vazio é tratado como pendência;
- o progresso é a quantidade de sessões concluídas dividida pelo total de sessões;
- encerramento preenchido com termos de finalização pode classificar o mentorado como concluído.

## Relatório organizado

A exportação recomendada transforma a planilha em:

- **Resumo**: indicadores e consolidação por empresa;
- **Mentorados**: cadastro central;
- **Sessões**: matriz de sessões;
- **Agenda**: marcações e pendências;
- **Empresas**: métricas consolidadas;
- **Base - ...**: cópia das planilhas importadas.
