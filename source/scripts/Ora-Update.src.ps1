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
    if ($dlg.ShowDialog() -ne 'OK') { Finish $w $false 'به‌روزرسانی نشد' 'پوشه‌ای انتخاب نشد.'; exit 1 }
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
