# Release Integrity

This document defines the reviewer workflow for release integrity checks.

## Policy

- Release tags (`v*`) are treated as immutable once published.
- Release artifacts are tied to a specific git tag and commit.
- Release checksums in `SHA256SUMS.txt` are the canonical artifact integrity record.

## Verify Tag to Commit

```bash
git fetch --tags origin
git show --no-patch --pretty=fuller v0.4.0
git rev-list -n 1 v0.4.0
```

Expected result: the tag resolves to the intended audited commit.

## Verify Artifact Checksums

```bash
# Example on Linux/macOS
sha256sum SafeLens_0.4.0_aarch64.dmg
# Compare with matching line in SHA256SUMS.txt
```

```powershell
# Example on Windows
Get-FileHash SafeLens_0.4.0_x64-setup.exe -Algorithm SHA256
```

Expected result: local checksum equals the value in `SHA256SUMS.txt`.

## Verify CI Workflow Source

Release pipeline definition:
- `.github/workflows/release.yml`

Test/CI parity pipeline definition:
- `.github/workflows/test.yml`

Expected result: pinned action revisions, pinned Bun and Rust versions, and `bun install --frozen-lockfile` in CI.
