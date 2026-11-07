param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$VersionId,
    [ValidatePattern('^[A-Za-z0-9._-]*$')]
    [string]$ParentVersionId = '',
    [ValidateSet('proposed', 'rejected', 'approved')]
    [string]$Status = 'proposed'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $repoRoot 'tuned_rules.yaml'
$history = Join-Path $repoRoot 'tuning/history'
function Get-CanonicalSha256([string]$filePath) {
    # Git may check text out with CRLF on Windows. Hash LF-normalized UTF-8 text.
    $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content.Replace("`r`n", "`n"))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw 'tuned_rules.yaml was not found'
}

if ($ParentVersionId -eq $VersionId) {
    throw 'A version cannot be its own parent'
}
if ($ParentVersionId -and -not (Test-Path -LiteralPath (Join-Path $history "$ParentVersionId.yaml") -PathType Leaf)) {
    throw "Parent version $ParentVersionId is not archived"
}

New-Item -ItemType Directory -Path $history -Force | Out-Null
$snapshotPath = Join-Path $history "$VersionId.yaml"
$recordPath = Join-Path $history "$VersionId.json"
if ((Test-Path -LiteralPath $snapshotPath) -or (Test-Path -LiteralPath $recordPath)) {
    throw "Version $VersionId already exists; archived snapshots are immutable"
}

$digest = Get-CanonicalSha256 $source
$record = [ordered]@{
    version_id = $VersionId
    parent_id = if ($ParentVersionId) { $ParentVersionId } else { $null }
    status = $Status
    sha256 = $digest
    hash_mode = 'utf8_lf'
    attack_sha256 = Get-CanonicalSha256 (Join-Path $repoRoot 'config/attack_rules.json')
    service_sha256 = Get-CanonicalSha256 (Join-Path $repoRoot 'config/service_rules.json')
    archived_at_utc = [DateTime]::UtcNow.ToString('o')
    snapshot = "$VersionId.yaml"
}
Copy-Item -LiteralPath $source -Destination $snapshotPath
try {
    $record | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8
} catch {
    Remove-Item -LiteralPath $snapshotPath
    throw
}
Write-Output "Archived $VersionId ($digest)"
