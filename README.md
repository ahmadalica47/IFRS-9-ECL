# IFRS 9 Expected Credit Loss Calculator

Works out the IFRS 9 loss allowance for **trade receivables** (simplified approach, provision matrix) and **loans and debt** (general approach: Stage 1, 2, 3 and POCI). It is built for accountants, auditors and banks.

**Live site:** https://ifrs-9-ecl.ahmadalica47.workers.dev

- **Private:** your file is processed only in your browser. Nothing is uploaded.
- **Works offline:** after the first visit, or as a single downloadable .html file.
- **Every figure is traceable:** a step-by-step calculation for each invoice, an IFRS 7 reconciliation by stage, journal entries and an Excel report.
- **Forward-looking:** a normal, better and worse economy, with World Bank data by country and what-if sliders.

## How to use
1. Choose *Trade receivables* or *Loans, advances and debt*.
2. Upload an Excel or CSV file. Only three columns are needed: customer, date and outstanding amount.
3. Check the reporting date, country and assumptions.
4. Read the dashboard and download the Excel report.

## Check the numbers
`test-data/validation-cases.csv` and `test-data/validation-workbook.xlsx` re-perform every rule with plain Excel formulas. See [DEPLOY.md](DEPLOY.md).
The 54 automated calculation tests run on every push (`npm test`).

## Develop
```
npm install
npm run dev      # local development server
npm test         # calculation tests
npm run build    # website in dist/ and single-file offline version in dist/offline/
```
More detail: [REVIEW-NOTES.md](REVIEW-NOTES.md) (IFRS 9 review and design) and [DEPLOY.md](DEPLOY.md) (validation and hosting).

> Starting loss rates and economic sensitivities are illustrative. Replace them with your own history and forecasts before reporting. The output is a draft for review, not an audited figure.
