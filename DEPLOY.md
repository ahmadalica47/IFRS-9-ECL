# IFRS 9 ECL Calculator: check it, then publish it

## A. See it and check the numbers (no internet or install needed)

1. **Open the app.** Double-click `dist\offline\index.html`. This single file is the complete calculator and runs with no internet.
   (Rebuild it after code changes with `npm run build`; this needs Node.js.)
2. **Load the validation file.** In step 1, choose `test-data\validation-cases.csv`.
3. **Set the reporting date.** In step 3, set it to **2026-09-30**. The default is the last invoice month, and Case 12 is dated in October on purpose.
4. **See the result.** Click **See dashboard**, then **Download Excel report**.
5. **Open the checking workbook.** Open `test-data\validation-workbook.xlsx` in Excel. It recalculates every case with plain Excel formulas.
   - Copy the three **PD multiplier** values from the *Assumptions* sheet of the app's report into the yellow cells B12:B14.
     They are 1 if no country data was loaded, and different once World Bank data is loaded.
   - Paste the **ECL weighted** column from the report's *Invoices* sheet into column S, "App result". The 11 rows are in the same order.
   - Column U should show **OK** on every row and on the total.

Result already checked (25 Nov 2026, Saudi Arabia 2026 World Bank data): all 11 rows and all stages match. Total 54,614.75 on 560,000. Case 12 is correctly left out.

What the 12 cases cover:
- every age band;
- Stage 1, 2 and 3 (the 30-day and 90-day thresholds);
- a collateral deduction;
- a credit-impaired flag (PD 100%);
- a missing due date (invoice date + terms);
- a credit note (no loss);
- an invoice dated after the reporting date (left out).

Automated tests (54 checks): `npm test`. They also run on GitHub before every deploy.

## B. Publish on the web

The app runs entirely in the user's browser. No data is uploaded, so there is no server or database to manage.

### 1. Put the code on GitHub (one time)
1. Create an empty repository on github.com, for example `ifrs9-ecl-calculator`. Private is fine.
2. In this folder run:
   ```
   git init -b main
   git add .
   git commit -m "IFRS 9 ECL calculator"
   git remote add origin https://github.com/<your-account>/ifrs9-ecl-calculator.git
   git push -u origin main
   ```

### 2a. Cloudflare (this is how the live site is set up)
**Main address: https://ifrs9-ecl.pages.dev** (Cloudflare Pages project `ifrs9-ecl`)
- Connected to GitHub `ahmadalica47/IFRS-9-ECL`, branch `main`.
- Build command `npm run build`, output folder `dist`, environment variable `NODE_VERSION=20`.
- Security headers come from `public/_headers`.
- Every `git push` to `main` builds and publishes automatically, in about 1 minute.
- To use your own domain (e.g. `ifrs-9-ecl.dev`): buy it under *Domains > Registrations*, then go to *Workers & Pages > ifrs9-ecl > Custom domains > Set up a custom domain*.

Second copy: https://ifrs-9-ecl.ahmadalica47.workers.dev (Workers project `ifrs-9-ecl`, deployed by `npx wrangler deploy` using `wrangler.jsonc`). It updates on every push too. You can delete it in the dashboard if one address is enough; if you do, `wrangler.jsonc` can also be removed.

### 2b. Or host on GitHub Pages
In the repository, go to *Settings > Pages > Source* and choose **GitHub Actions**, and set the repository variable `DEPLOY_TO_GITHUB_PAGES` to `true` (*Settings > Secrets and variables > Actions > Variables*). The included workflow then tests, builds and publishes on every push to `main`.
GitHub Pages ignores `_headers`, so the security headers do not apply there.

### 2c. Or host on Firebase
Run `npm run build`, then `firebase init hosting` (keep the existing `firebase.json`), then `firebase deploy`.

## C. How offline works for users
- **Website:** after the first visit, the page and its files are stored on the device, so it opens and calculates with no internet. Chrome and Edge also show **Install as an app**.
- **Single file:** the footer link **Download the offline file** gives users one .html file they can keep, email or put on a shared drive. It runs with no internet at all.
- **Without internet:** only the World Bank economic data cannot load. The last loaded figures, or the manual ones, are used instead.
