param([string]$Executable, [string]$TaskDirectory)
$ErrorActionPreference = 'Stop'
$taskProcess = Start-Process -FilePath $Executable -WorkingDirectory $TaskDirectory -WindowStyle Hidden -PassThru
$taskProcess.Id
