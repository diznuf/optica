@echo off
setlocal

cd /d "%~dp0\.."

if not exist ".env" (
  copy ".env.example" ".env" >nul
)

echo [1/5] Installation des dependances...
call npm.cmd install || exit /b 1

echo [2/5] Generation Prisma client...
call npm.cmd run prisma:generate || exit /b 1

echo [3/5] Synchronisation base SQLite...
call .\node_modules\.bin\prisma.cmd db push --accept-data-loss || exit /b 1

echo [4/5] Seed initial...
call npm.cmd run prisma:seed || exit /b 1

echo [5/5] Build de verification...
call npm.cmd run build || exit /b 1

echo Setup local termine.
echo Lancez ensuite: ops\start-dev.cmd
exit /b 0
