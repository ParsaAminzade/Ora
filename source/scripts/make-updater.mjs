// Builds public/Ora-Update.cmd: one file that runs anywhere on Windows (Downloads is fine).
// The batch part starts PowerShell, which reads the rest of this same file (after the marker) and runs it.
// The batch part is one ( ) block that ends with exit, so cmd never reads the PowerShell below it.
import { readFileSync, writeFileSync } from 'node:fs';
const ps = readFileSync('scripts/Ora-Update.src.ps1', 'utf8').replace(/\r?\n/g, '\r\n');
const head = [
  '@echo off',
  'rem Ora updater - double-click to update Ora (the Chrome extension) to the newest version.',
  'set "ORA_SELF=%~f0"',
  'set "ORA_SELF_DIR=%~dp0."',
  `(powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:ORA_SELF,[Text.Encoding]::UTF8); iex ($t.Substring($t.IndexOf('#'+'::PS::')+7))" & exit /b)`,
  '#::PS::',
].join('\r\n');
writeFileSync('public/Ora-Update.cmd', head + '\r\n' + ps); // UTF-8 without BOM: a BOM would break the first line
console.log('public/Ora-Update.cmd written');
