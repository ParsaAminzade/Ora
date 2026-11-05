@echo off
rem Ora updater - double-click to update Ora (the Chrome extension) to the newest version.
set "ORA_SELF=%~f0"
set "ORA_SELF_DIR=%~dp0."
(powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$t=[IO.File]::ReadAllText($env:ORA_SELF,[Text.Encoding]::UTF8); iex ($t.Substring($t.IndexOf('#'+'::PS::')+7))" & exit /b)
#::PS::
# Shared by Ora-Setup and Ora-Update (make-updater.mjs puts this in front of each).
# · A small Ora window with a gold progress bar instead of a console.
# · Downloads that can't hang: every connection and every read has its own timeout, the newest version
#   is read from GitHub first (reachable even when Cloudflare is not), and the window keeps
#   responding while bytes arrive.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # PowerShell's own progress bar makes downloads crawl
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Server = 'https://ora.p128parsa.workers.dev'
$LatestJson = 'https://raw.githubusercontent.com/ParsaAminzade/Ora/main/downloads/latest.json'
$Fallback = 'https://github.com/ParsaAminzade/Ora/raw/main/downloads/ora-extension-latest.zip'
$Id = 'knlanhnalgmnibmfgblipaclcoomdhdi'   # Ora's extension id (fixed by the key in manifest.json)

$C = @{
  Bg = [Drawing.Color]::FromArgb(14, 16, 22); Ink = [Drawing.Color]::FromArgb(236, 230, 218)
  Dim = [Drawing.Color]::FromArgb(150, 146, 138); Gold = [Drawing.Color]::FromArgb(222, 186, 120)
  Ok = [Drawing.Color]::FromArgb(126, 211, 150); Bad = [Drawing.Color]::FromArgb(240, 128, 112)
  Track = [Drawing.Color]::FromArgb(40, 42, 50)
}
function Fa($x) { $d = '۰۱۲۳۴۵۶۷۸۹'; -join ("$x".ToCharArray() | ForEach-Object { if ($_ -match '\d') { $d[[int]"$_"] } else { $_ } }) }
function Pump { [System.Windows.Forms.Application]::DoEvents() }

# ---------- the window ----------
function New-OraWindow($title) {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'اورآ'; $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
  $f.FormBorderStyle = 'FixedSingle'; $f.MaximizeBox = $false; $f.StartPosition = 'CenterScreen'
  $f.BackColor = $C.Bg; $f.ForeColor = $C.Ink; $f.Font = New-Object Drawing.Font('Tahoma', 10)
  $f.ClientSize = New-Object Drawing.Size(460, 236)
  try { $f.Icon = [Drawing.Icon]::ExtractAssociatedIcon("$env:SystemRoot\System32\shell32.dll") } catch { }
  $logo = New-Object System.Windows.Forms.Label; $logo.Text = 'اورآ'; $logo.ForeColor = $C.Gold
  $logo.Font = New-Object Drawing.Font('Tahoma', 20, [Drawing.FontStyle]::Bold); $logo.SetBounds(20, 14, 420, 40); $f.Controls.Add($logo)
  $t = New-Object System.Windows.Forms.Label; $t.Text = $title; $t.Font = New-Object Drawing.Font('Tahoma', 12, [Drawing.FontStyle]::Bold)
  $t.SetBounds(20, 58, 420, 28); $f.Controls.Add($t)
  $s = New-Object System.Windows.Forms.Label; $s.ForeColor = $C.Dim; $s.SetBounds(20, 92, 420, 44); $f.Controls.Add($s)
  $track = New-Object System.Windows.Forms.Panel; $track.BackColor = $C.Track; $track.SetBounds(20, 142, 420, 8); $f.Controls.Add($track)
  $bar = New-Object System.Windows.Forms.Panel; $bar.BackColor = $C.Gold; $bar.SetBounds(0, 0, 0, 8); $track.Controls.Add($bar)
  $d = New-Object System.Windows.Forms.Label; $d.ForeColor = $C.Dim; $d.Font = New-Object Drawing.Font('Tahoma', 9); $d.SetBounds(20, 156, 420, 20); $f.Controls.Add($d)
  $b = New-Object System.Windows.Forms.Button; $b.Text = 'بستن'; $b.FlatStyle = 'Flat'; $b.BackColor = $C.Gold
  $b.ForeColor = [Drawing.Color]::FromArgb(26, 20, 11); $b.FlatAppearance.BorderSize = 0; $b.SetBounds(20, 186, 130, 36); $b.Visible = $false
  $b.Add_Click({ $this.FindForm().Close() }); $f.Controls.Add($b)
  $w = @{ Form = $f; Title = $t; Status = $s; Track = $track; Bar = $bar; Detail = $d; Button = $b; Closed = $false }
  $f.Tag = $w
  $f.Add_FormClosed({ $this.Tag.Closed = $true })
  $f.Show(); Pump
  return $w
}
function Set-Step($w, $status, $pct = -1, $detail = '') {
  if (-not $w) { Write-Host $status; return }
  if ($w.Closed) { throw 'بسته شد.' }
  $w.Status.Text = $status; $w.Detail.Text = $detail
  if ($pct -ge 0) { $w.Bar.Width = [int]($w.Track.Width * [Math]::Min(1, $pct)) }
  # RTL: the bar grows from the right
  $w.Bar.Left = $w.Track.Width - $w.Bar.Width
  Pump
}
function Finish($w, $ok, $title, $status) {
  if (-not $w) { Write-Host "$title $status"; return }
  $w.Title.Text = $title; $w.Title.ForeColor = $(if ($ok) { $C.Ok } else { $C.Bad })
  $w.Status.Text = $status; $w.Status.ForeColor = $C.Ink; $w.Detail.Text = ''
  if ($ok) { $w.Bar.BackColor = $C.Ok; $w.Bar.Width = $w.Track.Width; $w.Bar.Left = 0 } else { $w.Track.Visible = $false }
  $w.Button.Visible = $true; $w.Form.Activate()
  while (-not $w.Closed) { Pump; Start-Sleep -Milliseconds 40 }
}

# ---------- network, with timeouts that hold ----------
function Open-Url($url, $connectMs) {
  $req = [Net.HttpWebRequest]::Create($url)
  $req.Timeout = $connectMs; $req.ReadWriteTimeout = 20000; $req.UserAgent = 'Ora-Installer'; $req.AllowAutoRedirect = $true
  # connect on a worker so the window keeps breathing while we wait
  $task = $req.GetResponseAsync()
  $t0 = [Environment]::TickCount
  while (-not $task.IsCompleted) { Pump; Start-Sleep -Milliseconds 40; if ([Environment]::TickCount - $t0 -gt $connectMs + 2000) { $req.Abort(); throw "no answer from $([uri]$url | ForEach-Object Host)" } }
  if ($task.IsFaulted) { throw $task.Exception.InnerException }
  return $task.Result
}
function Get-Text($url, $connectMs = 8000) {
  $res = Open-Url $url $connectMs
  try { (New-Object IO.StreamReader($res.GetResponseStream(), [Text.Encoding]::UTF8)).ReadToEnd() } finally { $res.Close() }
}
function Get-File($url, $out, $w, $what) {
  $res = Open-Url $url 15000
  try {
    $len = $res.ContentLength; $in = $res.GetResponseStream(); $fs = [IO.File]::Create($out)
    try {
      $buf = New-Object byte[] 65536; $got = 0; $last = 0
      while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
        $fs.Write($buf, 0, $n); $got += $n
        if ([Environment]::TickCount - $last -gt 80) {
          $last = [Environment]::TickCount
          $mb = '{0:0.0}' -f ($got / 1MB)
          if ($len -gt 0) { Set-Step $w $what ($got / $len) ("$(Fa $mb) از $(Fa ('{0:0.0}' -f ($len / 1MB))) مگابایت") }
          else { Set-Step $w $what -1 ("$(Fa $mb) مگابایت") }
        }
      }
    } finally { $fs.Close() }
    if ($len -gt 0 -and $got -lt $len) { throw 'download cut off' }
  } finally { $res.Close() }
}
# The newest version and where to get it: GitHub first (it answers in Iran), then Ora's server.
function Get-Latest($w) {
  Set-Step $w 'دنبال آخرین نسخه می‌گردم…' 0.03
  try { $j = (Get-Text $LatestJson) | ConvertFrom-Json; if ($j.version) { return $j } } catch { Write-Host "latest.json: $($_.Exception.Message)" }
  try { $j = (Get-Text "$Server/api/latest" 6000) | ConvertFrom-Json; if ($j.version) { return $j } } catch { Write-Host "server: $($_.Exception.Message)" }
  return $null
}
# Download the newest Ora into $tmp and return the folder that holds it.
function Fetch-Ora($tmp, $w, $latest) {
  $zip = Join-Path $tmp 'ora.zip'
  $urls = @()
  if ($latest -and $latest.url -match '\.zip($|\?)') { $urls += $latest.url }
  $urls += $Fallback
  $ok = $false; $why = ''
  foreach ($u in ($urls | Select-Object -Unique)) {
    try { Get-File $u $zip $w 'اورآ را دانلود می‌کنم…'; $ok = $true; break } catch { $why = $_.Exception.Message; Write-Host "  failed: $why" }
  }
  if (-not $ok) {
    $local = Get-ChildItem -LiteralPath $env:ORA_SELF_DIR -Filter 'ora-extension*.zip' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $local) { throw "دانلود نشد ($why). اینترنت را بررسی کن، یا فایل zip اورآ را کنار همین فایل بگذار و دوباره امتحان کن." }
    Copy-Item -LiteralPath $local.FullName -Destination $zip
  }
  Set-Step $w 'باز کردن فایل‌ها…' 1
  $new = Join-Path $tmp 'new'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($zip, $new)
  if (Is-Ora $new) { return $new }
  $inner = Get-ChildItem -LiteralPath $new -Directory | Where-Object { Is-Ora $_.FullName } | Select-Object -First 1
  if ($inner) { return $inner.FullName }
  throw 'فایل دانلودشده اورآ نیست.'
}

