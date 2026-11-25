# IFRS 9 ECL Calculator: review and changes

Reviewed on 22 Nov 2026 against IFRS 9 (sections 5.4–5.5, Appendix A, Application Guidance B5.5), the Illustrative Examples (Example 12 provision matrix) and the IFRS 7 credit-risk disclosures (35F–35N).
The original POC is unchanged in `../ifrs-9-ecl-calculator-source`. The corrected version is in this folder.

## 1. Errors found and fixed

| # | Problem in the POC | Why it matters | Fix |
|---|---|---|---|
| 1 | **The P&L charge ignored write-offs.** Charge = closing − opening. | Opening + charge − write-offs = closing, so the charge was understated by every amount written off in the period. | New inputs for write-offs and recoveries. Charge = closing − opening + write-offs. The journal now includes the write-off and recovery entries. |
| 2 | **LGD could be applied twice.** The provision-matrix rates (B5.5.35, Example 12) are *loss rates* that already include the loss given default, but the engine always multiplied by LGD 45%. | When users enter historical loss rates, the allowance is understated by about 55%. | New setting: "band rates are PD" or "band rates are historical loss rates". The history helper now switches to loss rates instead of quietly overwriting LGD. |
| 3 | **Stage 2 used an arbitrary ×1.8 "lifetime multiplier".** | It has no basis in IFRS 9. For receivables with a life under 12 months, 12-month ECL equals lifetime ECL (Appendix A). | Removed. For loans with a maturity date: a constant-hazard term structure gives 12-month ECL (Stage 1) and lifetime ECL (Stage 2), discounted at the EIR each year (B5.5.44). Items without a maturity are treated as short-term. |
| 4 | **The World Bank data reloaded every time the user opened step 3**, overwriting the forecasts they had typed. | IFRS 9 5.5.17 needs forward-looking forecasts, and the user's IMF/own forecasts were silently replaced by historical data. | Data now loads only when the country, year or method changes, or when a new file is added. |
| 5 | **Invoices dated after the reporting date were included.** | Those assets do not exist at the reporting date. | They are now left out, with a warning in step 2 and on the dashboard. |
| 6 | **Impossible dates were accepted.** 31/02/2026 became 3 March. | Ageing and stage would be wrong. | Such dates are now rejected and the row is reported. |
| 7 | **European amounts were misread.** "1.234,56" was read as 1.23456. Scientific notation (1.5E-2) and a trailing minus (1000-) were also wrong. | The exposure was wrong. | The parser was fixed and is covered by tests. |
| 8 | **The stage table and disclosures left out specifically provided customers.** | IFRS 7.35H/35M need every exposure in a stage. | All rows are now staged. Specific provisions keep their own amount. |
| 9 | **Gaps between age bands put invoices into the riskiest band silently.** Days below the first band went to the last band. | The result was wrong. | A gap now uses the next higher band, and days below the first band use the first band. The UI warning stays. |
| 10 | **The worked example did not reconcile** when an overlay, group multiplier or cap applied. | Auditors re-perform it, so it must match. | It now shows every factor, including the overlay, the 100% cap, POCI and per-row LGD/EIR. |
| 11 | The "Expected results" note hard-coded World Bank figures from one data download. | It goes stale and no longer matches the engine. | It now shows only figures the engine calculates live. |
| 12 | The "61–90 days slipping" action looked for a band label starting with "61" and estimated the effect. | It breaks if the bands are renamed, and it ignored the stage move. | The engine now recalculates those invoices 30 days later. |
| 13 | The prior-period matching used the invoice number only, and duplicate numbers overwrote each other. | The movement analysis was wrong. | Matching is now by customer + invoice number, and duplicates are combined. |
| 14 | The dashboard said defaulted invoices are provided "at 100%". | The real figure is PD 100% × LGD. | The wording was corrected. |
| 15 | The CSV export allowed formula injection (`=…`). NaN/Infinity could corrupt the .xlsx file. | A security and robustness risk. | Formula-like text is escaped and non-finite numbers are skipped. |
| 16 | Column auto-mapping was order-dependent. "Probability of default" could map to the impaired flag, and "Maturity" to the due date. | The wrong column was used. | Exact matches across all fields are made first, then partial matches. Short codes (pd) match exactly only. |
| 17 | The dashboard crashed when every customer had a specific provision (empty band list). | Crash. | Guarded. |

## 2. IFRS 9 requirements added

