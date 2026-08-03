@echo off
setlocal
cd /d "%~dp0"
title AuraEX 3.0 - Sistema com Login e MCP
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao foi encontrado.
  echo Instale o Node.js 20 ou superior em: https://nodejs.org/
  echo.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 20 (
  echo.
  echo O AuraEX requer Node.js 20 ou superior. Versao encontrada:
  node -v
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\@modelcontextprotocol\server\package.json" (
  echo.
  echo Instalando dependencias do SDK MCP oficial...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar as dependencias.
    echo O AuraEX iniciara com o modo MCP compativel embutido.
  )
)
echo.
echo ================================================
echo   AuraEX 3.0 - Login, API protegida e MCP
echo ================================================
echo.
echo Sistema: http://127.0.0.1:8080
echo Login:   http://127.0.0.1:8080/login.html
echo MCP:     http://127.0.0.1:8080/mcp
echo Credenciais: CREDENCIAIS_INICIAIS.txt
echo.
start "" http://127.0.0.1:8080
node server.mjs
pause
