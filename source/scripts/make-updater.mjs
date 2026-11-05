// Builds public/Ora-Update.cmd: one file that runs anywhere on Windows (Downloads is fine).
// The batch part starts PowerShell, which reads the rest of this same file (after the marker) and runs it.
// The batch part is one ( ) block that ends with exit, so cmd never reads the PowerShell below it.
import { readFileSync, writeFileSync } from 'node:fs';
function build(src, out, what) {
// The window's look (XAML) and Ora's font go inside the file, so it is still one file to download.
const xaml = readFileSync('scripts/ora-window.xaml', 'utf8').replace(/'@/g, "' @");
const font = readFileSync('scripts/diba-ui.ttf').toString('base64');
const common = readFileSync('scripts/ora-common.ps1', 'utf8').replace('__XAML__', () => xaml).replace('__DIBA__', () => font);
const ps = (common + '\n' + readFileSync(src, 'utf8')).replace(/\r?\n/g, '\r\n');
const head = [
  '@echo off',
  `rem ${what}`,
  'set "ORA_SELF=%~f0"',
  'set "ORA_SELF_DIR=%~dp0."',
  `(powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$t=[IO.File]::ReadAllText($env:ORA_SELF,[Text.Encoding]::UTF8); iex ($t.Substring($t.IndexOf('#'+'::PS::')+7))" & exit /b)`,
  '#::PS::',
].join('\r\n');
writeFileSync(out, head + '\r\n' + ps); // UTF-8 without BOM: a BOM would break the first line
console.log(`${out} written`);
}
build('scripts/Ora-Update.src.ps1', 'public/Ora-Update.cmd', 'Ora updater - double-click to update Ora (the Chrome extension) to the newest version.');
// Setup is not part of the extension itself: it is published next to it (site and GitHub downloads/).
build('scripts/Ora-Setup.src.ps1', 'Ora-Setup.cmd', 'Ora setup - double-click to install Ora in Chrome, Edge or Brave. It opens a small guide for the last step.');
