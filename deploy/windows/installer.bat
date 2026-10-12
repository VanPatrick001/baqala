@echo off
rem Double-cliquez sur ce fichier pour installer le demarrage automatique de BAQALA.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1" %*
pause
