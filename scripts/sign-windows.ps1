param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = "Stop"
$target = (Resolve-Path -LiteralPath $File).Path
foreach ($name in @("AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID")) {
  if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Missing signing credential: $name" }
}
$signer = (Get-Command artifact-signing-cli -ErrorAction Stop).Source
Write-Host "Signing $target"
& $signer -e "https://eus.codesigning.azure.net" -a "ica-code-signing" -c "ica-control-production" -d "ICA Unified" $target 2>&1 | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw "Artifact Signing failed with exit code $LASTEXITCODE for $target" }
$signature = Get-AuthenticodeSignature -LiteralPath $target
if ($signature.Status -ne "Valid") { throw "Invalid signature for ${target}: $($signature.Status)" }
