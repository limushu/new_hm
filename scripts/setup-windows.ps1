param([string]$InstallPath = 'D:\DevTools\VSBuildTools')
$ErrorActionPreference = 'Stop'
$taskPrincipal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw '安装 Microsoft C++ 工具需要管理员权限。请在管理员 PowerShell 中重新运行本脚本。'
}
$taskWorkspace = Split-Path -Parent $PSScriptRoot
$taskDownload = Join-Path $taskWorkspace '.local\installers'
New-Item -ItemType Directory -Path $taskDownload -Force | Out-Null
Start-Transcript -LiteralPath (Join-Path $taskDownload 'setup-transcript.log') -Append | Out-Null
$taskInstaller = Join-Path $taskDownload 'vs_BuildTools.exe'
Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_BuildTools.exe' -OutFile $taskInstaller
$taskSignature = Get-AuthenticodeSignature -LiteralPath $taskInstaller
if ($taskSignature.Status -ne 'Valid' -or $taskSignature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw '安装器签名未通过 Microsoft 身份检查，已停止。'
}
$taskConfig = Join-Path $PSScriptRoot 'windows-build-tools.vsconfig'
$taskArguments = @('--quiet','--wait','--norestart','--nocache','--installPath',('"{0}"' -f $InstallPath),'--config',('"{0}"' -f $taskConfig))
$taskProcess = Start-Process -FilePath $taskInstaller -ArgumentList $taskArguments -WindowStyle Hidden -PassThru -Wait
if ($taskProcess.ExitCode -notin @(0,3010)) { throw "Build Tools 安装失败，退出码：$($taskProcess.ExitCode)" }
Write-Output '安装完成。请重新打开开发终端，运行 npm run doctor。若退出码为 3010，请在方便时重启系统。'
Stop-Transcript | Out-Null
