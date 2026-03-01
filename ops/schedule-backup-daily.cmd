@echo off
setlocal

cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "%~dp0schedule-backup-daily.ps1" %*

exit /b %errorlevel%
