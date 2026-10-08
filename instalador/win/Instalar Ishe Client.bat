@echo off
title Instalador de Reshem Client
if not exist "%~dp0instalar-launcher.ps1" (
  echo.
  echo  No encuentro los archivos del instalador.
  echo  Extrae primero el .zip completo en una carpeta y abre este archivo desde ahi.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-launcher.ps1"
exit /b %errorlevel%
