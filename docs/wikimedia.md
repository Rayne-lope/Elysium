# Wikimedia Commons importer

`npm run content:import:wikimedia` fills the Animals, Art, and Food categories from curated Wikimedia Commons Featured and Quality image collections. It accepts public-domain, CC0, CC BY, and CC BY-SA files, preserves creator/source/license metadata, and stores an official Commons rendition of up to 1920px as the downloadable master.

Start the local application first, then run:

```bash
ELYSIUM_BASE_URL=http://127.0.0.1:4321 npm run content:import:wikimedia
```

The target defaults to 100 published Wikimedia wallpapers per category. Override it with `TARGET_PER_CATEGORY`, up to the importer safety limit of 500:

```bash
TARGET_PER_CATEGORY=150 npm run content:import:wikimedia
```

The workflow is resumable. Existing Wikimedia page IDs and file hashes are skipped, while uploads still pass through the normal admin validation, preview generation, publication gate, D1 writes, and R2 lifecycle. `ADMIN_PASSWORD` is read from the environment or `.dev.vars`.

Run against production only as an explicit operator action after authenticating Wrangler and backing up D1. Never remove source, creator, or license fields from imported records.
