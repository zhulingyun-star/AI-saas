$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $PSScriptRoot 'production-server.cjs'
$previewUrl = 'http://127.0.0.1:8767/'
$stdoutPath = Join-Path $PSScriptRoot 'production-server.stdout.log'
$stderrPath = Join-Path $PSScriptRoot 'production-server.stderr.log'

function Test-ProductionPreview {
    try {
        $response = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            if ($response.Content -notmatch 'collaboration\.js' -or $response.Content -notmatch 'production-flow\.js') {
                throw 'Port 8767 is occupied by another website. No process was stopped.'
            }
            try {
                $health = Invoke-WebRequest -Uri ($previewUrl + 'api/health') -UseBasicParsing -TimeoutSec 2
            } catch {
                throw 'Port 8767 is running an older or unhealthy preview. Use the workspace restart launcher.'
            }
            if (($health.Content | ConvertFrom-Json).apiVersion -ne 1) {
                throw 'Port 8767 is running an older preview. Use the workspace restart launcher.'
            }
            return $true
        }
    } catch {
        if ($_.Exception.Message -like 'Port 8767*') {
            throw
        }
    }
    return $false
}

if (Test-ProductionPreview) {
    Write-Output "Website is already running: ${previewUrl}#projects"
    exit 0
}

$nodePath = (Get-Command node -ErrorAction Stop).Source
$serverProcess = Start-Process -FilePath $nodePath `
    -ArgumentList ('"' + $serverPath + '"') `
    -WorkingDirectory $workspaceRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 300
    if (Test-ProductionPreview) {
        Write-Output "Website is ready: ${previewUrl}#projects"
        Write-Output "Server PID: $($serverProcess.Id)"
        exit 0
    }
    $serverProcess.Refresh()
    if ($serverProcess.HasExited) {
        $diagnostic = Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue
        throw "The preview server exited. $diagnostic"
    }
}

throw "The preview server did not become ready. Check $stderrPath"
