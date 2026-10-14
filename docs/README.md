# VoltSlot documentation PDFs

These source-based reports are generated from the VoltSlot frontend/backend implementation:

- `VoltSlot_Project_Documentation.pdf` — academic project report, architecture and ER diagrams, modules, API overview, user guidance, security notes, and verified tests.
- `VoltSlot_API_Reference.pdf` — concise implemented endpoint reference.
- `VoltSlot_User_Manual.pdf` — customer and administrator step-by-step guide.
- `VoltSlot_Test_Report.pdf` — actual test/build run results, coverage notes, and test boundaries.

Student name, USN, department, college, guide, and academic year remain clearly marked placeholders. Screenshots are also labelled placeholders because no isolated demo data was used to capture real application pages. Replace these placeholders manually before submission if required; do not add credentials or personal customer data.

## Regenerate

From the repository root, install the separate documentation tool dependency and its Chromium runtime once:

```powershell
npm install --prefix scripts
npm exec --prefix scripts -- playwright install chromium
npm --prefix scripts run generate
```

This generator writes only the four PDFs in `docs/`. It does not load `.env` files, call backend APIs, connect to MongoDB, or change application dependencies.
