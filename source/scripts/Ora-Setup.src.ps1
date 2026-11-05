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

# ---------- the live guide, inside the same Ora window ----------
# Step 1 «Developer mode» → step 2 «Load unpacked, Ctrl+V, Enter, Select Folder» → done.
# It watches the browser's own settings and moves on by itself; the button moves on too, in case
# the browser is slow to save them. The picture shows exactly where to click.
function Show-Guide($w, $b) {
  $edge = $b.Name -eq 'Edge'
  $w.Win.Topmost = $true
  $w.Badge.Visibility = 'Visible'
  $wa = [System.Windows.SystemParameters]::WorkArea
  $w.Win.Left = $wa.Right - $w.Win.Width - 8; $w.Win.Top = $wa.Bottom - $w.Win.Height - 8   # out of the browser's way
  $w.PicUrl.Text = $b.Page.TrimEnd('/')
  if ($edge) {
    # Edge keeps «Developer mode» at the bottom of its left menu
    [Windows.Controls.Canvas]::SetLeft($w.PicDev, 14); [Windows.Controls.Canvas]::SetTop($w.PicDev, 86)
    [Windows.Controls.Canvas]::SetLeft($w.Toggle, 118); [Windows.Controls.Canvas]::SetTop($w.Toggle, 87)
    [Windows.Controls.Canvas]::SetLeft($w.LoadBtn, 170); [Windows.Controls.Canvas]::SetTop($w.LoadBtn, 38)
    [Windows.Controls.Canvas]::SetLeft($w.PackBtn, 290); [Windows.Controls.Canvas]::SetTop($w.PackBtn, 38)
  }
  $gold = [Windows.Media.Color]::FromRgb(227, 189, 122)
  $place = {
    param($stage)
    $on = $stage -ge 2
    $w.Toggle.Background = New-Object Windows.Media.SolidColorBrush($(if ($on) { [Windows.Media.Color]::FromRgb(138, 180, 248) } else { [Windows.Media.Color]::FromRgb(95, 99, 104) }))
    $w.Knob.HorizontalAlignment = $(if ($on) { 'Right' } else { 'Left' })
    $w.LoadBtn.Visibility = $(if ($on) { 'Visible' } else { 'Hidden' }); $w.PackBtn.Visibility = $w.LoadBtn.Visibility
    $target = if ($on) { $w.LoadBtn } else { $w.Toggle }
    $target.UpdateLayout()
    $x = [Windows.Controls.Canvas]::GetLeft($target); $y = [Windows.Controls.Canvas]::GetTop($target)
    $tw = [Math]::Max($target.ActualWidth, 26); $th = [Math]::Max($target.ActualHeight, 14)
    $w.Ring.Width = $tw + 24; $w.Ring.Height = $th + 20
    [Windows.Controls.Canvas]::SetLeft($w.Ring, $x - 12); [Windows.Controls.Canvas]::SetTop($w.Ring, $y - 10)
  }
  $step = {
    param($n)
    $script:stage = $n
    switch ($n) {
      1 {
        $w.BadgeText.Text = 'قدم ۱ از ۲'
        $w.GTitle.Text = 'کلید «Developer mode» را روشن کن'
        $w.GText.Text = $(if ($edge) { 'صفحه‌ی افزونه‌های Edge برایت باز شده. پایینِ منوی سمت چپ، کلیدی هست به اسم «Developer mode». رویش بزن تا روشن (آبی) شود. اگر Edge فارسی است، کنارش «برنامه‌نویس» نوشته شده.' } else { "صفحه‌ی افزونه‌های $($b.Name) برایت باز شده. گوشه‌ی بالا سمت راستِ همان صفحه، کلید کوچکی هست به اسم «Developer mode». رویش بزن تا روشن (آبی) شود. اگر مرورگرت فارسی است، همین کلید بالا سمت چپ است و کنارش «برنامه‌نویس» نوشته شده." })
        $w.GNext.Content = 'روشنش کردم'
        & $place 1
      }
      2 {
        $w.BadgeText.Text = 'قدم ۲ از ۲'
        $w.GTitle.Text = 'روی «Load unpacked» بزن و پوشه را بده'
        $w.GText.Text = 'حالا بالای همان صفحه سه دکمه آمده. روی اولی، «Load unpacked»، بزن. در پنجره‌ای که باز می‌شود، بالای آن توی نوار آدرس کلیک کن، Ctrl+V و Enter بزن (مسیر اورآ را خودم کپی کرده‌ام)، بعد «Select Folder» را بزن.'
        $w.GNext.Content = 'انجامش دادم'
        Set-Clipboard -Value $Dir
        & $place 2
      }
    }
    Log $w.GTitle.Text
  }
  $done = {
    $script:installed = $true
    $w.Win.Topmost = $false
    Show-Page $w 'Work'
    $w.BadgeText.Text = 'تمام!'
    $w.LogBtn.Visibility = 'Collapsed'
    $w.DoneBtn.Content = 'باز کردن اورآ'
    $w.DoneBtn.Add_Click({ Start-Process -FilePath $b.Path -ArgumentList ($b.Page -replace 'extensions/$', 'newtab/') })
    $w.Title.Text = 'اورآ نصب شد'
    $w.Title.Foreground = New-Object Windows.Media.SolidColorBrush([Windows.Media.Color]::FromRgb(126, 211, 150))
    $w.Status.Text = 'یک تب تازه باز کن تا اورآ را ببینی. اگر مرورگر پرسید «این صفحه را نگه داری؟»، «Keep it» را بزن.'
    $w.Track.UpdateLayout(); $w.Bar.Width = $w.Track.ActualWidth; $w.Detail.Text = ''
    $w.DoneBtn.Visibility = 'Visible'
    Log 'Ora is in the browser.'
  }
  $script:installed = $false
  $w.GNext.Add_Click({
    if ($script:stage -eq 1) { & $step 2 }
    elseif ((Ora-Paths $b).Count -gt 0) { & $done }
    else { $w.GState.Text = 'هنوز نمی‌بینمش؛ مرورگر چند ثانیه طول می‌کشد تا خبر بدهد. اگر پوشه را انتخاب کرده‌ای، کمی صبر کن.' }
  })
  $w.GPage.Add_Click({ Start-Process -FilePath $b.Path -ArgumentList $b.Page; Set-Clipboard -Value $b.Page; $w.GState.Text = 'آدرس کپی شد: در نوار آدرس مرورگر Ctrl+V و بعد Enter بزن.' })
  $w.GCopy.Add_Click({ Set-Clipboard -Value $Dir; $w.GState.Text = 'مسیر اورآ کپی شد.' })

  $timer = New-Object Windows.Threading.DispatcherTimer
  $timer.Interval = [TimeSpan]::FromMilliseconds(1500)
  $timer.Add_Tick({
    if ($script:installed) { return }
    if ($script:stage -eq 1 -and (Dev-Mode $b)) { & $step 2 }
    $paths = Ora-Paths $b
    $found = if ($env:ORA_FRESH) { $paths -contains $Dir } else { $paths.Count -gt 0 }
    if ($found) { & $done }
  })
  Show-Page $w 'Guide'
  & $step 1
  $timer.Start()
  Wait-Window $w
  $timer.Stop()
  return $script:installed
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
  Set-Clipboard -Value $Dir
  Start-Process -FilePath $b.Path -ArgumentList $b.Page
  if ($w) { [void](Show-Guide $w $b) }
  else { Say "صفحه‌ی افزونه‌ها باز شد.`n`n۱. کلید «Developer mode» را روشن کن (بالا سمت راست؛ در مرورگر فارسی بالا سمت چپ).`n۲. «Load unpacked» را بزن، در نوار آدرس پنجره Ctrl+V و Enter بزن، بعد «Select Folder».`n`nمسیر اورآ کپی شده است." }
} catch {
  Log "error: $($_.Exception.Message)"
  if ($w -and -not $w.Closed) { Finish $w $false 'نصب نشد' $_.Exception.Message } else { Say ("نصب نشد:`n" + $_.Exception.Message) 'Error' }
  exit 1
} finally {
  if (Test-Path -LiteralPath $Tmp) { Remove-Item -LiteralPath $Tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
