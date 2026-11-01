@echo off
rem Ora setup - double-click to install Ora in Chrome, Edge or Brave. It opens a small guide for the last step.
set "ORA_SELF=%~f0"
set "ORA_SELF_DIR=%~dp0."
(powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:ORA_SELF,[Text.Encoding]::UTF8); iex ($t.Substring($t.IndexOf('#'+'::PS::')+7))" & exit /b)
#::PS::
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
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$Rtl = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
function Say($text, $icon = 'Information') { [void][System.Windows.Forms.MessageBox]::Show($text, 'اورآ', 'OK', $icon, 'Button1', $Rtl) }

$Server = 'https://ora.p128parsa.workers.dev'
$Fallback = 'https://github.com/ParsaAminzade/Ora/raw/main/downloads/ora-extension-latest.zip'
$Id = 'knlanhnalgmnibmfgblipaclcoomdhdi'   # Ora's extension id (fixed by the key in manifest.json)
$OraHome = Join-Path $env:LOCALAPPDATA 'Ora'
$Dir = Join-Path $OraHome 'Ora'

function Is-Ora($dir) {
  $m = Join-Path $dir 'manifest.json'
  if (-not (Test-Path -LiteralPath $m)) { return $false }
  $t = Get-Content -LiteralPath $m -Raw -Encoding UTF8
  return ($t -match '"short_name"\s*:\s*"Ora"') -and ($t -match '"newtab"')
}
function Version-Of($dir) { [version]((Get-Content -LiteralPath (Join-Path $dir 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version) }

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

# ---------- get the newest Ora into a folder ----------
function Fetch-Ora($tmp) {
  $zip = Join-Path $tmp 'ora.zip'
  $url = $Fallback
  try { $l = Invoke-RestMethod -Uri "$Server/api/latest" -TimeoutSec 20; if ($l.url -match '\.zip($|\?)') { $url = $l.url } } catch { }
  $ok = $false
  foreach ($u in @($url, $Fallback) | Select-Object -Unique) {
    try { Write-Host "Downloading $u ..."; Invoke-WebRequest -Uri $u -OutFile $zip -UseBasicParsing -TimeoutSec 300; $ok = $true; break } catch { Write-Host "  failed: $($_.Exception.Message)" }
  }
  if (-not $ok) {
    # no internet to the servers: a zip downloaded by hand, next to this file
    $local = Get-ChildItem -LiteralPath $env:ORA_SELF_DIR -Filter 'ora-extension*.zip' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $local) { throw 'دانلود نشد. اینترنت را بررسی کن، یا فایل zip اورآ را از سایت بگیر و کنار همین فایل بگذار.' }
    Copy-Item -LiteralPath $local.FullName -Destination $zip
  }
  $new = Join-Path $tmp 'new'
  Expand-Archive -LiteralPath $zip -DestinationPath $new -Force
  if (Is-Ora $new) { return $new }
  $inner = Get-ChildItem -LiteralPath $new -Directory | Where-Object { Is-Ora $_.FullName } | Select-Object -First 1
  if ($inner) { return $inner.FullName }
  throw 'فایل دانلودشده اورآ نیست.'
}
function Copy-Ora($from, $dest) {
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  $assets = Join-Path $dest 'assets'
  if (Test-Path -LiteralPath $assets) { Remove-Item -LiteralPath $assets -Recurse -Force -ErrorAction SilentlyContinue }
  robocopy $from $dest /E /XF manifest.json /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "کپی فایل‌ها نشد (robocopy $LASTEXITCODE)." }
  Copy-Item -LiteralPath (Join-Path $from 'manifest.json') -Destination (Join-Path $dest 'manifest.json') -Force # last: Ora reloads when it sees it
  Get-ChildItem -LiteralPath $dest -Recurse -File | Unblock-File -ErrorAction SilentlyContinue
  # the updater lives next to Ora too, so updating later is one double-click
  # a shortcut to the updater in %LOCALAPPDATA%\Ora — nice to have, never a reason to fail
  try {
    $upd = Join-Path $dest 'Ora-Update.cmd'
    if (Test-Path -LiteralPath $upd) {
      New-Item -ItemType Directory -Path $OraHome -Force | Out-Null
      if ((Resolve-Path -LiteralPath $dest).Path -ne $Dir) { Copy-Item -LiteralPath $upd -Destination (Join-Path $OraHome 'Ora-Update.cmd') -Force }
    }
  } catch { Write-Host "  (updater shortcut skipped: $($_.Exception.Message))" }
}

