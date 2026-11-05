# Shared by Ora-Setup and Ora-Update (make-updater.mjs puts this in front of each).
# · An Ora window (WPF: rounded dark glass, gold hairline, Ora's eye, Diba) instead of a console,
#   with a «جزئیات» page that shows every step, and the install guide inside the same window.
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

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
# Ora's font (Diba), carried inside this file and put in a temp folder for the window to use
$OraFont = $null
try {
  $fd = Join-Path $env:TEMP 'ora-font'; New-Item -ItemType Directory -Path $fd -Force | Out-Null
  $ff = Join-Path $fd 'diba.ttf'
  if (-not (Test-Path -LiteralPath $ff)) { [IO.File]::WriteAllBytes($ff, [Convert]::FromBase64String('__DIBA__')) }
  $OraFont = New-Object Windows.Media.FontFamily((New-Object Uri("file:///$($fd.Replace('\', '/'))/")), './#Diba, Tahoma')
} catch { }
$OraXaml = @'
__XAML__
'@
function Fa($x) { $d = '۰۱۲۳۴۵۶۷۸۹'; -join ("$x".ToCharArray() | ForEach-Object { if ($_ -match '\d') { $d[[int]"$_"] } else { $_ } }) }
# keep the window alive while we work (one turn of the WPF message loop)
function Pump {
  $frame = New-Object Windows.Threading.DispatcherFrame
  [void][Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background,
    [Windows.Threading.DispatcherOperationCallback] { param($f) $f.Continue = $false; $null }, $frame)
  [Windows.Threading.Dispatcher]::PushFrame($frame)
}
$OraLog = New-Object System.Collections.Generic.List[string]
function Log($m) { $line = "$(Get-Date -Format 'HH:mm:ss')  $m"; $OraLog.Add($line); Write-Host $line; if ($script:OraW -and $script:OraW.LogBox) { $script:OraW.LogBox.AppendText("$line`r`n"); $script:OraW.LogBox.ScrollToEnd() } }

# ---------- the window: dark glass, rounded, Ora's eye; pages for work, the log and the guide ----------
function New-OraWindow($title) {
  # If the window can't be built on this Windows, carry on without it: steps and the result then
  # come as plain message boxes, so nothing ever fails silently (the console is hidden).
  try { $win = [Windows.Markup.XamlReader]::Parse($OraXaml) } catch { Log "window: $($_.Exception.Message)"; return $null }
  if ($OraFont) { $win.FontFamily = $OraFont }
  $w = @{ Win = $win; Closed = $false; Page = 'Work' }
  foreach ($n in 'Card', 'Head', 'Pupil', 'Badge', 'BadgeText', 'CloseBtn', 'PageWork', 'PageLog', 'PageGuide', 'Title', 'Status', 'Track', 'Bar', 'Detail', 'DoneBtn', 'LogBtn', 'LogBox', 'BackBtn', 'CopyLogBtn',
    'GTitle', 'GText', 'GState', 'GNext', 'GPage', 'GCopy', 'PicUrl', 'PicTitle', 'PicDev', 'Toggle', 'Knob', 'LoadBtn', 'PackBtn', 'Ring') { $w[$n] = $win.FindName($n) }
  $w.Title.Text = $title
  $w.Badge.Visibility = 'Collapsed'   # the guide uses it for «قدم ۱ از ۲»
  $win.Tag = $w
  $win.Add_Closed({ $this.Tag.Closed = $true })
  $w.Head.Add_MouseLeftButtonDown({ try { [Windows.Window]::GetWindow($this).DragMove() } catch { } })
  $w.CloseBtn.Add_Click({ [Windows.Window]::GetWindow($this).Close() })
  $w.DoneBtn.Add_Click({ [Windows.Window]::GetWindow($this).Close() })
  $w.LogBtn.Add_Click({ Show-Page ([Windows.Window]::GetWindow($this).Tag) 'Log' })
  $w.BackBtn.Add_Click({ $t = [Windows.Window]::GetWindow($this).Tag; Show-Page $t $t.Back })
  $w.CopyLogBtn.Add_Click({ Set-Clipboard -Value ($OraLog -join "`r`n") })
  # the eye follows the mouse a little
  $win.Add_MouseMove({ param($s, $e) $p = $e.GetPosition($s); $t = $s.Tag.Pupil.RenderTransform; $t.X = [Math]::Max(-3, [Math]::Min(3, ($p.X - 70) / 60)); $t.Y = [Math]::Max(-3, [Math]::Min(3, ($p.Y - 45) / 60)) })
  foreach ($l in $OraLog) { $w.LogBox.AppendText("$l`r`n") }
  $script:OraW = $w
  $win.Show(); Pump
  return $w
}
function Show-Page($w, $name) {
  if ($name -eq 'Log') { $w.Back = $w.Page; $w.LogBox.ScrollToEnd() }
  $w.Page = $name
  foreach ($p in 'Work', 'Log', 'Guide') { $w["Page$p"].Visibility = $(if ($p -eq $name) { 'Visible' } else { 'Collapsed' }) }
}
function Set-Step($w, $status, $pct = -1, $detail = '') {
  Log $status
  if (-not $w) { return }
  if ($w.Closed) { throw 'پنجره بسته شد.' }
  $w.Status.Text = $status; $w.Detail.Text = $detail
  if ($pct -ge 0) { $w.Track.UpdateLayout(); $w.Bar.Width = [Math]::Max(10, $w.Track.ActualWidth * [Math]::Min(1, $pct)) }
  Pump
}
function Finish($w, $ok, $title, $status) {
  Log "$title — $status"
  if (-not $w -or $w.Closed) {
    Add-Type -AssemblyName System.Windows.Forms
    $rtl = [System.Windows.Forms.MessageBoxOptions]::RtlReading -bor [System.Windows.Forms.MessageBoxOptions]::RightAlign
    [void][System.Windows.Forms.MessageBox]::Show("$title`n`n$status", 'اورآ', 'OK', $(if ($ok) { 'Information' } else { 'Error' }), 'Button1', $rtl)
    return
  }
  Show-Page $w 'Work'
  $w.Title.Text = $title
  $w.Title.Foreground = New-Object Windows.Media.SolidColorBrush([Windows.Media.Color]::FromRgb($(if ($ok) { 126 } else { 240 }), $(if ($ok) { 211 } else { 128 }), $(if ($ok) { 150 } else { 112 })))
  $w.Status.Text = $status; $w.Status.Foreground = New-Object Windows.Media.SolidColorBrush([Windows.Media.Color]::FromRgb(216, 210, 198)); $w.Detail.Text = ''
  if ($ok) { $w.Track.UpdateLayout(); $w.Bar.Width = $w.Track.ActualWidth } else { $w.Track.Visibility = 'Collapsed' }
  $w.DoneBtn.Visibility = 'Visible'; $w.Win.Activate() | Out-Null
  while (-not $w.Closed) { Pump; Start-Sleep -Milliseconds 30 }
}
# wait while the window is open (the guide uses this)
function Wait-Window($w) { while (-not $w.Closed) { Pump; Start-Sleep -Milliseconds 30 } }

