$ErrorActionPreference = 'Stop'
$serverPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'production-server.cjs'))
$backendPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\backend\server.cjs'))
$expectedPaths = @($serverPath, $backendPath)
$nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
foreach ($process in $nodeProcesses) {
    $command = $process.CommandLine
    if (-not $command) { continue }
    $matchesTarget = $false
    foreach ($expected in $expectedPaths) {
        $quoted = '"' + $expected + '"'
        $normalized = $command.Replace('/', '\').Trim()
        if ($normalized.EndsWith($quoted, [System.StringComparison]::OrdinalIgnoreCase) -or $normalized.EndsWith(' ' + $expected, [System.StringComparison]::OrdinalIgnoreCase)) {
            $matchesTarget = $true
        }
    }
    if ($matchesTarget) {
        Write-Output "Restarting only the matching workspace preview server: $($process.ProcessId)"
        Stop-Process -Id $process.ProcessId -ErrorAction Stop
    }
}
Start-Sleep -Milliseconds 400
& (Join-Path $PSScriptRoot 'start-production.ps1')
