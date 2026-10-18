@echo off
rem 在 Windows 打包 StarFleetServer.exe（細節見 dev\build_exe.mjs）
chcp 65001 >nul
setlocal
cd /d "%~dp0dev"

where npm >nul 2>nul || (echo ✗ 找不到 npm，請先安裝 Node.js 22 以上。& goto :fail)
if not exist node_modules (
  echo 安裝相依套件…
  call npm ci || (echo ✗ npm ci 失敗。& goto :fail)
)
call npm run build:exe || (echo ✗ 打包失敗。& goto :fail)

echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