- **Staging with configurable rebuttable presumptions:** 30 days past due for a significant increase in credit risk (5.5.11) and 90 days for default (B5.5.37). A warning appears when either is changed.
- **Relative SICR test (5.5.9):** PD now ÷ PD at initial recognition ≥ threshold (default 2×), when both PD columns are given.
- **Stage override column:** your own assessment, for example watch list, low-credit-risk exemption (5.5.10) or cure/probation.
- **Optional bank or loan columns:** days past due, maturity date, 12-month PD, PD at recognition, LGD, EIR, undrawn commitment, POCI flag, and lifetime ECL at initial recognition.
- **POCI (5.5.13–5.5.14):** the allowance is the change in lifetime ECL since initial recognition. A favourable change is shown as a gain.
- **Loan commitments (5.5.20, B5.5.31):** EAD = drawn + CCF × undrawn. The ECL on the undrawn part is shown as a provision (IFRS 7 B8E).
- **FVOCI debt (5.5.2):** the allowance goes to OCI and does not reduce the carrying amount. The journal changes to match.
- **Write-offs and recoveries (5.4.4, B5.4.9):** included in the allowance movement and the journal entries.
- **IFRS 7.35H / 35I reconciliation by stage:** opening, transfers in and out, new, derecognised, remeasurement, closing. Shown for both the allowance and the gross carrying amount when last period's file is added.
- **IFRS 7.35M:** a new Excel sheet with gross amount and ECL by age band (grade) × stage.
- The Excel invoice sheet now shows EAD, stage, the reason for the stage, horizon (12-month or lifetime), PD and LGD for every row, so each row can be traced.

## 3. How this was checked

- **TypeScript compile** of all files in strict mode, with real React types: **0 errors**. The checker was confirmed to work by breaking a copy on purpose; it reported the errors.
- **54 calculation tests, all passed.** They include:
  - an independent re-calculation of the full demo, matching to the cent (ECL 996,675.42 on 8,446,190);
  - stage, band and scenario totals adding up;
  - the loss-rate mode equalling the PD mode ÷ LGD;
  - the charge with write-offs;
  - the 12-month and lifetime term structure (1 − 0.98³);
  - Stage 3, POCI, undrawn CCF and EIR discounting;
  - every IFRS 7 reconciliation column summing from opening to closing;
  - the parsing edge cases.
- How to re-run: `python tests/build.py src tests/test.html`, then serve the `tests` folder on localhost and open `test.html` in a browser.
- **Not checked:** the screens themselves. The app needs the Instinct runtime (`@instinct/files`), so it could not be started here. Please click through all 4 steps in Instinct before release.

## 4. Known limits (state these to users)

1. **The default band rates (1/3/8/15/35/60/90%) and the economic "strength" numbers are illustrative.** They do not come from IFRS 9, which gives no table. Users must replace them with their own loss history and their own sensitivities.
2. **World Bank data is historical, not a forecast.** IFRS 9 5.5.17 needs reasonable and supportable forecasts, so users should enter their own forecasts (for example the IMF WEO).
3. **Loans:** the exposure is held flat over the life (no amortisation or prepayment profile). The term structure is a constant hazard from a 12-month PD.
4. **Not modelled:**
   - contract modifications (5.4.3);
   - Stage 3 interest revenue on the net amount (5.4.1(b));
   - hedge accounting;
   - currency conversion;
   - per-customer collateral allocation (enter collateral per invoice).
5. **Under the simplified approach,** invoices past 90 days that are not flagged credit-impaired keep their band rate, which is the provision-matrix approach. Under the general approach, Stage 3 always uses PD 100%.

## 5. Version 2: redesigned screens and interactive dashboard (22 Nov 2026)

- **Step 1:** you choose what you are measuring. "Trade receivables" uses the simplified approach; "Loans, advances and debt" uses the general 3-stage approach. There are three demo files, including a 61-loan book that covers Stage 1, 2, 3 and POCI.
- **Step 2:** a data-check list with plain-language results (✓ / ! for each check). Column matching moved to a collapsible panel.
- **Step 3:** assumptions are split into six tabs (Date & country, Economy, Loss rates, Stages, Individual customers, Last period). A live estimate bar at the top updates as you type, split by stage. Every technical term has an (i) explanation with the IFRS 9 paragraph.
- **Step 4, the dashboard, has 8 tabs:**
  - Overview: KPIs, Stage 1/2/3/POCI cards, charts, top customers, actions.
  - Stages 1-2-3: the staging rules, the share of amount and loss by stage, why each item is in its stage, and the IFRS 7.35M matrix.
  - Ageing & segments: bars, a segment × age-band heatmap, cohorts.
  - Customers & items: searchable, sortable tables. Clicking a row opens a side panel with the step-by-step calculation for that item.
  - Economy & what-if: scenario cards, plus sliders for downside weight, PD stress, LGD and overlay, with "Apply to my assumptions".
  - Movement: a waterfall and the IFRS 7.35H/35I reconciliation by stage.
  - Journal & disclosure: allowance movement, journal entries, balance-sheet presentation and an IFRS 7 checklist.
  - How it is calculated.
- **Cross-filtering:** clicking a stage card, bar, donut slice, heatmap cell or segment filters the dashboard. A filter bar shows and clears the active filters.
- **Files:** new `src/ui.tsx` (shared components); `src/charts.tsx`, `src/Dashboard.tsx`, `src/App.tsx` and `src/style.css` were rewritten. The calculation engine is unchanged apart from the loan demo and the grouped SICR reason text. The 54 tests still pass and the type-check shows 0 errors.
