@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "MATGO_NODE="
where node >nul 2>nul
if not errorlevel 1 set "MATGO_NODE=node"
if not defined MATGO_NODE for /d %%R in ("%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\*") do if exist "%%~R\bin\node.exe" set "MATGO_NODE=%%~R\bin\node.exe"
if not defined MATGO_NODE (
  echo Node.js 20 이상을 설치한 후 다시 실행해 주세요.
  pause
  exit /b 1
)
echo.
echo 오후 한 판 — 맞고 게임
echo 브라우저에서 http://localhost:5173 을 열어 주세요.
echo 종료하려면 이 창에서 Ctrl+C를 누르세요.
echo.
"%MATGO_NODE%" server.mjs
pause
