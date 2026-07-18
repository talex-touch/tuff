[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path $env:RUNNER_TEMP 'tuff-everything-runtime'),
  [string]$FixtureDirectory = (Join-Path $env:RUNNER_TEMP 'tuff-everything-fixture')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $env:GITHUB_ENV) {
  throw 'GITHUB_ENV is required so later workflow steps can consume the runtime paths.'
}

$resourcesJson = & node -e "process.stdout.write(JSON.stringify(require('./packages/tuff-native/everything-resources').getEverythingInstallResources('x64')))"
if ($LASTEXITCODE -ne 0) {
  throw 'Failed to read the canonical Everything install resource manifest.'
}

$resources = $resourcesJson | ConvertFrom-Json
Remove-Item -Path $OutputDirectory -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $FixtureDirectory | Out-Null

foreach ($resource in $resources) {
  $archivePath = Join-Path $OutputDirectory $resource.filename
  $extractPath = Join-Path $OutputDirectory $resource.type
  Invoke-WebRequest -Uri $resource.url -OutFile $archivePath

  $actualHash = (Get-FileHash -Path $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $resource.sha256) {
    throw "Everything resource checksum mismatch for $($resource.filename): expected=$($resource.sha256), actual=$actualHash"
  }

  New-Item -ItemType Directory -Force -Path $extractPath | Out-Null
  Expand-Archive -Path $archivePath -DestinationPath $extractPath -Force
}

$everythingExe = Get-ChildItem -Path (Join-Path $OutputDirectory 'everything') -Filter 'Everything.exe' -Recurse |
  Select-Object -First 1 -ExpandProperty FullName
$everythingCli = Get-ChildItem -Path (Join-Path $OutputDirectory 'cli') -Filter 'es.exe' -Recurse |
  Select-Object -First 1 -ExpandProperty FullName
$everythingSdkDll = Get-ChildItem -Path (Join-Path $OutputDirectory 'sdk') -Filter 'Everything64.dll' -Recurse |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $everythingExe -or -not (Test-Path $everythingExe)) {
  throw 'Everything.exe is missing after verified archive extraction.'
}
if (-not $everythingCli -or -not (Test-Path $everythingCli)) {
  throw 'es.exe is missing after verified archive extraction.'
}
if (-not $everythingSdkDll -or -not (Test-Path $everythingSdkDll)) {
  throw 'Everything64.dll is missing after verified SDK archive extraction.'
}

Unblock-File -LiteralPath $everythingExe
Unblock-File -LiteralPath $everythingCli
Unblock-File -LiteralPath $everythingSdkDll

$markerName = 'tuff-everything-ci-marker.txt'
Set-Content -Path (Join-Path $FixtureDirectory $markerName) -Value 'Tuff Everything Windows production gate fixture.' -Encoding UTF8

$configPath = Join-Path (Split-Path -Parent $everythingExe) 'Everything.ini'
@(
  '[Everything]',
  'app_data=0',
  'run_as_admin=0',
  'allow_multiple_instances=0',
  'run_in_background=1',
  'show_tray_icon=0',
  'check_for_updates_on_startup=0',
  'ipc=1',
  'auto_include_fixed_volumes=0',
  'auto_include_removable_volumes=0',
  'auto_include_fixed_refs_volumes=0',
  'auto_include_removable_refs_volumes=0',
  "folders=$FixtureDirectory",
  'folder_monitor_changes=1',
  'folder_buffer_size_list=65536',
  'folder_rescan_if_full_list=1',
  'folder_update_types=0',
  'folder_update_days=0',
  'folder_update_ats=0',
  'folder_update_intervals=0',
  'folder_update_interval_types=0',
  'index_size=1',
  'index_date_modified=1',
  'index_date_created=1',
  'fast_path_sort=1',
  ''
) | Set-Content -Path $configPath -Encoding UTF8

$everythingProcess = Start-Process -FilePath $everythingExe -ArgumentList @(
  '-config',
  $configPath,
  '-startup'
) -PassThru
Start-Sleep -Seconds 2
$everythingProcess.Refresh()
if ($everythingProcess.HasExited) {
  throw "Everything portable client exited during startup with code $($everythingProcess.ExitCode)."
}

@(
  "TUFF_EVERYTHING_EXE=$everythingExe",
  "TUFF_EVERYTHING_CLI=$everythingCli",
  "TALEX_EVERYTHING_DLL_PATH=$everythingSdkDll",
  "TUFF_EVERYTHING_FIXTURE=$FixtureDirectory",
  "TUFF_EVERYTHING_MARKER=$markerName",
  "TUFF_EVERYTHING_PID=$($everythingProcess.Id)"
) | Add-Content -Path $env:GITHUB_ENV

[ordered]@{
  schema = 'windows-everything-ci-setup/v1'
  ready = $true
  architecture = 'x64'
  marker = $markerName
  resourceCount = $resources.Count
} | ConvertTo-Json | Set-Content -Path (Join-Path $OutputDirectory 'setup-evidence.json') -Encoding UTF8