# ---------- network, with timeouts that hold ----------
function Open-Url($url, $connectMs) {
  $req = [Net.HttpWebRequest]::Create($url)
  $req.Timeout = $connectMs; $req.ReadWriteTimeout = 20000; $req.UserAgent = 'Ora-Installer'; $req.AllowAutoRedirect = $true
  try { $req.Proxy = [Net.WebRequest]::GetSystemWebProxy(); $req.Proxy.Credentials = [Net.CredentialCache]::DefaultCredentials } catch { }
  # connect on a worker so the window keeps breathing while we wait
  $task = $req.GetResponseAsync()
  $t0 = [Environment]::TickCount
  while (-not $task.IsCompleted) { Pump; Start-Sleep -Milliseconds 40; if ([Environment]::TickCount - $t0 -gt $connectMs + 2000) { $req.Abort(); throw "no answer from $([uri]$url | ForEach-Object Host)" } }
  if ($task.IsFaulted) { throw $task.Exception.InnerException }
  return $task.Result
}
# Windows 10+ ships curl.exe; it gets through some networks/VPNs where .NET can't. Run it hidden and
# keep the window breathing while it works.
function Curl-To($url, $out, $secs) {
  $c = Join-Path $env:SystemRoot 'System32\curl.exe'
  if (-not (Test-Path -LiteralPath $c)) { throw 'curl.exe not found' }
  $p = Start-Process -FilePath $c -ArgumentList @('-L','-s','-f','--max-time',"$secs",'-A','Ora-Installer','-o',"`"$out`"","`"$url`"") -WindowStyle Hidden -PassThru
  while (-not $p.HasExited) { Pump; Start-Sleep -Milliseconds 60 }
  if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $out)) { throw "curl $($p.ExitCode)" }
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
  try { $j = (Get-Text $LatestJson) | ConvertFrom-Json; if ($j.version) { Log "latest: $($j.version) (github)"; return $j } } catch { Log "latest.json: $($_.Exception.Message)" }
  try { $f = Join-Path $env:TEMP ('ora-latest-' + [guid]::NewGuid().ToString('N') + '.json'); Curl-To $LatestJson $f 20; $j = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) | ConvertFrom-Json; Remove-Item -LiteralPath $f -ErrorAction SilentlyContinue; if ($j.version) { Log "latest: $($j.version) (curl)"; return $j } } catch { Log "latest.json via curl: $($_.Exception.Message)" }
  try { $j = (Get-Text "$Server/api/latest" 6000) | ConvertFrom-Json; if ($j.version) { return $j } } catch { Log "server: $($_.Exception.Message)" }
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
    try { Log "download: $u"; Get-File $u $zip $w 'اورآ را دانلود می‌کنم…'; $ok = $true; break } catch { $why = $_.Exception.Message; Log "  failed: $why" }
    try { Set-Step $w 'اورآ را دانلود می‌کنم… (راه دوم)' -1; Curl-To $u $zip 180; $ok = $true; Log "  ok via curl"; break } catch { Log "  curl failed: $($_.Exception.Message)" }
  }
  if (-not $ok) {
    Log "using a zip next to this file instead"
    $local = Get-ChildItem -LiteralPath $env:ORA_SELF_DIR -Filter 'ora-extension*.zip' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $local) { throw "دانلود نشد ($why). اینترنت را بررسی کن، یا فایل zip اورآ را کنار همین فایل بگذار و دوباره امتحان کن." }
    Log "local zip: $($local.FullName)"
    Copy-Item -LiteralPath $local.FullName -Destination $zip
    $script:FetchedLocal = $why
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
