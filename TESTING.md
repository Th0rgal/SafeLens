# SafeLens Testing Guide

This document describes how to test the SafeLens application.

## Manual Testing

### Test 1: Analyze a Real Safe Transaction

1. Start the dev server:
```bash
bun dev
```

2. Navigate to http://localhost:3000/analyze

3. Enter this test URL:
```
https://app.safe.global/transactions/tx?safe=eth:0x9fC3dc011b461664c835F2527fffb1169b3C213e&id=multisig_0x9fC3dc011b461664c835F2527fffb1169b3C213e_0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17
```

4. Click "Analyze"

5. Verify:
   - ✅ Transaction data is fetched successfully
   - ✅ Evidence package is generated
   - ✅ Safe address, chain, and hashes are displayed correctly
   - ✅ Signatures count is shown

6. Click "Download JSON" and save the file

### Test 2: Verify the Evidence Package

1. Navigate to http://localhost:3000/verify

2. Upload the evidence.json file from Test 1, or paste its contents

3. Click "Verify Evidence"

4. Verify:
   - ✅ Green success banner appears
   - ✅ "Verification Successful" message is shown
   - ✅ Safe TX Hash is displayed correctly
   - ✅ Transaction details match the original
   - ✅ All signatures are listed
   - ✅ Sources of truth are shown

### Test 3: Test Invalid Evidence

1. Navigate to http://localhost:3000/verify

2. Paste this invalid JSON:
```json
{
  "version": "1.0",
  "safeAddress": "0xinvalid"
}
```

3. Click "Verify Evidence"

4. Verify:
   - ✅ Red error banner appears
   - ✅ Validation errors are listed
   - ✅ No transaction details are shown

### Test 4: Hash Recomputation

1. Take the evidence.json from Test 1

2. Manually modify the `safeTxHash` field to a different value

3. Upload the modified evidence to /verify

4. Verify:
   - ✅ Verification fails
   - ✅ Error message mentions "hash mismatch"
   - ✅ Shows both computed and expected hashes

## URL Parsing Tests

Test these URLs in the Analyze page:

### Valid URLs

1. Ethereum Mainnet:
```
https://app.safe.global/transactions/tx?safe=eth:0x9fC3dc011b461664c835F2527fffb1169b3C213e&id=multisig_0x9fC3dc011b461664c835F2527fffb1169b3C213e_0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17
```
Expected: ✅ Parses successfully (chain: Ethereum Mainnet)

2. Polygon:
```
https://app.safe.global/transactions/tx?safe=matic:0x1234567890123456789012345678901234567890&id=multisig_0x1234567890123456789012345678901234567890_0x1111111111111111111111111111111111111111111111111111111111111111
```
Expected: ✅ Parses successfully (chain: Polygon)

### Invalid URLs

1. Missing safe parameter:
```
https://app.safe.global/transactions/tx?id=multisig_0x123_0x456
```
Expected: ❌ Error: "Missing 'safe' parameter"

2. Invalid safe address:
```
https://app.safe.global/transactions/tx?safe=eth:invalid&id=multisig_invalid_0x123
```
Expected: ❌ Error: "Invalid Safe address format"

3. Missing id parameter:
```
https://app.safe.global/transactions/tx?safe=eth:0x1234567890123456789012345678901234567890
```
Expected: ❌ Error: "Missing 'id' parameter"

## Evidence Package Validation Tests

### Valid Evidence Package Schema

```json
{
  "version": "1.0",
  "safeAddress": "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
  "safeTxHash": "0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17",
  "chainId": 1,
  "transaction": {
    "to": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "value": "0",
    "data": "0x",
    "operation": 0,
    "nonce": 42,
    "safeTxGas": "0",
    "baseGas": "0",
    "gasPrice": "0",
    "gasToken": "0x0000000000000000000000000000000000000000",
    "refundReceiver": "0x0000000000000000000000000000000000000000"
  },
  "confirmations": [
    {
      "owner": "0x1111111111111111111111111111111111111111",
      "signature": "0x123456",
      "submissionDate": "2024-01-01T00:00:00.000Z"
    }
  ],
  "confirmationsRequired": 3,
  "sources": {
    "safeApiUrl": "https://safe-transaction-mainnet.safe.global",
    "transactionUrl": "https://app.safe.global/transactions/tx?safe=eth:0x9fC3dc011b461664c835F2527fffb1169b3C213e&id=multisig_0x9fC3dc011b461664c835F2527fffb1169b3C213e_0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17"
  },
  "packagedAt": "2024-01-01T00:00:00.000Z"
}
```
Expected: ✅ Passes schema validation (may fail hash check if hash doesn't match)

## Integration Testing Checklist

- [ ] Can parse valid Safe URLs
- [ ] Rejects invalid URLs with clear error messages
- [ ] Fetches transaction data from Safe API
- [ ] Creates valid evidence packages
- [ ] Downloads evidence as JSON file
- [ ] Copies evidence to clipboard
- [ ] Uploads evidence files
- [ ] Parses pasted evidence JSON
- [ ] Validates evidence schema with Zod
- [ ] Recomputes Safe TX hash correctly
- [ ] Verifies hash matches expected value
- [ ] Detects hash mismatches
- [ ] Displays transaction details correctly
- [ ] Shows all signatures
- [ ] Displays sources of truth
- [ ] Handles API errors gracefully
- [ ] Shows loading states
- [ ] Mobile responsive UI

## Performance Tests

### Bundle Size
```bash
bun run build
```

Expected:
- First Load JS: < 120 kB per page
- Analyze page: ~111 kB ✅
- Verify page: ~118 kB ✅

### Build Time
Expected: < 30 seconds for production build ✅

## Browser Compatibility

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

## Security Tests

1. **XSS Prevention**: Try pasting malicious script tags in JSON input
   - Expected: Scripts are escaped, not executed

2. **Hash Verification**: Modify evidence package data
   - Expected: Hash mismatch detected

3. **Schema Validation**: Send malformed data
   - Expected: Clear validation errors, no crashes

## Known Limitations

1. The app relies on Safe Transaction Service API being available
2. No offline mode for fetching transactions (only verification works offline)
3. Limited to supported chains (mainnet, polygon, arbitrum, etc.)
4. No signature verification yet (only hash verification)

## Next Steps for Testing

1. Add unit tests with Jest/Vitest
2. Add E2E tests with Playwright
3. Add API mocking for offline testing
4. Add signature verification tests
5. Add ABI decoding tests
