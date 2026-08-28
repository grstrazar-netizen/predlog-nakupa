@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ni namescen. Odpiram stran za prenos Node.js LTS.
  start "" "https://nodejs.org/en/download"
  echo Po namestitvi Node.js ponovno zazeni to datoteko.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:4173/"
node server.mjs --dist

if errorlevel 1 (
  echo Aplikacije ni bilo mogoce zagnati. Preveri, ali je port 4173 ze v uporabi.
  pause
)
