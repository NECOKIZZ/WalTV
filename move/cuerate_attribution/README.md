# Cuerate Attribution Move Package

This package records Cuerate prompt provenance on Sui while the app keeps fast
social/index data in Firestore.

## Objects

- `AttributionRecord`: immutable provenance object for an original prompt or a fork.
- `PromptRecorded`: event emitted when an original prompt is recorded.
- `PromptForked`: event emitted when a fork is recorded.

The bridge fields are:

- `prompt_key`: Cuerate Firestore prompt id.
- `content_blob_id`: Walrus blob id for the visible media.
- `metadata_blob_id`: optional Walrus metadata/thumbnail blob id.

## Local Commands

Install the Sui CLI, then run:

```bash
sui move build --path move/cuerate_attribution
sui client publish move/cuerate_attribution --gas-budget 100000000
```

After publishing, set the package id in `.env`:

```bash
VITE_CUERATE_ATTRIBUTION_PACKAGE_ID=0x...
```

The React app will then best-effort record original prompts and forks onchain
after the Firestore write succeeds.
