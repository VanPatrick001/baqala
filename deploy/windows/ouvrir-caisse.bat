@echo off
rem Ouvre la caisse BAQALA en plein ecran (mode kiosque) des que le serveur repond.
rem Pour quitter le plein ecran : Alt+F4.
set URL=http://localhost:4000/pos
set PROFIL=%LOCALAPPDATA%\BAQALA\navigateur

powershell -NoProfile -Command "for($i=0;$i -lt 90;$i++){try{Invoke-WebRequest -UseBasicParsing 'http://localhost:4000/api/health' -TimeoutSec 2 | Out-Null; exit 0}catch{Start-Sleep -Seconds 2}}; exit 1"

set NAV=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set NAV=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not defined NAV if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set NAV=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not defined NAV if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set NAV=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe
if not defined NAV if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set NAV=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe
if not defined NAV if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set NAV=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not defined NAV (
  start "" "%URL%"
  exit /b
)

rem --kiosk : plein ecran sans barre d'adresse ; --kiosk-printing : ticket imprime sans fenetre de dialogue
start "" "%NAV%" --kiosk "%URL%" --kiosk-printing --user-data-dir="%PROFIL%" --no-first-run --disable-pinch --overscroll-history-navigation=0 --disable-features=TranslateUI
