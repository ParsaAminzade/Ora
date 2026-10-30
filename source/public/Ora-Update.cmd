@echo off
rem Ora updater: double-click to download the newest Ora and put it in this folder.
rem Everything runs inside one ( ) block, so this file can be replaced while it runs.
(
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ora-update.ps1" -Folder "%~dp0."
  exit /b
)
