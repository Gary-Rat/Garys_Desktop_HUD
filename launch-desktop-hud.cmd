@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
call npm.cmd run build
if errorlevel 1 exit /b %errorlevel%
call npm.cmd run start
