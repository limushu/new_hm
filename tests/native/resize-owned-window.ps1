param([int]$TaskPid, [string]$ExpectedExecutable, [int]$Width, [int]$Height)
$ErrorActionPreference = 'Stop'
$expected = [IO.Path]::GetFullPath($ExpectedExecutable)
$process = Get-Process -Id $TaskPid
if (![string]::Equals($process.Path, $expected, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Resize target is not the owned test executable'
}
if ($Width -lt 760 -or $Height -lt 600) { throw 'Use a supported desktop window size' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OwnedLayoutWindow {
  public delegate bool Visitor(IntPtr window, IntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visitor visitor, IntPtr extra);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
'@
# Match the app's per-monitor awareness; otherwise Windows virtualizes the helper's coordinates.
[void][OwnedLayoutWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
$script:ownedWindow = [IntPtr]::Zero
[OwnedLayoutWindow]::EnumWindows({
  param($window, $extra)
  [uint32]$windowPid = 0
  [void][OwnedLayoutWindow]::GetWindowThreadProcessId($window, [ref]$windowPid)
  if ($windowPid -eq $TaskPid -and [OwnedLayoutWindow]::SendMessage($window, 0x007F, [IntPtr]1, [IntPtr]::Zero) -ne [IntPtr]::Zero) {
    $script:ownedWindow = $window
    return $false
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
if ($script:ownedWindow -eq [IntPtr]::Zero) { throw 'Owned native window missing' }
$client = New-Object OwnedLayoutWindow+Rect
$outer = New-Object OwnedLayoutWindow+Rect
[void][OwnedLayoutWindow]::GetClientRect($script:ownedWindow, [ref]$client)
[void][OwnedLayoutWindow]::GetWindowRect($script:ownedWindow, [ref]$outer)
$scale = [OwnedLayoutWindow]::GetDpiForWindow($script:ownedWindow) / 96.0
$targetWidth = [int]($Width * $scale) + $outer.Right - $outer.Left - $client.Right
$targetHeight = [int]($Height * $scale) + $outer.Bottom - $outer.Top - $client.Bottom
# No move, z-order change, activation or show flag; touch only our isolated window.
if (![OwnedLayoutWindow]::SetWindowPos($script:ownedWindow, [IntPtr]::Zero, 0, 0, $targetWidth, $targetHeight, 0x0016)) {
  throw 'Could not resize owned native window'
}
Write-Output "Owned window resized to requested logical client size ${Width}x${Height}."
