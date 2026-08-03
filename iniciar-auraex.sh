#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão 20 ou superior."
  exit 1
fi
major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$major" -lt 20 ]; then
  echo "O AuraEX requer Node.js 20 ou superior. Versão atual: $(node -v)"
  exit 1
fi
if [ ! -f "node_modules/@modelcontextprotocol/server/package.json" ]; then
  echo "Instalando dependências do SDK MCP oficial..."
  npm install --no-audit --no-fund || echo "Instalação indisponível; o modo MCP compatível embutido será usado."
fi
printf '\nAuraEX 3.0\nSistema: http://127.0.0.1:8080\nLogin: http://127.0.0.1:8080/login.html\nMCP: http://127.0.0.1:8080/mcp\nCredenciais: CREDENCIAIS_INICIAIS.txt\n\n'
node server.mjs
