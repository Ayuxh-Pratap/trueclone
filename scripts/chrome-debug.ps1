# Lab Chrome with a CDP port for REA (inspect-web-page, analyze-web-bundle...) and for capture/diff --cdp.
# Uses its own profile in .chrome-profile, never your everyday Chrome profile.
param([string]$Url = "about:blank", [int]$Port = 9222)
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$profileDir = Join-Path $PSScriptRoot "..\.chrome-profile"
Start-Process $chrome -ArgumentList "--remote-debugging-port=$Port", "--user-data-dir=`"$profileDir`"", "--no-first-run", "--no-default-browser-check", $Url
Write-Host "Lab Chrome on http://127.0.0.1:$Port  (try: npm run rea -- list-browser-targets http://127.0.0.1:$Port --json)"
