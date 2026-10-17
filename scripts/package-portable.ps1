param(
    [Parameter(Mandatory = $true)][string]$SourceFolder,
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$binary = Get-ChildItem -LiteralPath $SourceFolder -Filter '*.exe' -File
if ($binary.Count -ne 1 -or $binary.VersionInfo.ProductVersion -ne $ExpectedVersion) {
    throw 'Binary version mismatch. Rebuild the application before packaging.'
}
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $SourceFolder,
    $ZipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $true
)
