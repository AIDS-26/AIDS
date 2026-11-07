param()

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

$contents = Get-Content -LiteralPath $source -Raw
$version = [regex]::Match($contents, '(?m)^version:\s*\r?\n  id: ([A-Za-z0-9._-]+)\s*$')
$parent = [regex]::Match($contents, '(?m)^  parent_id: (null|[A-Za-z0-9._-]+)\s*$')
if (-not $version.Success -or -not $parent.Success) {
    throw 'version.id and version.parent_id must be simple YAML values'
}
$attackHash = [regex]::Match($contents, '(?m)^  attack_sha256: ([a-f0-9]{64})\s*$')
$serviceHash = [regex]::Match($contents, '(?m)^  service_sha256: ([a-f0-9]{64})\s*$')
if (-not $attackHash.Success -or -not $serviceHash.Success) {
    throw 'Source SHA-256 values are missing or invalid'
}
if ((Get-CanonicalSha256 (Join-Path $repoRoot 'config/attack_rules.json')) -ne $attackHash.Groups[1].Value -or
    (Get-CanonicalSha256 (Join-Path $repoRoot 'config/service_rules.json')) -ne $serviceHash.Groups[1].Value) {
    throw 'YAML source hashes do not match current canonical JSON'
}
$versionId = $version.Groups[1].Value
$parentId = $parent.Groups[1].Value
if ($parentId -eq $versionId) {
    throw 'A version cannot be its own parent'
}
if ($parentId -ne 'null' -and -not (Test-Path -LiteralPath (Join-Path $history "$parentId.yaml") -PathType Leaf)) {
    throw "Parent version $parentId is not archived"
}

New-Item -ItemType Directory -Path $history -Force | Out-Null
$snapshotPath = Join-Path $history "$versionId.yaml"
$recordPath = Join-Path $history "$versionId.json"
if ((Test-Path -LiteralPath $snapshotPath) -or (Test-Path -LiteralPath $recordPath)) {
    throw "Version $versionId already exists; archived snapshots are immutable"
}

$digest = Get-CanonicalSha256 $source
$record = [ordered]@{
    version_id = $versionId
    parent_id = if ($parentId -eq 'null') { $null } else { $parentId }
    sha256 = $digest
    hash_mode = 'utf8_lf'
    archived_at_utc = [DateTime]::UtcNow.ToString('o')
    snapshot = "$versionId.yaml"
}
Copy-Item -LiteralPath $source -Destination $snapshotPath
try {
    $record | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8
} catch {
    Remove-Item -LiteralPath $snapshotPath
    throw
}
Write-Output "Archived $versionId ($digest)"
