@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\work\restart-production.ps1"
if errorlevel 1 (
  echo Please close only the old preview server, then run the website launcher again.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:8767/#projects"
