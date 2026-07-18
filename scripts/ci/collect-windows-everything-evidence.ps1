[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path $env:RUNNER_TEMP 'tuff-everything-evidence'),
  [ValidateRange(1, 10000)]
  [int]$SampleCount = 200
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$requiredEnvironment = @(
  'TUFF_EVERYTHING_EXE',
  'TUFF_EVERYTHING_CLI',
  'TUFF_EVERYTHING_MARKER',
  'TUFF_EVERYTHING_PID',
  'TALEX_EVERYTHING_DLL_PATH'
)
foreach ($name in $requiredEnvironment) {
  if (-not [Environment]::GetEnvironmentVariable($name)) {
    throw "Missing required environment variable: $name"
  }
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$selfCheckScript = Join-Path $PWD 'packages/tuff-native/scripts/everything-selfcheck.js'
$sdkReadyPath = Join-Path $OutputDirectory 'everything-sdk-ready.json'
$sdkEvidencePath = Join-Path $OutputDirectory 'everything-sdk.json'
$cliEvidencePath = Join-Path $OutputDirectory 'everything-cli.json'
$unavailableSdkPath = Join-Path $OutputDirectory 'everything-unavailable-sdk.json'
$unavailableEvidencePath = Join-Path $OutputDirectory 'everything-unavailable.json'

function Get-Percentile {
  param(
    [Parameter(Mandatory = $true)] [long[]]$Values,
    [Parameter(Mandatory = $true)] [double]$Percentile
  )
  if ($Values.Count -eq 0) { return $null }
  $sorted = @($Values | Sort-Object)
  $index = [Math]::Max(0, [Math]::Ceiling($Percentile * $sorted.Count) - 1)
  return $sorted[[Math]::Min($index, $sorted.Count - 1)]
}

function Get-PerformanceSummary {
  param(
    [Parameter(Mandatory = $true)] [long[]]$Durations,
    [Parameter(Mandatory = $true)] [ValidateSet('sdk-napi', 'cli')] [string]$Backend
  )
  $sdkCount = if ($Backend -eq 'sdk-napi') { $Durations.Count } else { 0 }
  $cliCount = if ($Backend -eq 'cli') { $Durations.Count } else { 0 }
  return [ordered]@{
    sampleCount = $Durations.Count
    durationSampleCount = $Durations.Count
    p50Ms = Get-Percentile -Values $Durations -Percentile 0.5
    p95Ms = Get-Percentile -Values $Durations -Percentile 0.95
    maxMs = if ($Durations.Count -gt 0) { ($Durations | Measure-Object -Maximum).Maximum } else { $null }
    successCount = $Durations.Count
    timeoutCount = 0
    errorCount = 0
    abortedCount = 0
    sdkCount = $sdkCount
    cliCount = $cliCount
    fallbackCount = if ($Backend -eq 'cli') { $Durations.Count } else { 0 }
    fallbackRatio = if ($Backend -eq 'cli' -and $Durations.Count -gt 0) { 1 } else { 0 }
  }
}

$sdkReady = $false
for ($attempt = 1; $attempt -le 120; $attempt += 1) {
  & node $selfCheckScript --query $env:TUFF_EVERYTHING_MARKER --max 20 --samples 1 --require-results --output $sdkReadyPath | Out-Host
  if ($LASTEXITCODE -eq 0) {
    $readyEvidence = Get-Content -Path $sdkReadyPath -Raw | ConvertFrom-Json
    if ($readyEvidence.ok -eq $true -and $readyEvidence.resultCount -gt 0 -and $readyEvidence.version) {
      $sdkReady = $true
      break
    }
  }
  Start-Sleep -Seconds 1
}
if (-not $sdkReady) {
  throw 'Everything SDK did not become ready with a non-empty marker result within 120 seconds.'
}

& node $selfCheckScript --query $env:TUFF_EVERYTHING_MARKER --max 20 --samples $SampleCount --require-results --output $sdkEvidencePath | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw 'Everything SDK performance self-check failed.'
}
$sdkEvidence = Get-Content -Path $sdkEvidencePath -Raw | ConvertFrom-Json
if ($sdkEvidence.performance.sampleCount -ne $SampleCount -or -not $sdkEvidence.version) {
  throw 'Everything SDK evidence is missing the required version or sample count.'
}
if ($sdkEvidence.performance.p95Ms -gt 50 -or $sdkEvidence.performance.maxMs -gt 80) {
  throw "Everything SDK performance gate failed: p95=$($sdkEvidence.performance.p95Ms)ms, max=$($sdkEvidence.performance.maxMs)ms."
}

$cliVersionOutput = @(& $env:TUFF_EVERYTHING_CLI -version 2>&1)
if ($LASTEXITCODE -ne 0) {
  throw 'Everything CLI version probe failed.'
}
$cliVersion = ($cliVersionOutput -join ' ').Trim()
if (-not $cliVersion) {
  throw 'Everything CLI version probe returned an empty version.'
}

