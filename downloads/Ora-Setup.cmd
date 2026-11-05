@echo off
rem Ora setup - double-click to install Ora in Chrome, Edge or Brave. It opens a small guide for the last step.
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

# Ora setup for Windows. Double-click Ora-Setup.cmd (Downloads is fine).
#
# Chrome (since version 137) lets no program install an extension from outside the Chrome Web Store
# by itself — a guard against malware. So this does everything around that one step and then walks
# you through it live:
#   1. puts Ora in a fixed folder (%LOCALAPPDATA%\Ora\Ora) — the newest version, from Ora's server
#      (or GitHub, or a zip lying next to this file)
#   2. opens your browser's extensions page and, beside it, the Ora folder
#   3. a small guide window: «turn on Developer mode» → «drag the Ora folder onto the page»
#      (or Load unpacked + Ctrl+V, the path is already copied); it watches and ticks each step
#   4. when the browser has Ora, it says so and opens a new tab
# Already installed? Then it just updates it, like Ora-Update.
$Rtl = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
function Say($text, $icon = 'Information') { [void][System.Windows.Forms.MessageBox]::Show($text, 'اورآ', 'OK', $icon, 'Button1', $Rtl) }

$OraHome = Join-Path $env:LOCALAPPDATA 'Ora'
$Dir = Join-Path $OraHome 'Ora'


