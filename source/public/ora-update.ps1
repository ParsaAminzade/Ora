# Ora updater (run by Ora-Update.cmd). Downloads the newest Ora extension and copies it over this
# folder. Your tasks, notes and settings live in Chrome, not in this folder, so nothing of yours
# is touched. Ora notices the new files by itself within a minute and reloads.
param([string]$Folder = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
$Rtl = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
function Say($text, $icon = 'Information') {
  [void][System.Windows.Forms.MessageBox]::Show($text, 'اورآ', 'OK', $icon, 'Button1', $Rtl)
}

$Server = 'https://ora.p128parsa.workers.dev'
$Fallback = 'https://github.com/ParsaAminzade/Ora/raw/main/downloads/ora-extension-latest.zip'
$Folder = (Resolve-Path $Folder).Path
$Tmp = Join-Path $env:TEMP ("ora-update-" + [guid]::NewGuid().ToString('N'))

try {
  $manifest = Join-Path $Folder 'manifest.json'
  if (-not (Test-Path $manifest)) { Say "این فایل باید داخل پوشه‌ی اورآ باشد (کنار manifest.json)." 'Warning'; exit 1 }
  $mine = (Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
  Write-Host "Ora $mine - checking for a new version..."

  $url = $Fallback
  try {
    $latest = Invoke-RestMethod -Uri "$Server/api/latest" -TimeoutSec 20
    if ($latest.url -and $latest.url -match '\.zip($|\?)') { $url = $latest.url }
    if ($latest.version -and ([version]$latest.version -le [version]$mine)) {
      Say "اورآی تو به‌روز است (نسخه‌ی $mine)."; exit 0
    }
  } catch { Write-Host 'Server not reachable; using the GitHub copy.' }

  New-Item -ItemType Directory -Path $Tmp | Out-Null
  $zip = Join-Path $Tmp 'ora.zip'
  Write-Host 'Downloading...'
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 300
  $new = Join-Path $Tmp 'new'
  Expand-Archive -Path $zip -DestinationPath $new -Force
  # some zips have everything inside one folder
  $root = $new
  if (-not (Test-Path (Join-Path $root 'manifest.json'))) {
    $inner = Get-ChildItem $new -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'manifest.json') } | Select-Object -First 1
    if ($inner) { $root = $inner.FullName } else { throw 'The download is not an Ora extension.' }
  }
  $theirs = (Get-Content (Join-Path $root 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
  if ([version]$theirs -le [version]$mine) { Say "اورآی تو به‌روز است (نسخه‌ی $mine)."; exit 0 }

  Write-Host "Installing $theirs..."
  # old build files have different names; clear them so the folder doesn't grow forever
  $assets = Join-Path $Folder 'assets'
  if (Test-Path $assets) { Remove-Item $assets -Recurse -Force -ErrorAction SilentlyContinue }
  # manifest.json last: Ora reloads itself once it sees the new version number, so everything else
  # must already be in place by then
  robocopy $root $Folder /E /XF manifest.json /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copying the new files failed (robocopy $LASTEXITCODE)." }
  Copy-Item (Join-Path $root 'manifest.json') (Join-Path $Folder 'manifest.json') -Force
  Get-ChildItem $Folder -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

  Say "اورآ به نسخه‌ی $theirs به‌روز شد.`n`nتا یک دقیقه‌ی دیگر خودش دوباره بالا می‌آید؛ اگر عجله داری یک تب تازه باز کن."
} catch {
  Say ("به‌روزرسانی نشد:`n" + $_.Exception.Message + "`n`nاینترنت را بررسی کن و دوباره امتحان کن.") 'Error'
  exit 1
} finally {
  if (Test-Path $Tmp) { Remove-Item $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
