# SafeLens

A minimal, trustless application for verifying Gnosis Safe multisig transactions with full transparency.

## Features

- **Analyze**: Parse Safe transaction URLs and generate evidence packages
- **Verify**: Validate evidence packages and recompute Safe transaction hashes
- **Trustless**: Always recomputes critical data (hashes, signatures) client-side
- **Transparent**: Shows all sources of truth explicitly

## Getting Started

```bash
# Install dependencies
bun install

# Run development server
bun dev

# Build for production
bun run build

# Start production server
bun start
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Pages

### /analyze

Enter a Safe transaction URL (from app.safe.global) to:
- Fetch transaction data from Safe API
- Generate an evidence.json package
- Download or copy the evidence

Example URL:
```
https://app.safe.global/transactions/tx?safe=eth:0x9fC3dc011b461664c835F2527fffb1169b3C213e&id=multisig_0x9fC3dc011b461664c835F2527fffb1169b3C213e_0x8bcba9ed52545bdc89eebc015757cda83c2468d3f225cea01c2a844b8a15cf17
```

### /verify

Upload or paste an evidence.json package to:
- Validate the package schema
- Recompute the Safe transaction hash
- Verify hash integrity
- Display transaction details and signatures

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript** (strict mode)
- **viem** (Ethereum utilities, ABI encoding, hash computation)
- **Zod** (Schema validation)
- **Tailwind CSS + shadcn/ui** (UI components)

## Security

- All critical data (Safe tx hashes) are recomputed client-side
- Schema validation with Zod
- No backend database (stateless, privacy-preserving)
- EIP-712 compliant hash computation

## License

MIT
