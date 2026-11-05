@echo off
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
  set "PATH=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is missing from PATH.
  exit /b 1
)
pushd "%~dp0"
if not exist "node_modules\expo\bin\cli" (
  echo Project dependencies are missing. Install them with npm ci first.
  popd
  exit /b 1
)
node.exe node_modules\expo\bin\cli %*
set "FEATUREFLOW_EXIT=%ERRORLEVEL%"
popd
exit /b %FEATUREFLOW_EXIT%
