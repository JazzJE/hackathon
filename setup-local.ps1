# Installs the local vision runtime and model. No API key or account required.
$ErrorActionPreference = 'Stop'
$ollamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
if (!(Test-Path -LiteralPath $ollamaPath)) {
    & winget install --id Ollama.Ollama --exact --source winget --scope user --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Ollama. Install it from https://ollama.com/download/windows then run this script again.' }
}
if (!(Test-Path -LiteralPath $ollamaPath)) { throw 'Ollama was not found in its standard installation folder.' }
try {
    $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2
} catch {
    Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden
    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2; $ready = $true; break } catch {}
    }
    if (!$ready) { throw 'Ollama did not start. Open Ollama from the Start menu and try again.' }
}
& $ollamaPath pull gemma3:4b
if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Run this script again to resume.' }
Write-Host 'Local AI is ready. Start Doodle Do, draw, and click Make it happen. No API key needed.'
