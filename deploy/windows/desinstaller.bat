@echo off
rem Retire le demarrage automatique, la regle de pare-feu et les raccourcis (ne touche pas a la base).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer.ps1" -Desinstaller
pause
