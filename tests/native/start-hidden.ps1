param([string]$Executable, [string]$TaskDirectory, [string]$LogPrefix)
$ErrorActionPreference = 'Stop'
$options = @{}
if ($LogPrefix) {
  if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($LogPrefix)) -ne [IO.Path]::GetFullPath($TaskDirectory)) {
    throw 'Startup logs must stay inside the isolated task directory'
  }
  $options.RedirectStandardOutput = "$LogPrefix.stdout.log"
  $options.RedirectStandardError = "$LogPrefix.stderr.log"
}
$taskProcess = Start-Process -FilePath $Executable -WorkingDirectory $TaskDirectory -WindowStyle Hidden -PassThru @options
$taskProcess.Id
