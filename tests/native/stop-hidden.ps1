param([int]$TaskPid, [string]$ExpectedExecutable)
$ErrorActionPreference = 'Stop'
$taskProcess = Get-Process -Id $TaskPid -ErrorAction SilentlyContinue
if ($taskProcess) {
 $expectedPath = (Resolve-Path -LiteralPath $ExpectedExecutable).Path
 if ($taskProcess.Path -ne $expectedPath) { throw 'Refusing to stop a process not owned by this test' }
 $taskProcess.CloseMainWindow() | Out-Null
 if (-not $taskProcess.WaitForExit(10000)) { Stop-Process -Id $TaskPid -Force }
}