function Is-Ora($dir) {
  $m = Join-Path $dir 'manifest.json'
  if (-not (Test-Path -LiteralPath $m)) { return $false }
  $t = Get-Content -LiteralPath $m -Raw -Encoding UTF8
  return ($t -match '"short_name"\s*:\s*"Ora"') -and ($t -match '"newtab"')
}
function Version-Of($dir) { [version]((Get-Content -LiteralPath (Join-Path $dir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version) }
# Copy Ora over a folder; manifest.json last, because Ora reloads itself when it sees the new number.
function Copy-Ora($from, $dest) {
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  $assets = Join-Path $dest 'assets'
  if (Test-Path -LiteralPath $assets) { Remove-Item -LiteralPath $assets -Recurse -Force -ErrorAction SilentlyContinue }
  robocopy $from $dest /E /XF manifest.json /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "کپی فایل‌ها نشد (robocopy $LASTEXITCODE)." }
  Copy-Item -LiteralPath (Join-Path $from 'manifest.json') -Destination (Join-Path $dest 'manifest.json') -Force
  Get-ChildItem -LiteralPath $dest -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
}

# Ora updater for Windows. Double-click Ora-Update.cmd from anywhere (Downloads is fine): it finds
# the folder Chrome loads Ora from, downloads the newest version and copies it over that folder.
# Tasks, notes and settings live inside Chrome, not in that folder, so nothing of yours is touched.
# Ora notices its new files by itself within a minute and reloads.
# (The window, downloads and copying are in ora-common.ps1, put in front of this by make-updater.mjs.)

# where is Ora? — the folder this file is in, else what Chrome/Edge/Brave remember, else a look in
# the usual places, else ask.
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
    foreach ($base in @("$HOME\Downloads", "$HOME\Desktop", "$HOME\Documents", "$HOME\OneDrive\Desktop", "$HOME\OneDrive\Documents", "$env:LOCALAPPDATA\Ora")) {
      if (-not (Test-Path -LiteralPath $base)) { continue }
      Get-ChildItem -LiteralPath $base -Filter manifest.json -Recurse -Depth 3 -File -ErrorAction SilentlyContinue |
        ForEach-Object { if (Is-Ora $_.DirectoryName) { $found.Add($_.DirectoryName) } }
    }
  }
  return @($found | Select-Object -Unique)
}

