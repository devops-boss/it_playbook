# ============================================================================
# Section 14 Acceptance Test: Automated Backup, Retention & Disaster Recovery
# Big Outsource IT Operations Playbook
# ============================================================================

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
Set-Location $projectRoot

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host " SECTION 14: BACKUP, RESTORE & DISASTER RECOVERY TESTS" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan

# Find Git Bash executable
$gitBash = "C:\Program Files\Git\bin\bash.exe"
if (-not (Test-Path $gitBash)) {
  $gitBash = (Get-Command bash -ErrorAction SilentlyContinue).Source
}
if (-not $gitBash -or -not (Test-Path $gitBash)) {
  Write-Error "Git Bash not found. Please ensure Git for Windows is installed."
  exit 1
}

# --- Step 1: Run Backup Script ----------------------------------------------
Write-Host "`n[1/6] Running scripts/backup.sh..." -ForegroundColor Yellow
$backupOutput = & $gitBash ./scripts/backup.sh
Write-Host $backupOutput

if ($LASTEXITCODE -ne 0) {
  Write-Error "Backup script failed with exit code $LASTEXITCODE"
  exit 1
}

# --- Step 2: Verify Backup Archive and Content ------------------------------
Write-Host "`n[2/6] Verifying generated backup archive..." -ForegroundColor Yellow
$latestBackup = Get-ChildItem -Path "$projectRoot\backups\backup-*.tar.gz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $latestBackup) {
  Write-Error "No backup archive found in backups directory."
  exit 1
}

$sizeKb = [math]::Round($latestBackup.Length / 1KB, 2)
Write-Host "Found archive: $($latestBackup.Name) ($sizeKb KB)" -ForegroundColor Green

if ($latestBackup.Length -lt 50KB) {
  Write-Error "Archive is suspiciously small (< 50KB): $($latestBackup.Length) bytes"
  exit 1
}

$tarContents = & $gitBash -c "tar -ztvf ./backups/$($latestBackup.Name)"
Write-Host ($tarContents -join "`n")

$tarString = $tarContents -join "`n"
$requiredEntries = @("database.dump", "database.sql", "storage.tar.gz", "config.json", "MANIFEST.txt")
foreach ($entry in $requiredEntries) {
  if ($tarString -notmatch [regex]::Escape($entry)) {
    Write-Error "Archive is missing required file: $entry"
    exit 1
  }
}
Write-Host "All required archive components present." -ForegroundColor Green

# --- Step 3: Verify Backup Logging ------------------------------------------
Write-Host "`n[3/6] Verifying backups/backup.log..." -ForegroundColor Yellow
$backupLog = "$projectRoot\backups\backup.log"
if (-not (Test-Path $backupLog)) {
  Write-Error "backups/backup.log was not created."
  exit 1
}

$recentLogs = Get-Content $backupLog -Tail 10
Write-Host ($recentLogs -join "`n")

$recentLogsString = $recentLogs -join "`n"
if ($recentLogsString -notmatch "\[SUCCESS\] Backup .* created successfully") {
  Write-Error "backup.log does not contain [SUCCESS] entry for recent backup."
  exit 1
}
Write-Host "Backup log confirmed with [SUCCESS] entry." -ForegroundColor Green

# --- Step 4: Test Retention Logic -------------------------------------------
Write-Host "`n[4/6] Testing retention purge logic..." -ForegroundColor Yellow
$mockOldFile = "$projectRoot\backups\backup-20200101-000000.tar.gz"
# Create a dummy archive and backdate its timestamp
Copy-Item $latestBackup.FullName $mockOldFile
(Get-Item $mockOldFile).LastWriteTime = (Get-Date).AddDays(-40)

Write-Host "Created mock expired backup: $(Split-Path -Leaf $mockOldFile)"
# Run backup again to trigger retention sweep
$retentionOutput = & $gitBash ./scripts/backup.sh
Write-Host $retentionOutput

if (Test-Path $mockOldFile) {
  Remove-Item -Force $mockOldFile
  Write-Error "Retention failed: expired mock backup was not pruned."
  exit 1
}
Write-Host "Retention confirmed: expired backup file was pruned." -ForegroundColor Green

# --- Step 5: Test Disaster Recovery Restore ---------------------------------
Write-Host "`n[5/6] Testing restore from archive: $($latestBackup.Name)..." -ForegroundColor Yellow
$restoreOutput = & $gitBash ./scripts/restore.sh "./backups/$($latestBackup.Name)"
Write-Host $restoreOutput

if ($LASTEXITCODE -ne 0) {
  Write-Error "Restore script failed with exit code $LASTEXITCODE"
  exit 1
}

# Verify pre-restore safety snapshot was created
$safetySnapshot = Get-ChildItem -Path "$projectRoot\backups\pre-restore-*.tar.gz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $safetySnapshot) {
  Write-Error "Safety snapshot was not created before restore."
  exit 1
}
Write-Host "Safety snapshot verified: $($safetySnapshot.Name)" -ForegroundColor Green

# Verify restore.log
$restoreLog = "$projectRoot\backups\restore.log"
if (-not (Test-Path $restoreLog)) {
  Write-Error "backups/restore.log was not created."
  exit 1
}
$recentRestoreLogs = Get-Content $restoreLog -Tail 5
$recentRestoreLogsString = $recentRestoreLogs -join "`n"
if ($recentRestoreLogsString -notmatch "\[SUCCESS\] Restore from .* successful: 26 accounts, 8 users") {
  Write-Error "restore.log does not contain expected [SUCCESS] entry."
  exit 1
}
Write-Host "Restore log confirmed with [SUCCESS] entry." -ForegroundColor Green

# --- Step 6: Verify Database Health & Integrity -----------------------------
Write-Host "`n[6/6] Running Section 14 SQL verification test..." -ForegroundColor Yellow
$sqlResult = Get-Content "$projectRoot\backend\tests\section14_test.sql" | docker compose exec -T db psql -U supabase_admin -d postgres
Write-Host ($sqlResult -join "`n")

$sqlResultString = $sqlResult -join "`n"
if ($sqlResultString -notmatch "SECTION 14 OPERATIONS & DATABASE INTEGRITY ACCEPTANCE SUITE PASSED SUCCESSFULLY") {
  Write-Error "Section 14 SQL acceptance test failed."
  exit 1
}

Write-Host "`n===============================================================" -ForegroundColor Green
Write-Host " SECTION 14 ACCEPTANCE TESTS PASSED 100% SUCCESSFULLY" -ForegroundColor Green
Write-Host "===============================================================" -ForegroundColor Green
