$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) {
    $previewNode = $nodeCommand.Source
} else {
    $previewNode = Get-Process -Name node -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty Path -Unique |
        Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
        Select-Object -First 1
}
if (-not $previewNode) {
    throw 'Node.js is required. Install Node.js or run this while Codex is open.'
}
$previewScript = Join-Path $PSScriptRoot 'preview-server.cjs'
$previewProcess = Start-Process -FilePath $previewNode -ArgumentList @('"' + $previewScript + '"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'preview-server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'preview-server.error.log') -PassThru
Write-Output "Started preview process $($previewProcess.Id) at http://127.0.0.1:8000/"
