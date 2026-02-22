# Simulation Replay Benchmark Runbook

This runbook measures local replay latency for Safe simulation verification in desktop (`revm` path).

## Command

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml benchmark_replay_latency_profiles -- --ignored --nocapture
```

The benchmark prints p50/p95 latencies for four representative profiles:

- `erc20-transfer-like`
- `allowance-swap-like`
- `multisend-like`
- `revert-path`

## Expected output shape

```text
erc20-transfer-like: p50=...ms p95=...ms samples=50
allowance-swap-like: p50=...ms p95=...ms samples=50
multisend-like: p50=...ms p95=...ms samples=50
revert-path: p50=...ms p95=...ms samples=50
```

## Acceptance target

- Median (`p50`) remains interactive for typical flows.
- `p95` remains bounded and stable between releases.
- Regression threshold should be evaluated relative to the previous baseline in CI/manual release checks.

## Notes

- This harness is intentionally an `ignored` test to keep CI fast.
- It uses deterministic local EVM scenarios and does not require network access.