# ---------- the live guide ----------
function Show-Guide($b) {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = 'نصب اورآ'; $f.RightToLeft = 'Yes'; $f.RightToLeftLayout = $true
  $f.TopMost = $true; $f.FormBorderStyle = 'FixedToolWindow'; $f.StartPosition = 'Manual'
  $f.BackColor = [Drawing.Color]::FromArgb(14, 16, 22); $f.ForeColor = [Drawing.Color]::FromArgb(236, 230, 218)
  $f.Font = New-Object Drawing.Font('Tahoma', 10)
  $f.ClientSize = New-Object Drawing.Size(430, 330)
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $f.Location = New-Object Drawing.Point(($wa.Right - 450), ($wa.Bottom - 360))
  $gold = [Drawing.Color]::FromArgb(222, 186, 120); $dim = [Drawing.Color]::FromArgb(150, 146, 138); $ok = [Drawing.Color]::FromArgb(126, 211, 150)

  $title = New-Object System.Windows.Forms.Label
  $title.Text = 'یک قدم مانده: اورآ را به ' + $b.Name + ' بده'; $title.Font = New-Object Drawing.Font('Tahoma', 12, [Drawing.FontStyle]::Bold)
  $title.ForeColor = $gold; $title.SetBounds(16, 14, 400, 28); $f.Controls.Add($title)

  $sub = New-Object System.Windows.Forms.Label
  $sub.Text = 'صفحه‌ی افزونه‌ها و پوشه‌ی Ora را برایت باز کردم. این دو کار را بکن؛ من خودم می‌فهمم و تیک می‌زنم.'
  $sub.ForeColor = $dim; $sub.SetBounds(16, 44, 400, 40); $f.Controls.Add($sub)

  function Step($n, $y, $text) {
    $mark = New-Object System.Windows.Forms.Label; $mark.Text = $n; $mark.TextAlign = 'MiddleCenter'
    $mark.Font = New-Object Drawing.Font('Tahoma', 11, [Drawing.FontStyle]::Bold); $mark.ForeColor = $gold; $mark.SetBounds(384, $y, 30, 30); $f.Controls.Add($mark)
    $l = New-Object System.Windows.Forms.Label; $l.Text = $text; $l.SetBounds(16, $y, 364, 64); $f.Controls.Add($l)
    return @($mark, $l)
  }
  $s1 = Step '۱' 92 'بالا سمت راست صفحه‌ی افزونه‌ها، کلید «Developer mode» را روشن کن.'
  $s2 = Step '۲' 160 'پوشه‌ی «Ora» را از پنجره‌ی کناری بکش و روی صفحه‌ی افزونه‌ها رها کن. (یا «Load unpacked» را بزن، بعد Ctrl+V و Enter؛ مسیرش را کپی کرده‌ام.)'

  $state = New-Object System.Windows.Forms.Label; $state.ForeColor = $dim; $state.SetBounds(16, 226, 400, 40); $state.Text = 'صفحه‌ی افزونه‌ها باز نشد؟ دکمه‌ی پایین را بزن. بعد از هر کار چند ثانیه طول می‌کشد تا تیک بخورد.'; $f.Controls.Add($state)

  function Btn($text, $x, $w) { $x2 = New-Object System.Windows.Forms.Button; $x2.Text = $text; $x2.FlatStyle = 'Flat'; $x2.ForeColor = $gold; $x2.FlatAppearance.BorderColor = $gold; $x2.SetBounds($x, 270, $w, 40); $f.Controls.Add($x2); return $x2 }
  $bPage = Btn 'باز کردن دوباره‌ی صفحه' 226 188
  $bCopy = Btn 'کپی مسیر' 120 100
  $bFolder = Btn 'پوشه' 16 98
  # if the browser refuses to open its own extensions page from outside, the address goes to the
  # clipboard and the line below says where to paste it
  $bPage.Add_Click({ Start-Process -FilePath $b.Path -ArgumentList $b.Page; Set-Clipboard -Value $b.Page; $state.Text = 'اگر صفحه‌ی افزونه‌ها باز نشد: در نوار آدرس مرورگر Ctrl+V و Enter بزن (آدرسش کپی شد).' })
  $bCopy.Add_Click({ Set-Clipboard -Value $Dir; $state.Text = 'مسیر کپی شد: ' + $Dir })
  $bFolder.Add_Click({ Start-Process explorer.exe -ArgumentList "/select,`"$Dir`"" })

  $done = $false
  $timer = New-Object System.Windows.Forms.Timer; $timer.Interval = 1500
  $timer.Add_Tick({
    if (Dev-Mode $b) { $s1[0].Text = '✓'; $s1[0].ForeColor = $ok; $s1[1].ForeColor = $dim }
    $paths = Ora-Paths $b
    if (($env:ORA_FRESH -and ($paths -contains $Dir)) -or (-not $env:ORA_FRESH -and $paths.Count -gt 0)) {
      $timer.Stop(); $script:done = $true
      $s1[0].Text = '✓'; $s1[0].ForeColor = $ok; $s2[0].Text = '✓'; $s2[0].ForeColor = $ok; $s2[1].ForeColor = $dim
      $title.Text = 'تمام شد! اورآ نصب شد.'; $title.ForeColor = $ok
      $state.Text = 'یک تب تازه باز کن. اگر مرورگر پرسید «این صفحه‌ی تب را نگه داری؟»، «Keep it» را بزن.'
      $bPage.Text = 'باز کردن اورآ'; $bPage.Add_Click({ $f.Close() })
      Start-Process -FilePath $b.Path -ArgumentList ($b.Page -replace 'extensions/$', 'newtab/')
    }
  })
  $timer.Start()
  [void]$f.ShowDialog()
  $timer.Dispose()
  return $script:done
}

# ---------- run ----------
$Tmp = Join-Path $env:TEMP ('ora-setup-' + [guid]::NewGuid().ToString('N'))
try {
  $b = Pick-Browser
  if (-not $b) { Say 'روی این کامپیوتر کروم، اج یا بریو پیدا نکردم. اول یکی را نصب کن (کروم پیشنهاد می‌شود)، بعد دوباره همین فایل را باز کن.' 'Warning'; exit 1 }
  New-Item -ItemType Directory -Path $Tmp | Out-Null
  $src = Fetch-Ora $Tmp
  $theirs = Version-Of $src

  # already there? then this is an update
  $have = @(foreach ($x in $Browsers) { if ($x.Path) { Ora-Paths $x } }) | Select-Object -Unique
  # ORA_FRESH=1: test the newcomer path on a computer that already has Ora (load it into a new browser profile)
  if ($have.Count -and -not $env:ORA_FRESH) {
    foreach ($d in $have) { if ((Version-Of $d) -lt $theirs) { Copy-Ora $src $d } }
    Say "اورآ از قبل نصب است و حالا نسخه‌ی $theirs را دارد.`n`nیک تب تازه باز کن."
    exit 0
  }

  Copy-Ora $src $Dir
  Set-Clipboard -Value $Dir
  Start-Process -FilePath $b.Path -ArgumentList $b.Page
  Start-Sleep -Milliseconds 900
  Start-Process explorer.exe -ArgumentList "/select,`"$Dir`""
  [void](Show-Guide $b)
} catch {
  Say ("نصب نشد:`n" + $_.Exception.Message) 'Error'
  exit 1
} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
