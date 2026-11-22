$ErrorActionPreference = 'Stop'
# Native UI checks launch the release EXE directly, without running NSIS's
# normal WebView2 bootstrap. Make that prerequisite explicit on hosted CI.
function Find-WebView2 {
  $roots = @(
    "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application",
    "$env:ProgramFiles\Microsoft\EdgeWebView\Application",
    "$env:LOCALAPPDATA\Microsoft\EdgeWebView\Application"
  )
  foreach ($root in $roots) {
    $runtime = Get-ChildItem -Path "$root\*\msedgewebview2.exe" -File -ErrorAction SilentlyContinue |
      Sort-Object { [version]$_.VersionInfo.FileVersion } -Descending | Select-Object -First 1
    if ($runtime) { return $runtime }
  }
}
$runtime = Find-WebView2
if (!$runtime) {
  $bootstrap = Join-Path $env:RUNNER_TEMP 'anjian-webview2-bootstrap.exe'
  Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrap
  $installation = Start-Process -FilePath $bootstrap -ArgumentList '/silent', '/install' -PassThru -Wait
  $runtime = Find-WebView2
  if (!$runtime) { throw "WebView2 runtime unavailable after bootstrap (exit $($installation.ExitCode))" }
}
Write-Output "WebView2 runtime ready: $($runtime.VersionInfo.FileVersion)"
