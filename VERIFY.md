# Verifying SafeLens Builds

How to confirm that a released binary matches the source code.

## Checksum Verification

Every [GitHub release](https://github.com/Th0rgal/SafeLens/releases) includes a `SHA256SUMS.txt` file listing the SHA-256 hash of each artifact.

After downloading a release binary:

```bash
# macOS / Linux
sha256sum SafeLens_0.4.0_aarch64.dmg
# Compare the output against the corresponding line in SHA256SUMS.txt

# Windows (PowerShell)
Get-FileHash SafeLens_0.4.0_x64-setup.exe -Algorithm SHA256
```

## Building from Source

To reproduce a release build locally and compare against the published artifact:

### Prerequisites

- [Bun](https://bun.sh) v1.3.9+
- [Rust](https://rustup.rs/) 1.93.1 (match the exact toolchain used in CI)
- Platform-specific dependencies:
  - **Linux**: `libwebkit2gtk-4.1-dev librsvg2-dev patchelf libssl-dev`
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools (C++ workload), WebView2

### Steps

```bash
# 1. Clone at the release tag
git clone https://github.com/Th0rgal/SafeLens.git
cd SafeLens
git checkout v0.4.0  # replace with the release tag

# 2. Install dependencies
bun install --frozen-lockfile

# 3. Run the full CI check (optional but recommended)
bun run verify:ci

# 4. Build the desktop app
bun run build:tauri
```

Build artifacts appear in `apps/desktop/src-tauri/target/release/bundle/`.

### Platform-Specific Bundles

| Platform | Bundle location |
|----------|----------------|
| macOS | `target/release/bundle/dmg/SafeLens_*.dmg` |
| Windows | `target/release/bundle/msi/SafeLens_*.msi` |
| Linux | `target/release/bundle/deb/safe-lens_*.deb`, `target/release/bundle/appimage/safe-lens_*.AppImage` |

## CI Build Pipeline

Release builds run in GitHub Actions ([`release.yml`](.github/workflows/release.yml)):

1. **verify-ci**: Full lint + type-check + test + Rust checks
2. **build**: Matrix build on macOS (ARM64), Windows (x64), Linux (x64) using `tauri-apps/tauri-action`
3. **release**: Collects artifacts, generates `SHA256SUMS.txt`, creates a draft GitHub release

All CI runners use the same pinned toolchain versions (Bun 1.3.9, Rust 1.93.1) and `--frozen-lockfile` to ensure deterministic dependency resolution.

## Reproducibility Limitations

Tauri/Rust builds are not yet fully bit-for-bit reproducible across environments due to:

- **Code signing**: macOS and Windows builds may include platform-specific signatures
- **Timestamps**: Some build tools embed timestamps in binaries
- **System libraries**: Linked system libraries (WebKit, OpenSSL) differ across OS versions

The `SHA256SUMS.txt` file in each release is the canonical reference. If you build locally and get a different hash, the above factors are the likely cause — not a supply-chain compromise. The source code itself can always be audited directly.

## Reporting Discrepancies

If you suspect a mismatch that cannot be explained by the above factors, report it via the [security policy](SECURITY.md).
