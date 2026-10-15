@echo off
title Neo Fine Chemicals
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
echo.
echo The Neo Fine Chemicals server has stopped. Close this window when finished.
pause
