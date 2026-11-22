param([int]$TaskPid, [string]$ExpectedExecutable, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$process = Get-Process -Id $TaskPid -ErrorAction SilentlyContinue
if (!$process) { Write-Output 'Owned process has exited'; exit 0 }
if ($process.Path -ne [IO.Path]::GetFullPath($ExpectedExecutable)) { throw 'Startup inspection target mismatch' }
$all = @(Get-CimInstance Win32_Process)
$owned = [Collections.Generic.HashSet[int]]::new()
[void]$owned.Add($TaskPid)
do {
  $previous = $owned.Count
  foreach ($item in $all) {
    if ($owned.Contains([int]$item.ParentProcessId)) { [void]$owned.Add([int]$item.ProcessId) }
  }
} while ($owned.Count -ne $previous)
$children = @($all | Where-Object { $owned.Contains([int]$_.ProcessId) } |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $owned.Contains([int]$_.OwningProcess) } |
  Select-Object LocalAddress, LocalPort, OwningProcess)
@{ processes = $children; listeners = $listeners; mainWindow = $process.MainWindowTitle } |
  ConvertTo-Json -Depth 5 | Set-Content (Join-Path $OutputDirectory 'startup-processes.json')
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
  $window = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
  $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
  $controls = @($elements | ForEach-Object {
    @{ name = $_.Current.Name; kind = $_.Current.ControlType.ProgrammaticName; enabled = $_.Current.IsEnabled }
  })
  $controls | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $OutputDirectory 'startup-accessibility.json')
}
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class StartupWindow {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
}
'@
if ($process.MainWindowHandle -ne [IntPtr]::Zero) {
  $rect = New-Object StartupWindow+Rect
  [void][StartupWindow]::GetWindowRect($process.MainWindowHandle, [ref]$rect)
  $bitmap = New-Object Drawing.Bitmap (($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $dc = $graphics.GetHdc()
  try { [void][StartupWindow]::PrintWindow($process.MainWindowHandle, $dc, 2) }
  finally { $graphics.ReleaseHdc($dc); $graphics.Dispose() }
  $bitmap.Save((Join-Path $OutputDirectory 'startup-window.png'), [Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}
