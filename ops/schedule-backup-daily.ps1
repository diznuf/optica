param(
  [string]$TaskName = "OpticaDailyBackup",
  [string]$Time = "20:00"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ($Time -notmatch "^\d{2}:\d{2}$") {
  throw "Format heure invalide. Utilisez HH:mm (ex: 20:00)."
}

$taskCommand = "cmd.exe /c `"cd /d `"$root`" && npm.cmd run backup:daily`""

Write-Host "Creation tache planifiee '$TaskName' a $Time ..."
schtasks /Create /SC DAILY /TN $TaskName /TR $taskCommand /ST $Time /F | Out-Null

Write-Host "Tache planifiee creee avec succes."
Write-Host "Nom: $TaskName"
Write-Host "Heure: $Time"
Write-Host "Commande: $taskCommand"
