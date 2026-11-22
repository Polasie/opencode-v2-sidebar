$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$target = Join-Path $env:USERPROFILE '.vscode\extensions\Polasie.opencode-v2-sidebar-0.3.0'

if (Test-Path $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force

"Installed to: $target"
"Next: in VS Code run 'Developer: Reload Window' (Ctrl+Shift+P)."
