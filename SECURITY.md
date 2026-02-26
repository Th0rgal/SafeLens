# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes       |
| < 0.4   | No        |

Only the latest release receives security fixes. Previous versions are not backported.

## Reporting a Vulnerability

**Do not open a public issue.**

Use [GitHub Private Vulnerability Reporting](https://github.com/Th0rgal/SafeLens/security/advisories/new) to submit findings. This keeps details confidential until a fix is available.

Include:

- Description of the vulnerability
- Steps to reproduce
- Affected component (`packages/core`, `apps/desktop`, `apps/generator`, `packages/cli`)
- Impact assessment (what can an attacker achieve?)

## Response Timeline

| Step | Target |
|------|--------|
| Acknowledgment | 48 hours |
| Triage and severity assessment | 7 days |
| Fix or mitigation | 30 days (critical: 14 days) |

## Scope

In scope:

- Hash substitution or signature bypass in the verification path
- CSP or airgap escapes in the desktop app
- Zod schema bypasses that allow malformed evidence packages
- BLS or MPT verification logic errors
- Information leaks from the desktop verifier (network, filesystem)
- Dependency vulnerabilities in the verification path

Out of scope:

- Bugs in third-party RPC providers or the Safe Transaction Service
- Social engineering of multisig signers
- Denial of service against the generator web app (hosted, not self-hosted)
- Issues requiring physical access to the user's machine

## Trust Model

See [`TRUST_ASSUMPTIONS.md`](TRUST_ASSUMPTIONS.md) for the full trust model and [`AUDIT.md`](AUDIT.md) for the security architecture.

## Threat Model Summary

### Protects against

| Scenario | Condition |
|---|---|
| Malicious or incorrect Safe API payload | Offline verifier recomputes safeTxHash and checks signatures |
| Hash substitution in exported evidence | Claimed hash is never trusted, verifier recomputes from transaction fields |
| Malformed policy proof artifacts | MPT proofs are validated locally before trust upgrades |
| Desktop data exfiltration during verification | CSP and Tauri config block external network access |

### Does not protect against

| Scenario | Reason |
|---|---|
| Compromised airgapped machine | Local runtime and OS are in the trusted computing base |
| Compromised RPC used during generation | Generation is network-connected and treated as untrusted input collection |
| Compromised Foundry/local node simulation tooling | External simulation tools are out of SafeLens trust boundary |
| Unsupported signature schemes fully verified offline | Some signature modes require on-chain validation and are reported as warnings |