$Tmp = Join-Path $env:TEMP ('ora-update-' + [guid]::NewGuid().ToString('N'))
$w = $null
try {
  $w = New-OraWindow 'به‌روزرسانی اورآ'
  Set-Step $w 'دنبال اورآ روی این کامپیوتر می‌گردم…' 0.01
  $folders = @(Find-Folders)
  if ($folders.Count -eq 0) {
    Set-Step $w 'پوشه‌ی اورآ را خودم پیدا نکردم؛ نشانم بده کجاست.' 0.01
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'پوشه‌ای که اورآ را از آن نصب کرده‌ای (همان که manifest.json دارد)'
    if ($dlg.ShowDialog($w.Form) -ne 'OK') { Finish $w $false 'به‌روزرسانی نشد' 'پوشه‌ای انتخاب نشد.'; exit 1 }
    if (-not (Is-Ora $dlg.SelectedPath)) { Finish $w $false 'به‌روزرسانی نشد' 'این پوشه اورآ نیست؛ manifest.json اورآ در آن نیست.'; exit 1 }
    $folders = @($dlg.SelectedPath)
  }
  $mine = $folders | ForEach-Object { Version-Of $_ } | Sort-Object | Select-Object -First 1
  Set-Step $w "اورآی تو نسخه‌ی $(Fa $mine) است." 0.02

  $latest = Get-Latest $w
  if ($latest -and [version]$latest.version -le $mine) { Finish $w $true 'اورآی تو به‌روز است' "نسخه‌ی $(Fa $mine)؛ چیزی برای دانلود نیست."; exit 0 }

  New-Item -ItemType Directory -Path $Tmp | Out-Null
  $root = Fetch-Ora $Tmp $w $latest
  $theirs = Version-Of $root
  if ($theirs -le $mine) { Finish $w $true 'اورآی تو به‌روز است' "نسخه‌ی $(Fa $mine)."; exit 0 }

  Set-Step $w "نسخه‌ی $(Fa $theirs) را جای قبلی می‌گذارم…" 1
  foreach ($dest in $folders) { Copy-Ora $root $dest }
  Finish $w $true "اورآ به نسخه‌ی $(Fa $theirs) به‌روز شد" 'تا یک دقیقه‌ی دیگر خودش دوباره بالا می‌آید؛ اگر عجله داری، یک تب تازه باز کن. کارها و یادداشت‌هایت سر جایشان هستند.'
} catch {
  Finish $w $false 'به‌روزرسانی نشد' ($_.Exception.Message + ' — اینترنت را بررسی کن و دوباره امتحان کن.')
  exit 1
} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
