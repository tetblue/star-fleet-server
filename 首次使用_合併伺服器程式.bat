@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist StarFleetServer.exe.part0 (
  copy /b StarFleetServer.exe.part0 + StarFleetServer.exe.part1 + StarFleetServer.exe.part2 + StarFleetServer.exe.part3 + StarFleetServer.exe.part4 StarFleetServer.exe >nul
)
for %%A in (StarFleetServer.exe) do set SZ=%%~zA
if not "%SZ%"=="88907776" (
  echo 合併失敗：檔案大小不對（%SZ%），請確認 5 個 part 檔都在。
  pause
  exit /b 1
)
del StarFleetServer.exe.part0 StarFleetServer.exe.part1 StarFleetServer.exe.part2 StarFleetServer.exe.part3 StarFleetServer.exe.part4
echo 完成！之後直接雙擊 StarFleetServer.exe 啟動伺服器。這個 bat 可以刪掉。
pause