[long[]]$cliDurations = @()
$cliNonEmptySampleCount = 0
for ($index = 0; $index -lt $SampleCount; $index += 1) {
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $cliOutput = @(& $env:TUFF_EVERYTHING_CLI -n 20 $env:TUFF_EVERYTHING_MARKER 2>&1)
  $cliExitCode = $LASTEXITCODE
  $stopwatch.Stop()
  if ($cliExitCode -ne 0) {
    throw "Everything CLI search failed at sample $($index + 1) with exit code $cliExitCode."
  }
  $cliDurations += [long]$stopwatch.ElapsedMilliseconds
  if ($cliOutput.Count -gt 0) { $cliNonEmptySampleCount += 1 }
}
if ($cliNonEmptySampleCount -eq 0) {
  throw 'Everything CLI returned no marker result for every sample.'
}

[ordered]@{
  schema = 'everything-cli-selfcheck/v1'
  ok = $true
  backend = 'cli'
  platform = 'win32'
  version = $cliVersion
  nonEmptySampleCount = $cliNonEmptySampleCount
  queryIncluded = $false
  resultPathsIncluded = $false
  performance = Get-PerformanceSummary -Durations $cliDurations -Backend 'cli'
  errorCode = $null
} | ConvertTo-Json -Depth 5 | Set-Content -Path $cliEvidencePath -Encoding UTF8

$clientExit = Start-Process -FilePath $env:TUFF_EVERYTHING_EXE -ArgumentList '-exit' -Wait -PassThru
if ($clientExit.ExitCode -ne 0) {
  throw "Everything client shutdown failed with exit code $($clientExit.ExitCode)."
}
$clientPid = [int]$env:TUFF_EVERYTHING_PID
$clientProcess = Get-Process -Id $clientPid -ErrorAction SilentlyContinue
if ($clientProcess) {
  Wait-Process -Id $clientPid -Timeout 15
}
if (Get-Process -Id $clientPid -ErrorAction SilentlyContinue) {
  throw "Everything client process $clientPid did not stop."
}

$serviceUninstall = Start-Process -FilePath $env:TUFF_EVERYTHING_EXE -ArgumentList '-uninstall-service' -Wait -PassThru
if ($serviceUninstall.ExitCode -ne 0) {
  throw "Everything service removal failed with exit code $($serviceUninstall.ExitCode)."
}
$everythingService = $null
for ($attempt = 1; $attempt -le 15; $attempt += 1) {
  $everythingService = Get-Service -Name 'Everything' -ErrorAction SilentlyContinue
  if (-not $everythingService -or $everythingService.Status -eq 'Stopped') { break }
  Start-Sleep -Seconds 1
}
if ($everythingService -and $everythingService.Status -ne 'Stopped') {
  throw "Everything service remained $($everythingService.Status) after removal."
}

& node $selfCheckScript --query $env:TUFF_EVERYTHING_MARKER --max 1 --samples 1 --require-results --output $unavailableSdkPath | Out-Host
$sdkUnavailableExitCode = $LASTEXITCODE
$cliUnavailableOutput = @(& $env:TUFF_EVERYTHING_CLI -n 1 $env:TUFF_EVERYTHING_MARKER 2>&1)
$cliUnavailableExitCode = $LASTEXITCODE

if ($sdkUnavailableExitCode -eq 0) {
  throw 'Everything SDK unexpectedly remained available after the client and service were stopped.'
}
$unavailableSdkEvidence = Get-Content -Path $unavailableSdkPath -Raw | ConvertFrom-Json
if (
  $unavailableSdkEvidence.errorCode -ne 'ERR_EVERYTHING_QUERY_FAILED' -or
  $unavailableSdkEvidence.backendErrorCode -ne 2
) {
  throw "Everything SDK unavailable probe returned the wrong error: code=$($unavailableSdkEvidence.errorCode), backend=$($unavailableSdkEvidence.backendErrorCode)."
}
if ($cliUnavailableExitCode -notin @(7, 8)) {
  throw "Everything CLI unavailable probe returned unexpected exit code $cliUnavailableExitCode."
}

[ordered]@{
  schema = 'everything-unavailable-selfcheck/v1'
  ok = $true
  backend = 'unavailable'
  platform = 'win32'
  clientStopped = $true
  serviceStopped = $true
  sdkUnavailable = $true
  cliUnavailable = $true
  queryIncluded = $false
  resultPathsIncluded = $false
  sdkErrorCode = $unavailableSdkEvidence.errorCode
  sdkBackendErrorCode = $unavailableSdkEvidence.backendErrorCode
  cliErrorCode = $cliUnavailableExitCode
} | ConvertTo-Json -Depth 4 | Set-Content -Path $unavailableEvidencePath -Encoding UTF8

[ordered]@{
  schema = 'windows-everything-production-evidence/v1'
  ok = $true
  sampleCount = $SampleCount
  states = @('sdk-napi', 'cli', 'unavailable')
  queryIncluded = $false
  resultPathsIncluded = $false
} | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $OutputDirectory 'summary.json') -Encoding UTF8
