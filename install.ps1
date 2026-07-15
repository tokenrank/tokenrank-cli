$ErrorActionPreference = "Stop"
$global:LASTEXITCODE = 0

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "TokenRank requires Node.js. Install Node.js first: https://nodejs.org/"
  exit 1
}

$releaseBase = if ($env:TOKENRANK_RELEASE_BASE_URL) {
  $env:TOKENRANK_RELEASE_BASE_URL.TrimEnd('/')
} else {
  "https://github.com/solosaas/tokenrank-cli/releases/latest/download"
}
$installDir = if ($env:TOKENRANK_HOME) { $env:TOKENRANK_HOME } else { Join-Path $env:USERPROFILE ".tokenrank" }
$cmdPath = Join-Path $installDir "tokenrank.cmd"

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Invoke-WebRequest -Uri "$releaseBase/tokenrank.mjs" -OutFile (Join-Path $installDir "tokenrank.mjs")
Invoke-WebRequest -Uri "$releaseBase/package.json" -OutFile (Join-Path $installDir "package.json")

$escapedCliPath = (Join-Path $installDir "tokenrank.mjs").Replace('"', '""')
$cmdContent = "@echo off`r`nnode `"$escapedCliPath`" %*`r`n"
Set-Content -Path $cmdPath -Value $cmdContent -Encoding ASCII

$normalizedInstallDir = $installDir.Trim().TrimEnd('\')
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$normalizedUserPathEntries = @(
  $userPath -split ";" |
    ForEach-Object { [Environment]::ExpandEnvironmentVariables($_).Trim().TrimEnd('\') } |
    Where-Object { $_ }
)
if ($normalizedUserPathEntries -notcontains $normalizedInstallDir) {
  $updatedUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) {
    $installDir
  } else {
    "$($userPath.TrimEnd(';'));$installDir"
  }
  [Environment]::SetEnvironmentVariable("Path", $updatedUserPath, "User")
}

$processPath = $env:Path
$normalizedProcessPathEntries = @(
  $processPath -split ";" |
    ForEach-Object { $_.Trim().TrimEnd('\') } |
    Where-Object { $_ }
)
if ($normalizedProcessPathEntries -notcontains $normalizedInstallDir) {
  if ([string]::IsNullOrWhiteSpace($processPath)) {
    $env:Path = $installDir
  } else {
    $env:Path = "$processPath;$installDir"
  }
}

Write-Host "TokenRank collector installed: $cmdPath"
Write-Host "TokenRank command available: tokenrank"

if ($env:TOKENRANK_WEBHOOK_URL) {
  $previousTokenrankNoLogo = $env:TOKENRANK_NO_LOGO
  $env:TOKENRANK_NO_LOGO = "1"
  & $cmdPath connect $env:TOKENRANK_WEBHOOK_URL
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
  if ($null -eq $previousTokenrankNoLogo) { Remove-Item Env:TOKENRANK_NO_LOGO -ErrorAction SilentlyContinue } else { $env:TOKENRANK_NO_LOGO = $previousTokenrankNoLogo }
  & $cmdPath upload
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
  $env:TOKENRANK_NO_LOGO = "1"
  & $cmdPath service install
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
  if ($null -eq $previousTokenrankNoLogo) { Remove-Item Env:TOKENRANK_NO_LOGO -ErrorAction SilentlyContinue } else { $env:TOKENRANK_NO_LOGO = $previousTokenrankNoLogo }
} else {
  & $cmdPath tools
  if ($LASTEXITCODE) { exit $LASTEXITCODE }
}
