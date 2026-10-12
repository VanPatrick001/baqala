<#
  BAQALA - installation du démarrage automatique sur un PC Windows (10 / 11).

  - Tâche planifiée « BAQALA Serveur » : démarre le serveur au démarrage du PC,
    même sans ouvrir de session (indispensable pour l'accès à distance), relance en cas d'arrêt.
  - Règle de pare-feu : port 4000 ouvert uniquement au réseau local et à Tailscale (100.64.0.0/10).
  - Raccourci « Caisse BAQALA » sur le bureau, et au démarrage de session si -CaisseAuDemarrage.

  Usage : double-cliquer sur installer.bat (les droits administrateur sont demandés).
          installer.bat -CaisseAuDemarrage   ouvre aussi la caisse en plein écran à chaque ouverture de session
          desinstaller.bat                   retire tout (la base de données n'est pas touchée)
#>
param(
  [int]$Port = 4000,
  [switch]$CaisseAuDemarrage,
  [switch]$Desinstaller
)
$ErrorActionPreference = 'Stop'

# Relance en administrateur si nécessaire
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  $argsList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Port', $Port)
  if ($CaisseAuDemarrage) { $argsList += '-CaisseAuDemarrage' }
  if ($Desinstaller) { $argsList += '-Desinstaller' }
  Start-Process powershell -Verb RunAs -ArgumentList $argsList
  exit
}

$Here = Split-Path -Parent $PSCommandPath
$Root = (Resolve-Path (Join-Path $Here '..\..')).Path
$TaskName = 'BAQALA Serveur'
$RuleName = 'BAQALA (port ' + $Port + ')'
$Desktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$Startup = [Environment]::GetFolderPath('CommonStartup')
$ShortcutName = 'Caisse BAQALA.lnk'

function New-Shortcut([string]$Path, [string]$Target) {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($Path)
  $lnk.TargetPath = $Target
  $lnk.WorkingDirectory = Split-Path -Parent $Target
  $lnk.WindowStyle = 7   # réduit : la fenêtre noire ne s'affiche pas
  $icon = Join-Path $Root 'frontend\public\favicon.ico'
  if (Test-Path $icon) { $lnk.IconLocation = $icon }
  $lnk.Save()
}

if ($Desinstaller) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Remove-Item (Join-Path $Desktop $ShortcutName), (Join-Path $Startup $ShortcutName) -ErrorAction SilentlyContinue
  Write-Host 'BAQALA : démarrage automatique, pare-feu et raccourcis retirés.' -ForegroundColor Green
  exit
}

Write-Host "Dossier BAQALA : $Root"

# 1. Prérequis
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez.' }
if (-not (Test-Path (Join-Path $Root 'backend\.env'))) { throw 'Fichier backend\.env manquant. Suivez d''abord le README (étape 2).' }
$mysql = Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mysql) {
  if ($mysql.StartType -ne 'Automatic') { Set-Service -Name $mysql.Name -StartupType Automatic }
  Write-Host "Service MySQL : $($mysql.Name) (démarrage automatique)"
} else {
  Write-Warning 'Aucun service MySQL trouvé. Vérifiez que MySQL est installé en tant que service Windows.'
}

# 2. Compilation (une fois)
Push-Location $Root
try {
  if (-not (Test-Path 'node_modules')) { Write-Host 'npm install...'; npm install; if ($LASTEXITCODE) { throw 'npm install a échoué' } }
  Write-Host 'Compilation (npm run build)...'
  npm run build
  if ($LASTEXITCODE) { throw 'La compilation a échoué' }
} finally { Pop-Location }

# 3. Tâche planifiée : au démarrage du PC, compte SYSTEM, relance automatique, sans limite de durée
$bat = Join-Path $Here 'demarrer-serveur.bat'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$bat`"" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'   # laisse MySQL démarrer d'abord
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Tâche planifiée « $TaskName » installée et lancée."

# 4. Pare-feu : réseau local + Tailscale uniquement (jamais Internet directement)
Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port `
  -RemoteAddress @('LocalSubnet', '100.64.0.0/10') -Profile Any | Out-Null
Write-Host "Pare-feu : port $Port ouvert au réseau local et à Tailscale."

# 5. Raccourcis
$open = Join-Path $Here 'ouvrir-caisse.bat'
New-Shortcut (Join-Path $Desktop $ShortcutName) $open
if ($CaisseAuDemarrage) { New-Shortcut (Join-Path $Startup $ShortcutName) $open; Write-Host 'La caisse s''ouvrira en plein écran à chaque ouverture de session.' }

# 6. Vérification
$ok = $false
for ($i = 0; $i -lt 45 -and -not $ok; $i++) {
  try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/api/health" -TimeoutSec 2 | Out-Null; $ok = $true } catch { Start-Sleep -Seconds 2 }
}
if ($ok) {
  Write-Host "`nBAQALA fonctionne : http://localhost:$Port" -ForegroundColor Green
  Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { Write-Host "  depuis un autre appareil : http://$($_.IPAddress):$Port  ($($_.InterfaceAlias))" }
} else {
  Write-Warning "Le serveur ne répond pas encore. Consultez $Root\logs\baqala.log"
}
