# Ora updater for Windows. Double-click Ora-Update.cmd from anywhere (Downloads is fine): it finds
# the folder Chrome loads Ora from, downloads the newest version and copies it over that folder.
# Tasks, notes and settings live inside Chrome, not in that folder, so nothing of yours is touched.
# Ora notices its new files by itself within a minute and reloads.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$Rtl = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
function Say($text, $icon = 'Information') {
  [void][System.Windows.Forms.MessageBox]::Show($text, 'اورآ', 'OK', $icon, 'Button1', $Rtl)
}

$Server = 'https://ora.p128parsa.workers.dev'
$Fallback = 'https://github.com/ParsaAminzade/Ora/raw/main/downloads/ora-extension-latest.zip'
$Id = 'knlanhnalgmnibmfgblipaclcoomdhdi'   # Ora's extension id (fixed by the key in manifest.json)

function Is-Ora($dir) {
  $m = Join-Path $dir 'manifest.json'
  if (-not (Test-Path -LiteralPath $m)) { return $false }
  $t = Get-Content -LiteralPath $m -Raw -Encoding UTF8
  return ($t -match '"short_name"\s*:\s*"Ora"') -and ($t -match '"newtab"')
}
function Version-Of($dir) { (Get-Content -LiteralPath (Join-Path $dir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version }

# 1) where is Ora? — the folder this file is in, else what Chrome/Edge/Brave remember, else a look
#    in the usual places, else ask.
function Find-Folders {
  $found = New-Object System.Collections.Generic.List[string]
  $self = $env:ORA_SELF_DIR
  if ($self -and (Is-Ora $self)) { $found.Add((Resolve-Path -LiteralPath $self).Path) }
  $roots = @("$env:LOCALAPPDATA\Google\Chrome\User Data", "$env:LOCALAPPDATA\Microsoft\Edge\User Data", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data")
  foreach ($r in $roots) {
    if (-not (Test-Path -LiteralPath $r)) { continue }
    foreach ($p in Get-ChildItem -LiteralPath $r -Directory -ErrorAction SilentlyContinue) {
      foreach ($f in @('Secure Preferences', 'Preferences')) {
        $file = Join-Path $p.FullName $f
        if (-not (Test-Path -LiteralPath $file)) { continue }
        try { $t = [IO.File]::ReadAllText($file) } catch { continue }
        $i = $t.IndexOf("`"$Id`":{")
        if ($i -lt 0) { continue }
        $chunk = $t.Substring($i, [Math]::Min(20000, $t.Length - $i))
        $m = [regex]::Match($chunk, '"path":"((?:[^"\\]|\\.)*)"')
        if (-not $m.Success) { continue }
        $path = [regex]::Unescape($m.Groups[1].Value)
        if ([IO.Path]::IsPathRooted($path) -and (Is-Ora $path)) { $found.Add((Resolve-Path -LiteralPath $path).Path) }
      }
    }
  }
  if ($found.Count -eq 0) {
    foreach ($base in @("$HOME\Downloads", "$HOME\Desktop", "$HOME\Documents", "$HOME\OneDrive\Desktop", "$HOME\OneDrive\Documents")) {
      if (-not (Test-Path -LiteralPath $base)) { continue }
      Get-ChildItem -LiteralPath $base -Filter manifest.json -Recurse -Depth 3 -File -ErrorAction SilentlyContinue |
        ForEach-Object { if (Is-Ora $_.DirectoryName) { $found.Add($_.DirectoryName) } }
    }
  }
  return @($found | Select-Object -Unique)
}

$Tmp = Join-Path $env:TEMP ('ora-update-' + [guid]::NewGuid().ToString('N'))
try {
  Write-Host 'Ora updater: looking for Ora...'
  $folders = @(Find-Folders)
  if ($folders.Count -eq 0) {
    Say 'پوشه‌ی اورآ را خودم پیدا نکردم. در پنجره‌ی بعد، پوشه‌ای را انتخاب کن که اورآ را از آن نصب کرده‌ای (همان که manifest.json در آن است).' 'Warning'
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'Ora folder (the one with manifest.json)'
    if ($dlg.ShowDialog() -ne 'OK') { exit 1 }
    if (-not (Is-Ora $dlg.SelectedPath)) { Say 'این پوشه اورآ نیست؛ manifest.json اورآ در آن نیست.' 'Error'; exit 1 }
    $folders = @($dlg.SelectedPath)
  }
  $mine = $folders | ForEach-Object { [version](Version-Of $_) } | Sort-Object | Select-Object -First 1
  Write-Host "Found: $($folders -join ', ') (version $mine)"

  # 2) what is the newest version?
  $url = $Fallback; $want = $null
  try {
    $latest = Invoke-RestMethod -Uri "$Server/api/latest" -TimeoutSec 20
    if ($latest.url -and $latest.url -match '\.zip($|\?)') { $url = $latest.url }
    if ($latest.version) { $want = [version]$latest.version }
  } catch { Write-Host 'Server not reachable; using the GitHub copy.' }
  if ($want -and $want -le $mine) { Say "اورآی تو به‌روز است (نسخه‌ی $mine)."; exit 0 }

  # 3) download and open the zip
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  $zip = Join-Path $Tmp 'ora.zip'
  Write-Host 'Downloading...'
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 300
  $new = Join-Path $Tmp 'new'
  Expand-Archive -LiteralPath $zip -DestinationPath $new -Force
  $root = $new
  if (-not (Is-Ora $root)) {
    $inner = Get-ChildItem -LiteralPath $new -Directory | Where-Object { Is-Ora $_.FullName } | Select-Object -First 1
    if ($inner) { $root = $inner.FullName } else { throw 'The download is not Ora.' }
  }
  $theirs = [version](Version-Of $root)
  if ($theirs -le $mine) { Say "اورآی تو به‌روز است (نسخه‌ی $mine)."; exit 0 }

  # 4) copy it over each Ora folder; manifest.json last, because Ora reloads itself as soon as it
  #    sees the new version number
  foreach ($dest in $folders) {
    Write-Host "Installing $theirs into $dest ..."
    $assets = Join-Path $dest 'assets'
    if (Test-Path -LiteralPath $assets) { Remove-Item -LiteralPath $assets -Recurse -Force -ErrorAction SilentlyContinue }
    robocopy $root $dest /E /XF manifest.json /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the new files failed (robocopy $LASTEXITCODE)." }
    Copy-Item -LiteralPath (Join-Path $root 'manifest.json') -Destination (Join-Path $dest 'manifest.json') -Force
    Get-ChildItem -LiteralPath $dest -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
  }
  Say "اورآ به نسخه‌ی $theirs به‌روز شد.`n`nتا یک دقیقه‌ی دیگر خودش دوباره بالا می‌آید؛ اگر عجله داری یک تب تازه باز کن."
} catch {
  Say ("به‌روزرسانی نشد:`n" + $_.Exception.Message + "`n`nاینترنت را بررسی کن و دوباره امتحان کن.") 'Error'
  exit 1
} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
