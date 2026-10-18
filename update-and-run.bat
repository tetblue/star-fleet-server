@echo off
rem 從 GitHub 拉最新程式 → 建置網頁 → 啟動伺服器
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where git >nul 2>nul || (echo ✗ 找不到 git，請先安裝 Git。& goto :fail)
where npm >nul 2>nul || (echo ✗ 找不到 npm，請先安裝 Node.js。& goto :fail)

echo === 1/3 拉取最新程式 ===
for /f %%i in ('git rev-parse HEAD') do set OLD=%%i
rem web\ 與 dev\src\_entry.js 是建置產物，下一步會重新產生；先還原，避免擋住 pull
git restore -- web dev/src/_entry.js
git pull --ff-only || (echo ✗ git pull 失敗：本機可能有未提交的修改或分支已分岔，請手動處理。& goto :fail)

echo.
echo === 2/3 建置網頁 ===
set NEEDNPM=
if not exist dev\node_modules set NEEDNPM=1
git diff --quiet %OLD% HEAD -- dev/package.json dev/package-lock.json || set NEEDNPM=1
pushd dev
if defined NEEDNPM (
  echo 安裝相依套件…
  call npm ci || (popd & echo ✗ npm ci 失敗。& goto :fail)
)
call npm run build || (popd & echo ✗ 建置失敗。& goto :fail)
popd

echo.
echo === 3/3 啟動伺服器 ===
tasklist /fi "imagename eq StarFleetServer.exe" | find /i "StarFleetServer.exe" >nul
if not errorlevel 1 (
  echo 伺服器已經在執行。新的網頁已經生效，玩家重新整理瀏覽器即可。
  echo 伺服器程式或模型有更新時才需要重新啟動（正在進行的作戰會中斷）。
  choice /c YN /m "要重新啟動伺服器嗎"
  if errorlevel 2 goto :done
  taskkill /im StarFleetServer.exe >nul 2>nul || taskkill /f /im StarFleetServer.exe >nul
  timeout /t 2 /nobreak >nul
)
if exist StarFleetServer.exe (
  start "" StarFleetServer.exe
) else (
  echo 找不到 StarFleetServer.exe，改用 Node 從原始碼啟動。
  start "StarFleetServer" cmd /k node dev\server\server.js --base .
)

:done
echo.
echo 完成。
pause
exit /b 0

:fail
echo.
pause
exit /b 1
