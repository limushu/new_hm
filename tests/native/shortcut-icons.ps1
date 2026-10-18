$ErrorActionPreference = 'Stop'
$workspace = (Get-Location).Path
$testRoot = Join-Path $workspace ('.local/shortcut-icons-' + [guid]::NewGuid().ToString('N'))
if ($testRoot -notlike "$workspace\*" -or $testRoot.IndexOfAny('"$'.ToCharArray()) -ge 0) { throw 'Invalid owned test directory' }
[IO.Directory]::CreateDirectory((Join-Path $testRoot 'branding')) | Out-Null
[IO.File]::WriteAllBytes((Join-Path $testRoot 'hm-app.exe'), [byte[]]@())
[IO.File]::WriteAllBytes((Join-Path $testRoot 'other.exe'), [byte[]]@())
Copy-Item -LiteralPath 'src-tauri/icons/icon.ico' -Destination (Join-Path $testRoot 'branding/hm-mark.ico')
Copy-Item -LiteralPath 'src-tauri/icons/icon.ico' -Destination (Join-Path $testRoot 'old.ico')
$shell = New-Object -ComObject WScript.Shell
foreach ($entry in @(@('owned','hm-app.exe'),@('unrelated','other.exe'))) {
  $link = $shell.CreateShortcut((Join-Path $testRoot ($entry[0] + '.lnk')))
  $link.TargetPath = Join-Path $testRoot $entry[1]
  $link.Arguments = '--preserve-arguments'
  $link.WorkingDirectory = $testRoot
  $link.Description = 'Preserve existing user metadata'
  $link.IconLocation = (Join-Path $testRoot 'old.ico') + ',0'
  $link.Save()
}
$template = Get-Content -LiteralPath 'src-tauri/windows/installer.nsi' -Raw
$macro = [regex]::Match($template, '(?s)!macro RefreshOwnedShortcutIcon SHORTCUT\r?\n.*?!macroend').Value
if (!$macro) { throw 'Installer icon macro missing' }
$testSource = @'
Unicode true
RequestExecutionLevel user
SilentInstall silent
!include LogicLib.nsh
!include "{{UTILS}}"
!include "Win\COM.nsh"
!define MAINBINARYNAME "hm-app"
OutFile "{{ROOT}}\shortcut-check.exe"
{{MACRO}}
Section
  StrCpy $INSTDIR "{{ROOT}}"
  !insertmacro RefreshOwnedShortcutIcon "{{ROOT}}\owned.lnk"
  !insertmacro RefreshOwnedShortcutIcon "{{ROOT}}\unrelated.lnk"
  !insertmacro RefreshOwnedShortcutIcon "{{ROOT}}\missing.lnk"
SectionEnd
'@
$testSource = $testSource.Replace('{{ROOT}}', $testRoot).Replace('{{UTILS}}', (Join-Path $workspace 'target/release/nsis/x64/utils.nsh')).Replace('{{MACRO}}', $macro)
$scriptPath = Join-Path $testRoot 'shortcut-check.nsi'
[IO.File]::WriteAllText($scriptPath, $testSource, [Text.UTF8Encoding]::new($false))
& (Join-Path $workspace 'target/.tauri/NSIS/makensis.exe') /V2 $scriptPath
if ($LASTEXITCODE -ne 0) { throw 'Shortcut test compilation failed' }
$testProcess = Start-Process -FilePath (Join-Path $testRoot 'shortcut-check.exe') -WorkingDirectory $testRoot -WindowStyle Hidden -Wait -PassThru
if ($testProcess.ExitCode -ne 0) { throw 'Shortcut test runtime failed' }
$owned = $shell.CreateShortcut((Join-Path $testRoot 'owned.lnk'))
$unrelated = $shell.CreateShortcut((Join-Path $testRoot 'unrelated.lnk'))
if ($owned.IconLocation -notlike '*branding\hm-mark.ico,0') { throw "Owned icon was not refreshed: $($owned.IconLocation)" }
if ($owned.Arguments -ne '--preserve-arguments' -or $owned.WorkingDirectory -ne $testRoot -or $owned.Description -ne 'Preserve existing user metadata') { throw 'Shortcut metadata was lost' }
if ($unrelated.IconLocation -ne ((Join-Path $testRoot 'old.ico') + ',0')) { throw 'Unrelated shortcut was modified' }
if (Test-Path -LiteralPath (Join-Path $testRoot 'missing.lnk')) { throw 'A missing shortcut was unexpectedly created' }
Write-Output 'PASS: owned shortcut icon refreshed; arguments, working directory and description retained; unrelated and missing shortcuts untouched. No desktop or registry installation performed.'
