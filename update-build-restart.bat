@echo off
rem 關閉伺服器 → 從 GitHub 拉最新程式 → 打包 StarFleetServer.exe（含網頁）→ 啟動
rem 伺服器程式（dev\server）有更新時用這個；只改網頁的話 update-and-run.bat 就夠了
chcp 65001 >nul
setlocal
rem git pull 可能改到這個檔案本身，而 cmd 是邊跑邊讀 .bat：先複製到 TEMP 再從那裡執行
if /i not "%~1"=="--from-temp" (
  copy /y "%~f0" "%TEMP%\starfleet-update-build-restart.bat" >nul
  "%TEMP%\starfleet-update-build-restart.bat" --from-temp "%~dp0."
  exit /b
)
cd /d "%~2"

where git >nul 2>nul || (echo ✗ 找不到 git，請先安裝 Git。& goto :fail)
where npm >nul 2>nul || (echo ✗ 找不到 npm，請先安裝 Node.js 22 以上。& goto :fail)

echo === 1/4 關閉伺服器 ===
tasklist /fi "imagename eq StarFleetServer.exe" | find /i "StarFleetServer.exe" >nul
if errorlevel 1 (
  echo 伺服器沒有在執行。
) else (
  echo 正在進行的作戰會中斷。
  taskkill /im StarFleetServer.exe >nul 2>nul
  timeout /t 2 /nobreak >nul
  tasklist /fi "imagename eq StarFleetServer.exe" | find /i "StarFleetServer.exe" >nul && taskkill /f /im StarFleetServer.exe >nul
  timeout /t 2 /nobreak >nul
  tasklist /fi "imagename eq StarFleetServer.exe" | find /i "StarFleetServer.exe" >nul && (echo ✗ 關不掉 StarFleetServer.exe，請手動關閉伺服器視窗後再執行。& goto :fail)
  echo 伺服器已關閉。
)

echo.
echo === 2/4 拉取最新程式 ===
for /f %%i in ('git rev-parse HEAD') do set OLD=%%i
rem web\ 與 dev\src\_entry.js 是建置產物，下一步會重新產生；先還原，避免擋住 pull
git restore -- web dev/src/_entry.js
rem config.json 已改成不進 git；本機的 git 還在追蹤它時（舊版本），先備份再 pull，pull 完還原
set CFGBAK=
git ls-files --error-unmatch config.json >nul 2>nul && (
  copy /y config.json "%TEMP%\starfleet-config.json" >nul
  git restore -- config.json
  set CFGBAK=1
)
git pull --ff-only || goto :pullfail
if defined CFGBAK copy /y "%TEMP%\starfleet-config.json" config.json >nul
if not exist config.json (
  copy config.example.json config.json >nul
  echo 已從 config.example.json 建立 config.json，需要時請修改（例如 port）。
)

echo.
echo === 3/4 打包 StarFleetServer.exe ===
set NEEDNPM=
if not exist dev\node_modules set NEEDNPM=1
git diff --quiet %OLD% HEAD -- dev/package.json dev/package-lock.json || set NEEDNPM=1
pushd dev
if defined NEEDNPM (
  echo 安裝相依套件…
  call npm ci || (popd & echo ✗ npm ci 失敗。& goto :fail)
)
rem build:exe 會先建置網頁（web\），再打包伺服器成 dev\dist\StarFleetServer.exe，並複製到專案根目錄
call npm run build:exe || (popd & echo ✗ 打包失敗。& goto :fail)
popd
rem 保險：確定根目錄的 exe 是剛打包的那一個
copy /y dev\dist\StarFleetServer.exe StarFleetServer.exe >nul || (echo ✗ 無法覆蓋 StarFleetServer.exe（檔案被占用？）。& goto :fail)

echo.
echo === 4/4 啟動伺服器 ===
start "" StarFleetServer.exe
echo 完成。伺服器已在新視窗啟動，玩家重新整理瀏覽器即可。
timeout /t 5 >nul
exit /b 0

:pullfail
if defined CFGBAK copy /y "%TEMP%\starfleet-config.json" config.json >nul
echo ✗ git pull 失敗：本機可能有未提交的修改或分支已分岔，請手動處理。
echo   （伺服器已關閉；要先用舊版繼續玩，直接雙擊 StarFleetServer.exe）

:fail
echo.
pause
exit /b 1
