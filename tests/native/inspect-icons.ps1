param([int]$TaskPid, [string]$ExpectedExecutable, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$expected = [IO.Path]::GetFullPath($ExpectedExecutable)
$process = Get-Process -Id $TaskPid
if (![string]::Equals($process.Path, $expected, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Icon inspection target is not the owned test executable'
}
$output = [IO.Path]::GetFullPath($OutputDirectory)
if (![string]::Equals([IO.Path]::GetDirectoryName($expected), $output, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Icon inspection output must stay in the owned test directory'
}
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OwnedIconWindow {
  public delegate bool Visitor(IntPtr window, IntPtr extra);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visitor visitor, IntPtr extra);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
$resource = [Drawing.Icon]::ExtractAssociatedIcon($expected)
if ($null -eq $resource) { throw 'Executable resource icon missing' }
$bitmap = $resource.ToBitmap()
$bitmap.Save((Join-Path $output 'executable-icon.png'), [Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
$resource.Dispose()
$script:ownedIcon = [IntPtr]::Zero
[OwnedIconWindow]::EnumWindows({
  param($window, $extra)
  [uint32]$windowPid = 0
  [void][OwnedIconWindow]::GetWindowThreadProcessId($window, [ref]$windowPid)
  if ($windowPid -eq $TaskPid) {
    $candidate = [OwnedIconWindow]::SendMessage($window, 0x007F, [IntPtr]1, [IntPtr]::Zero)
    if ($candidate -ne [IntPtr]::Zero) { $script:ownedIcon = $candidate; $script:ownedWindow = $window; return $false }
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
if ($script:ownedIcon -eq [IntPtr]::Zero) { throw 'Owned native window icon missing' }
$windowIcon = [Drawing.Icon]::FromHandle($script:ownedIcon).Clone()
$windowBitmap = $windowIcon.ToBitmap()
$windowBitmap.Save((Join-Path $output 'window-icon.png'), [Drawing.Imaging.ImageFormat]::Png)
$windowBitmap.Dispose()
$windowIcon.Dispose()
$smallHandle = [OwnedIconWindow]::SendMessage($script:ownedWindow, 0x007F, [IntPtr]::Zero, [IntPtr]::Zero)
if ($smallHandle -eq [IntPtr]::Zero) { throw 'Owned native small window icon missing' }
$smallIcon = [Drawing.Icon]::FromHandle($smallHandle).Clone()
$smallBitmap = $smallIcon.ToBitmap()
$smallBitmap.Save((Join-Path $output 'window-small-icon.png'), [Drawing.Imaging.ImageFormat]::Png)
$smallBitmap.Dispose()
$smallIcon.Dispose()
Write-Output 'Executable resource and native window icons found in owned test process.'