# ---------- browsers ----------
$Browsers = @(
  @{ Name = 'Chrome'; Prog = 'ChromeHTML'; Page = 'chrome://extensions/'; Data = "$env:LOCALAPPDATA\Google\Chrome\User Data";
     Exe = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") },
  @{ Name = 'Edge'; Prog = 'MSEdgeHTM'; Page = 'edge://extensions/'; Data = "$env:LOCALAPPDATA\Microsoft\Edge\User Data";
     Exe = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") },
  @{ Name = 'Brave'; Prog = 'BraveHTML'; Page = 'brave://extensions/'; Data = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data";
     Exe = @("$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe", "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe") }
)
foreach ($b in $Browsers) { $b.Path = $b.Exe | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1 }
function Pick-Browser {
  $have = @($Browsers | Where-Object { $_.Path })
  if (-not $have.Count) { return $null }
  try {
    $prog = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice' -ErrorAction Stop).ProgId
    $def = $have | Where-Object { $prog -like "$($_.Prog)*" } | Select-Object -First 1
    if ($def) { return $def }
  } catch { }
  return $have[0] # Chrome first, then Edge, then Brave
}

# Every place a browser remembers Ora (any profile), and whether Developer mode is on somewhere.
function Pref-Files($b) {
  if (-not (Test-Path -LiteralPath $b.Data)) { return @() }
  Get-ChildItem -LiteralPath $b.Data -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    foreach ($f in 'Secure Preferences', 'Preferences') { $p = Join-Path $_.FullName $f; if (Test-Path -LiteralPath $p) { $p } }
  }
}
function Read-Text($f) { try { $s = [IO.File]::Open($f, 'Open', 'Read', 'ReadWrite'); try { (New-Object IO.StreamReader($s)).ReadToEnd() } finally { $s.Dispose() } } catch { '' } }
function Ora-Paths($b) {
  $out = @()
  foreach ($file in Pref-Files $b) {
    $t = Read-Text $file
    $i = $t.IndexOf("`"$Id`":{")
    if ($i -lt 0) { continue }
    $m = [regex]::Match($t.Substring($i, [Math]::Min(20000, $t.Length - $i)), '"path":"((?:[^"\\]|\\.)*)"')
    if ($m.Success) { $p = [regex]::Unescape($m.Groups[1].Value); if ([IO.Path]::IsPathRooted($p) -and (Is-Ora $p)) { $out += $p } }
  }
  return @($out | Select-Object -Unique)
}
function Dev-Mode($b) { foreach ($file in Pref-Files $b) { if ((Read-Text $file) -match '"developer_mode"\s*:\s*true') { return $true } }; return $false }

# a shortcut to the updater in %LOCALAPPDATA%\Ora — nice to have, never a reason to fail
function Keep-Updater($dest) {
  try {
    $upd = Join-Path $dest 'Ora-Update.cmd'
    if (Test-Path -LiteralPath $upd) {
      New-Item -ItemType Directory -Path $OraHome -Force | Out-Null
      if ((Resolve-Path -LiteralPath $dest).Path -ne $Dir) { Copy-Item -LiteralPath $upd -Destination (Join-Path $OraHome 'Ora-Update.cmd') -Force }
    }
  } catch { Write-Host "  (updater shortcut skipped: $($_.Exception.Message))" }
}

# ---------- the live guide: one step at a time, with a picture of exactly where to click ----------
# Step 1 «Developer mode» → step 2 «Load unpacked, Ctrl+V, Enter, Select Folder» → done.
# It watches the browser's own settings and moves on by itself; the buttons move on too, in case
# the browser is slow to save them.
function Show-Guide($b) {
  $edge = $b.Name -eq 'Edge'
  $gold = [Drawing.Color]::FromArgb(222, 186, 120); $ink = [Drawing.Color]::FromArgb(236, 230, 218)
  $dim = [Drawing.Color]::FromArgb(150, 146, 138); $ok = [Drawing.Color]::FromArgb(126, 211, 150)
  $bg = [Drawing.Color]::FromArgb(14, 16, 22)
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'نصب اورآ'; $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
  $f.TopMost = $true; $f.FormBorderStyle = 'FixedToolWindow'; $f.StartPosition = 'Manual'
  $f.BackColor = $bg; $f.ForeColor = $ink; $f.Font = New-Object Drawing.Font('Tahoma', 10)
  $f.ClientSize = New-Object Drawing.Size(460, 470)
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $f.Location = New-Object Drawing.Point(($wa.Right - 480), ($wa.Bottom - 500))

  $count = New-Object System.Windows.Forms.Label; $count.ForeColor = $gold; $count.SetBounds(16, 12, 428, 22); $f.Controls.Add($count)
  $title = New-Object System.Windows.Forms.Label; $title.Font = New-Object Drawing.Font('Tahoma', 13, [Drawing.FontStyle]::Bold); $title.SetBounds(16, 36, 428, 30); $f.Controls.Add($title)

  # the picture: a little drawing of the browser's extensions page with the spot to click circled
  $pic = New-Object System.Windows.Forms.Panel; $pic.SetBounds(16, 72, 428, 150); $pic.BackColor = [Drawing.Color]::FromArgb(32, 33, 36); $f.Controls.Add($pic)
  $script:stage = 1
  $pic.Add_Paint({
    param($s, $e)
    $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'
    $fg = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(220, 220, 220))
    $soft = New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(140, 140, 140))
    $font = New-Object Drawing.Font('Segoe UI', 9); $bold = New-Object Drawing.Font('Segoe UI', 10, [Drawing.FontStyle]::Bold)
    $pen = New-Object Drawing.Pen($gold, 3)
    # address bar
    $g.FillRectangle((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(53, 54, 58))), 10, 8, 408, 22)
    $g.DrawString(($b.Page.TrimEnd('/')), $font, $soft, 18, 11)
    if ($edge) {
      # Edge: Developer mode sits at the bottom of the left menu; Load unpacked at the top of the page
      $g.FillRectangle((New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(43, 43, 46))), 10, 36, 120, 108)
      $g.DrawString('Extensions', $bold, $fg, 18, 42)
      $g.DrawString('Developer mode', $font, $fg, 18, 118)
      $tog = New-Object Drawing.Rectangle(108, 119, 18, 10)
      $load = New-Object Drawing.Rectangle(145, 40, 100, 24)
    } else {
      $g.DrawString('Extensions', $bold, $fg, 14, 40)
      $g.DrawString('Developer mode', $font, $fg, 290, 41)
      $tog = New-Object Drawing.Rectangle(392, 43, 22, 12)
      $load = New-Object Drawing.Rectangle(14, 70, 110, 26)
    }
    $on = $script:stage -ge 2
    $g.FillEllipse((New-Object Drawing.SolidBrush($(if ($on) { [Drawing.Color]::FromArgb(138, 180, 248) } else { [Drawing.Color]::FromArgb(110, 110, 110) }))), $tog)
    $knob = if ($on) { $tog.Right - $tog.Height } else { $tog.X }
    $g.FillEllipse((New-Object Drawing.SolidBrush([Drawing.Color]::White)), $knob, $tog.Y, $tog.Height, $tog.Height)
    if ($on) {
      # the three buttons that appear once Developer mode is on; «Load unpacked» is the first
      $g.DrawRectangle((New-Object Drawing.Pen([Drawing.Color]::FromArgb(138, 180, 248), 1)), $load)
      $g.DrawString('Load unpacked', $font, (New-Object Drawing.SolidBrush([Drawing.Color]::FromArgb(138, 180, 248))), $load.X + 8, $load.Y + 5)
      $g.DrawRectangle((New-Object Drawing.Pen([Drawing.Color]::FromArgb(90, 90, 90), 1)), $load.Right + 8, $load.Y, 90, $load.Height)
      $g.DrawString('Pack extension', $font, $soft, $load.Right + 14, $load.Y + 5)
      $ring = New-Object Drawing.Rectangle(($load.X - 6), ($load.Y - 6), ($load.Width + 12), ($load.Height + 12))
    } else {
      $ring = New-Object Drawing.Rectangle(($tog.X - 10), ($tog.Y - 10), ($tog.Width + 20), ($tog.Height + 20))
    }
    $g.DrawEllipse($pen, $ring)
    # «اینجا» next to the circle
    $sf = New-Object Drawing.StringFormat; $sf.FormatFlags = 'DirectionRightToLeft'
    $here = New-Object Drawing.Font('Tahoma', 10, [Drawing.FontStyle]::Bold)
    $hx = if ($ring.X -gt 214) { $ring.X - 70 } else { $ring.Right + 8 }
    $g.DrawString('اینجا', $here, (New-Object Drawing.SolidBrush($gold)), $hx, ($ring.Y + 2))
  })

  $text = New-Object System.Windows.Forms.Label; $text.SetBounds(16, 232, 428, 150); $text.Font = New-Object Drawing.Font('Tahoma', 10.5); $f.Controls.Add($text)
  $state = New-Object System.Windows.Forms.Label; $state.ForeColor = $dim; $state.SetBounds(16, 382, 428, 22); $f.Controls.Add($state)

  function Btn($t, $x, $w, $main) { $x2 = New-Object System.Windows.Forms.Button; $x2.Text = $t; $x2.FlatStyle = 'Flat'; $x2.SetBounds($x, 414, $w, 40)
    if ($main) { $x2.BackColor = $gold; $x2.ForeColor = [Drawing.Color]::FromArgb(26, 20, 11); $x2.FlatAppearance.BorderSize = 0 } else { $x2.ForeColor = $gold; $x2.FlatAppearance.BorderColor = $gold }
    $f.Controls.Add($x2); return $x2 }
  $bNext = Btn 'انجامش دادم' 284 160 $true
  $bPage = Btn 'صفحه باز نشد' 150 126 $false
  $bCopy = Btn 'کپی مسیر' 16 126 $false

  function Show-Step($n) {
    $script:stage = $n
    switch ($n) {
      1 {
        $count.Text = 'قدم ۱ از ۲'
        $title.Text = 'کلید «Developer mode» را روشن کن'
        $text.Text = $(if ($edge) { "صفحه‌ی افزونه‌های Edge برایت باز شده. پایینِ منوی سمت چپ، کلیدی هست به اسم «Developer mode». رویش بزن تا روشن (آبی) شود.`n`nاگر Edge فارسی است، کلیدی است که کنارش «برنامه‌نویس» نوشته شده." } else { "صفحه‌ی افزونه‌های $($b.Name) برایت باز شده. گوشه‌ی بالا سمت راستِ همان صفحه، کلید کوچکی هست به اسم «Developer mode». رویش بزن تا روشن (آبی) شود.`n`nاگر مرورگرت فارسی است، همین کلید بالا سمت چپ است و کنارش «برنامه‌نویس» نوشته شده." })
        $bNext.Text = 'روشنش کردم'
      }
      2 {
        $count.Text = 'قدم ۲ از ۲'
        $title.Text = 'روی «Load unpacked» بزن و پوشه را بده'
        $text.Text = "حالا بالای همان صفحه سه دکمه آمده. روی اولی، «Load unpacked»، بزن.`n`nیک پنجره‌ی انتخاب پوشه باز می‌شود. بالای آن پنجره، توی نوار آدرس کلیک کن، Ctrl+V بزن و Enter (مسیر اورآ را خودم کپی کرده‌ام). بعد دکمه‌ی «Select Folder» را بزن."
        $bNext.Text = 'انجامش دادم'
        Set-Clipboard -Value $Dir
      }
      3 {
        $count.Text = 'تمام!'; $count.ForeColor = $ok
        $title.Text = 'اورآ نصب شد'; $title.ForeColor = $ok
        $text.Text = "یک تب تازه باز کن تا اورآ را ببینی.`n`nاگر مرورگر پرسید «این صفحه را نگه داری؟»، «Keep it» را بزن."
        $bNext.Text = 'باز کردن اورآ'; $bPage.Visible = $false; $bCopy.Visible = $false
        $state.Text = ''
      }
    }
    $pic.Visible = $n -lt 3
    $pic.Invalidate()
  }
  $script:done = $false
  $bNext.Add_Click({
    if ($script:stage -eq 1) { Show-Step 2 }
    elseif ($script:stage -eq 2) {
      if ((Ora-Paths $b).Count -gt 0) { $script:done = $true; Show-Step 3 }
      else { $state.Text = 'هنوز نمی‌بینمش؛ مرورگر چند ثانیه طول می‌کشد. اگر پوشه را انتخاب کرده‌ای، کمی صبر کن.' }
    } else { Start-Process -FilePath $b.Path -ArgumentList ($b.Page -replace 'extensions/$', 'newtab/'); $f.Close() }
  })
  $bPage.Add_Click({ Start-Process -FilePath $b.Path -ArgumentList $b.Page; Set-Clipboard -Value $b.Page; $state.Text = 'آدرس کپی شد: در نوار آدرس مرورگر Ctrl+V و بعد Enter بزن.' })
  $bCopy.Add_Click({ Set-Clipboard -Value $Dir; $state.Text = 'مسیر اورآ کپی شد.' })

  $timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 1500
  $timer.Add_Tick({
    if ($script:stage -eq 1 -and (Dev-Mode $b)) { Show-Step 2 }
    $paths = Ora-Paths $b
    $found = if ($env:ORA_FRESH) { $paths -contains $Dir } else { $paths.Count -gt 0 }
    if ($script:stage -lt 3 -and $found) { $script:done = $true; Show-Step 3; $timer.Stop() }
  })
  Show-Step 1
  $timer.Start()
  [void]$f.ShowDialog()
  $timer.Dispose()
  return $script:done
}

# ---------- run ----------
$Tmp = Join-Path $env:TEMP ('ora-setup-' + [guid]::NewGuid().ToString('N'))
$w = $null
try {
  $w = New-OraWindow 'نصب اورآ'
  $b = Pick-Browser
  if (-not $b) { Finish $w $false 'نصب نشد' 'روی این کامپیوتر کروم، اج یا بریو پیدا نکردم. اول یکی را نصب کن (کروم پیشنهاد می‌شود)، بعد دوباره همین فایل را باز کن.'; exit 1 }
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  $latest = Get-Latest $w
  $src = Fetch-Ora $Tmp $w $latest
  $theirs = Version-Of $src

  # already there? then this is an update
  $have = @(foreach ($x in $Browsers) { if ($x.Path) { Ora-Paths $x } }) | Select-Object -Unique
  # ORA_FRESH=1: test the newcomer path on a computer that already has Ora (load it into a new browser profile)
  if ($have.Count -and -not $env:ORA_FRESH) {
    Set-Step $w "نسخه‌ی $(Fa $theirs) را جای قبلی می‌گذارم…" 1
    foreach ($d in $have) { if ((Version-Of $d) -lt $theirs) { Copy-Ora $src $d; Keep-Updater $d } }
    Finish $w $true "اورآ نسخه‌ی $(Fa $theirs) را دارد" 'از قبل نصب بود و حالا به‌روز است. یک تب تازه باز کن.'
    exit 0
  }

  Set-Step $w 'اورآ را سر جایش می‌گذارم…' 1
  Copy-Ora $src $Dir; Keep-Updater $Dir
  $w.Form.Close(); Pump
  Set-Clipboard -Value $Dir
  Start-Process -FilePath $b.Path -ArgumentList $b.Page
  Start-Sleep -Milliseconds 900
  Start-Process explorer.exe -ArgumentList "/select,`"$Dir`""
  [void](Show-Guide $b)
} catch {
  if ($w -and -not $w.Closed) { Finish $w $false 'نصب نشد' $_.Exception.Message } else { Say ("نصب نشد:`n" + $_.Exception.Message) 'Error' }
  exit 1
} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
