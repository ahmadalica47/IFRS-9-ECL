export type Bucket = { label: string; from: number; to: number; pd: number };
export type Factor = { name: string; unit: string; baseline: number; base: number; up: number; down: number; sens: number; src?: string };
export type Settings = {
  reportDate: string; termsDays: number; method: 'simplified' | 'general';
  // 'pd'   = band rates are probabilities of default, multiplied by LGD
  // 'loss' = band rates are historical loss rates (B5.5.35 / IE Example 12) that already include the loss given default
  rateType: 'pd' | 'loss';
  buckets: Bucket[]; lgd: number; eir: number; months: number;
  sicrDays: number;      // 5.5.11 rebuttable presumption: credit risk has increased significantly when more than 30 days past due
  defaultDays: number;   // B5.5.37 rebuttable presumption: default does not occur later than 90 days past due
  sicrMult: number;      // 5.5.9 relative test: current PD / PD at initial recognition at or above this = significant increase
  ccf: number;           // B5.5.31 expected drawdown share of undrawn loan commitments
  measure: 'ac' | 'fvoci'; // 5.5.2: FVOCI debt allowance sits in OCI, not against the carrying amount
  factors: Factor[]; wBase: number; wUp: number; wDown: number; overlay: number;
  segBy: 'segment' | 'country' | 'none'; segMult: Record<string, number>;
  openingAllowance: number; writeOffs: number; recoveries: number;
  specific: Record<string, Specific>;
};
export type Specific = { mode: 'pct' | 'amt'; value: number; note: string };
export type Inv = {
  row: number; customer: string; invNo: string; invDate: string; dueDate: string; amount: number;
  segment: string; country: string; currency: string; collateral: number; impaired: boolean;
  // optional columns, mainly for loans and bank portfolios
  dpdIn: number | null; maturity: string; stageIn: number; pdIn: number | null; origPd: number | null;
  lgdIn: number | null; eirIn: number | null; undrawn: number; poci: boolean; pociInitial: number;
};
export type Calc = Inv & {
  dpd: number; bucket: string; stage: number; stageKey: string; seg: string; base: number; pd: number; mult: number;
  lgdUsed: number; horizon: string; eclUndrawn: number; stageWhy: string;
  eclBase: number; eclUp: number; eclDown: number; ecl: number; rate: number; isSpec?: boolean;
};

export const blankInv = (p: Partial<Inv>): Inv => ({
  row: 0, customer: '', invNo: '', invDate: '', dueDate: '', amount: 0, segment: '', country: '', currency: '', collateral: 0, impaired: false,
  dpdIn: null, maturity: '', stageIn: 0, pdIn: null, origPd: null, lgdIn: null, eirIn: null, undrawn: 0, poci: false, pociInitial: 0, ...p,
});

export const defaultBuckets = (): Bucket[] => [
  { label: 'Current', from: -99999, to: 0, pd: 0.01 },
  { label: '1-30 days', from: 1, to: 30, pd: 0.03 },
  { label: '31-60 days', from: 31, to: 60, pd: 0.08 },
  { label: '61-90 days', from: 61, to: 90, pd: 0.15 },
  { label: '91-180 days', from: 91, to: 180, pd: 0.35 },
  { label: '181-365 days', from: 181, to: 365, pd: 0.6 },
  { label: 'Over 365 days', from: 366, to: 99999, pd: 0.9 },
];
export const defaultFactors = (): Factor[] => [
  { name: 'Real GDP growth', unit: '%', baseline: 3, base: 3, up: 4, down: 0.5, sens: -0.08 },
  { name: 'Unemployment rate', unit: '%', baseline: 5, base: 5, up: 4.5, down: 7, sens: 0.06 },
  { name: 'Inflation (CPI)', unit: '%', baseline: 2.5, base: 2.5, up: 2, down: 5, sens: 0.03 },
  { name: 'Lending interest rate', unit: '%', baseline: 5, base: 5, up: 4, down: 6.5, sens: 0.04 },
  { name: 'Oil price (Brent)', unit: 'USD', baseline: 80, base: 80, up: 95, down: 60, sens: -0.005 },
];
export const defaultSettings = (reportDate: string): Settings => ({
  reportDate, termsDays: 30, method: 'simplified', rateType: 'pd', buckets: defaultBuckets(), lgd: 0.45, eir: 0.05, months: 3,
  sicrDays: 30, defaultDays: 90, sicrMult: 2, ccf: 1, measure: 'ac',
  factors: defaultFactors(), wBase: 0.5, wUp: 0.2, wDown: 0.3, overlay: 0,
  segBy: 'segment', segMult: {}, openingAllowance: 0, writeOffs: 0, recoveries: 0, specific: {},
});

const DAY = 86400000;
export const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dpdOf = (due: string, report: string) => Math.round((parseISO(report) - parseISO(due)) / DAY);
export const addDays = (s: string, n: number) => new Date(parseISO(s) + n * DAY).toISOString().slice(0, 10);

export function scenarioRaw(f: Factor[], key: 'base' | 'up' | 'down') {
  return Math.exp(f.reduce((a, k) => a + k.sens * (k[key] - k.baseline), 0));
}
export function scenarioMult(f: Factor[], key: 'base' | 'up' | 'down') {
  return Math.min(3, Math.max(0.5, scenarioRaw(f, key)));
}
// Band for a number of days past due. If the bands leave a gap, the next higher (riskier) band is used, which is the prudent choice.
export const bucketOf = (b: Bucket[], dpd: number) => {
  const hit = b.find(k => dpd >= k.from && dpd <= k.to); if (hit) return hit;
  if (b.length && dpd < Math.min(...b.map(k => k.from))) return b.reduce((a, k) => (k.from < a.from ? k : a), b[0]);
  const above = b.filter(k => k.from > dpd).sort((x, y) => x.from - y.from)[0];
  return above || b[b.length - 1];
};

// Lifetime / 12-month expected loss for an exposure with a contractual life (general approach, B5.5.43-B5.5.44).
// pd12 is an annual probability of default, converted to a constant hazard; loss is discounted at the EIR to the middle of each year.
export function termLoss(pd12: number, lifeYears: number, horizonYears: number, eir: number) {
  const h = Math.max(0, Math.min(lifeYears, horizonYears)); const p = Math.min(1, Math.max(0, pd12));
  let surv = 1, t = 0, pv = 0;
  while (t < h - 1e-9) {
    const dt = Math.min(1, h - t); const marg = surv * (1 - Math.pow(1 - p, dt));
    pv += marg * Math.pow(1 + eir, -(t + dt / 2)); surv -= marg; t += dt;
  }
  return { cumPd: 1 - surv, pvPd: pv };
}

export function calculate(allRows: Inv[], s: Settings) {
  const mB = scenarioMult(s.factors, 'base'), mU = scenarioMult(s.factors, 'up'), mD = scenarioMult(s.factors, 'down');
  const wsum = s.wBase + s.wUp + s.wDown || 1;
  const w = { b: s.wBase / wsum, u: s.wUp / wsum, d: s.wDown / wsum };
  const df = Math.pow(1 + s.eir, -s.months / 12);
  // invoices issued after the reporting date are not recognised at that date and are left out
  const future = allRows.filter(r => r.invDate > s.reportDate);
  const rows = allRows.filter(r => r.invDate <= s.reportDate);
  const custTot = new Map<string, number>(); rows.forEach(r => custTot.set(r.customer, (custTot.get(r.customer) || 0) + r.amount));
  const specOf = (r: Inv) => {
    const sp = s.specific[r.customer]; if (!sp || !(sp.value > 0)) return null;
    const tot = custTot.get(r.customer) || 0; const prov = sp.mode === 'pct' ? tot * Math.min(1, sp.value) : Math.min(sp.value, tot);
    return tot > 0 ? prov * r.amount / tot : 0;
  };
  const out: Calc[] = rows.map(r => {
    const due = r.dueDate || addDays(r.invDate, s.termsDays);
    const dpd = r.dpdIn !== null ? Math.round(r.dpdIn) : dpdOf(due, s.reportDate);
    const bk = bucketOf(s.buckets, dpd);
    // ---- staging (5.5.3, 5.5.9-5.5.11, B5.5.37, Appendix A credit-impaired) ----
    let stage: number; let stageWhy: string;
    const pdRatioUp = r.pdIn !== null && r.origPd !== null && r.origPd > 0 && r.pdIn / r.origPd >= s.sicrMult;
    if (r.stageIn >= 1 && r.stageIn <= 3) { stage = r.stageIn; stageWhy = 'Stage from your file (your own assessment)'; }
    else if (r.impaired) { stage = 3; stageWhy = 'Flagged credit-impaired'; }
    else if (dpd > s.defaultDays) { stage = 3; stageWhy = `More than ${s.defaultDays} days past due (default)`; }
    else if (dpd > s.sicrDays) { stage = 2; stageWhy = `More than ${s.sicrDays} days past due`; }
    else if (pdRatioUp) { stage = 2; stageWhy = `PD now is ${s.sicrMult}x or more the PD at initial recognition`; }
    else { stage = 1; stageWhy = 'No significant increase in credit risk'; }
    const stageKey = r.poci ? 'POCI' : 'Stage ' + stage;
    const seg = s.segBy === 'none' ? 'All customers' : (s.segBy === 'country' ? r.country : r.segment) || 'Unspecified';
    const sprov = specOf(r);
    if (sprov !== null) {
      return { ...r, dpd, bucket: 'Specific provision', stage, stageKey, stageWhy, seg: 'Specific provision', base: r.amount, pd: 1, mult: 1, lgdUsed: 1, horizon: 'Individual assessment', eclUndrawn: 0, eclBase: sprov, eclUp: sprov, eclDown: sprov, ecl: sprov, rate: r.amount > 0 ? sprov / r.amount : 0, isSpec: true } as Calc;
    }
    const sm = s.segMult[seg] ?? 1;
    const ratePd = (r.pdIn !== null ? r.pdIn : bk.pd) * sm;
    const lgd = r.lgdIn !== null ? r.lgdIn : s.rateType === 'loss' ? 1 : s.lgd;
    const eir = r.eirIn !== null ? r.eirIn : s.eir;
    const undrawnEad = Math.max(0, r.undrawn) * s.ccf;
    const base = Math.max(r.amount + undrawnEad - r.collateral, 0);
    // PD = 100% when the exposure is credit-impaired: flagged, set to Stage 3 in your file, or Stage 3 under the general approach.
    // Under the simplified approach, invoices past the default line without a flag keep their provision-matrix band rate.
    const defaulted = r.impaired || r.stageIn === 3 || (s.method === 'general' && stage === 3);
    // remaining contractual life in years, only when a maturity date is given (loans)
    const life = r.maturity ? Math.max(dpdOf(s.reportDate, r.maturity) / 365, s.months / 12, 1 / 12) : 0;
    const lifetime = s.method === 'simplified' || stage >= 2 || r.poci;
    const dfRow = Math.pow(1 + eir, -s.months / 12);
    let horizon = '';
    const one = (m: number) => {
      let p: number, d: number;
      if (defaulted) { p = 1; d = dfRow; horizon = 'Default (PD 100%)'; }
      else if (r.maturity) {
        const t = termLoss(ratePd * m, life, lifetime ? life : 1, eir); p = t.cumPd; d = t.cumPd > 0 ? t.pvPd / t.cumPd : 1;
        horizon = lifetime ? `Lifetime (${life.toFixed(2)} yrs)` : `12 months${life < 1 ? ' (life is shorter: ' + life.toFixed(2) + ' yrs)' : ''}`;
      } else {
        // provision-matrix rate for a short-term receivable: its whole life is under 12 months, so 12-month ECL = lifetime ECL (5.5.5, Appendix A)
        p = Math.min(1, ratePd * m); d = dfRow; horizon = lifetime ? 'Lifetime' : '12 months (= lifetime, life under 1 year)';
      }
      return base * p * lgd * d * (1 + s.overlay);
    };
    const eclBase = one(mB), eclUp = one(mU), eclDown = one(mD);
    let ecl = w.b * eclBase + w.u * eclUp + w.d * eclDown;
    let eb = eclBase, eu = eclUp, ed = eclDown;
    // POCI (5.5.13-5.5.14): allowance = cumulative change in lifetime ECL since initial recognition (may be a gain)
    if (r.poci) { ecl -= r.pociInitial; eb -= r.pociInitial; eu -= r.pociInitial; ed -= r.pociInitial; }
    const eclUndrawn = base > 0 ? Math.max(0, ecl) * Math.min(undrawnEad, base) / base : 0;
    return { ...r, dpd, bucket: bk.label, stage, stageKey, stageWhy, seg, base, pd: defaulted ? 1 : ratePd, mult: mB, lgdUsed: lgd, horizon, eclUndrawn, eclBase: eb, eclUp: eu, eclDown: ed, ecl, rate: r.amount > 0 ? ecl / r.amount : 0 };
  });
  const sum = (a: Calc[], k: 'amount' | 'ecl' | 'eclBase' | 'eclUp' | 'eclDown' | 'eclUndrawn' | 'undrawn') => a.reduce((x, y) => x + y[k], 0);
  const groupOf = (src: Calc[], key: (c: Calc) => string, order: string[]) => {
    const m = new Map<string, Calc[]>();
    src.forEach(c => { const k = key(c); if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); });
    const keys = order.length ? order.filter(k => m.has(k)) : [...m.keys()].sort();
    return keys.map(k => { const a = m.get(k)!; return { key: k, n: a.length, gross: sum(a, 'amount'), ecl: sum(a, 'ecl'), rows: a }; });
  };
  const colRows = out.filter(c => !c.isSpec);
  const byBucket = groupOf(colRows, c => c.bucket, s.buckets.map(b => b.label));
  const bySeg = groupOf(colRows, c => c.seg, []);
  const byCust = groupOf(out, c => c.customer, []).sort((a, b) => b.ecl - a.ecl);
  // IFRS 7.35H/35M: all exposures, including individually assessed ones, belong to a stage
  const byStage = groupOf(out, c => c.stageKey, ['Stage 1', 'Stage 2', 'Stage 3', 'POCI']);
  const specRows = out.filter(c => c.isSpec);
  const clamped = (['base', 'up', 'down'] as const).filter(k => { const r = scenarioRaw(s.factors, k); return r < 0.5 || r > 3; });
  const gross = sum(out, 'amount'), ecl = sum(out, 'ecl');
  // movement in the allowance: opening + charge - amounts written off = closing
  const charge = ecl - s.openingAllowance + s.writeOffs;
  return {
    rows: out, byBucket, bySeg, byCust, byStage, gross, ecl, coverage: gross ? ecl / gross : 0, clamped, future,
    coll: { n: colRows.length, gross: sum(colRows, 'amount'), ecl: sum(colRows, 'ecl') },
    spec: { n: specRows.length, gross: sum(specRows, 'amount'), ecl: sum(specRows, 'ecl'), rows: specRows },
    undrawn: { amount: sum(out, 'undrawn'), ecl: sum(out, 'eclUndrawn') },
    scen: [
      { name: 'Base', w: w.b, mult: mB, ecl: sum(out, 'eclBase') },
      { name: 'Upside', w: w.u, mult: mU, ecl: sum(out, 'eclUp') },
      { name: 'Downside', w: w.d, mult: mD, ecl: sum(out, 'eclDown') },
    ],
    charge, pl: charge - s.recoveries, df,
  };
}

// ---------- parsing ----------
export function parseCSV(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const first = text.split('\n')[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

export function toISODate(v: string, dayFirst: boolean): string {
  v = (v ?? '').trim(); if (!v) return '';
  let m = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  // rejects impossible dates such as 31/02 instead of silently rolling them into the next month
  const mk = (y: number, mo: number, d: number) => {
    if (y < 100) y += 2000; if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    const dt = new Date(Date.UTC(y, mo - 1, d)); if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m) return dayFirst ? mk(+m[3], +m[2], +m[1]) : mk(+m[3], +m[1], +m[2]);
  if (/^\d{5}(\.\d+)?$/.test(v)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+v) * DAY).toISOString().slice(0, 10);
  const t = Date.parse(v + ' UTC'); if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return '';
}
export function toNum(v: string): number | null {
  let s = (v ?? '').toString().trim(); if (!s) return null;
  // Excel stores some numbers in scientific notation (1.5E-2)
  if (/^[-+]?\d*\.?\d+e[-+]?\d+$/i.test(s)) { const n = Number(s); return isFinite(n) ? n : null; }
  let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, ''); }
  s = s.replace(/[^0-9.,\-]/g, ''); if (!s) return null;
  if (s.includes('.') && s.includes(',')) {
    // both separators: the one written last is the decimal mark (1,234.56 or 1.234,56)
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (/,\d{1,2}$/.test(s)) s = s.replace(',', '.'); else s = s.replace(/,/g, '');
  const n = parseFloat(s); if (isNaN(n)) return null; return neg ? -Math.abs(n) : n;
}

export type FieldKey = 'customer' | 'invDate' | 'amount' | 'invNo' | 'dueDate' | 'segment' | 'country' | 'currency' | 'collateral'
  | 'dpd' | 'maturity' | 'stage' | 'pd' | 'origPd' | 'lgd' | 'eir' | 'undrawn' | 'poci' | 'pociInitial' | 'impaired';
export const FIELDS: { key: FieldKey; label: string; required: boolean; hint: string; syn: string[]; adv?: boolean }[] = [
  { key: 'customer', label: 'Customer name', required: true, hint: 'Who owes the money', syn: ['customer', 'client', 'debtor', 'borrower', 'party', 'name', 'account name', 'buyer'] },
  { key: 'invDate', label: 'Invoice date', required: true, hint: 'Date the invoice was issued (for loans: date drawn)', syn: ['invoice date', 'inv date', 'date', 'doc date', 'issue date', 'posting date', 'origination date', 'disbursement date'] },
  { key: 'amount', label: 'Outstanding amount', required: true, hint: 'Amount still unpaid (gross carrying amount)', syn: ['outstanding', 'balance', 'amount', 'open amount', 'receivable', 'gross carrying amount', 'total', 'due amount'] },
  { key: 'invNo', label: 'Invoice number', required: false, hint: 'Optional. Needed to compare with last period invoice by invoice', syn: ['invoice no', 'invoice number', 'inv no', 'invoice #', 'loan id', 'account number', 'document', 'reference', 'ref'] },
  { key: 'dueDate', label: 'Due date', required: false, hint: 'Better ageing. If empty, invoice date + payment terms', syn: ['due date', 'due', 'payment due'] },
  { key: 'segment', label: 'Segment / industry', required: false, hint: 'Gives segment-level results', syn: ['segment', 'industry', 'sector', 'customer type', 'type', 'category', 'group'] },
  { key: 'country', label: 'Country', required: false, hint: 'Optional', syn: ['country', 'region', 'location'] },
  { key: 'currency', label: 'Currency', required: false, hint: 'Optional, no conversion is done', syn: ['currency', 'ccy', 'curr'] },
  { key: 'collateral', label: 'Collateral / insurance', required: false, hint: 'Amount recoverable from a guarantee, credit insurance or security (after costs to sell)', syn: ['collateral', 'guarantee', 'insurance', 'security', 'insured'] },
  { key: 'dpd', label: 'Days past due', required: false, adv: true, hint: 'If your system gives it, used instead of working it out from the due date', syn: ['days past due', 'dpd', 'days overdue', 'overdue days'] },
  { key: 'maturity', label: 'Maturity date', required: false, adv: true, hint: 'Loans: end of the contract. Turns on 12-month vs lifetime PD over the remaining life', syn: ['maturity date', 'maturity', 'end date', 'expiry date'] },
  { key: 'stage', label: 'Stage (your assessment)', required: false, adv: true, hint: '1, 2 or 3. Overrides the days-past-due test (e.g. watch list, low credit risk, cure)', syn: ['stage', 'ifrs 9 stage', 'ifrs9 stage', 'staging'] },
  { key: 'pd', label: 'PD (12-month) now', required: false, adv: true, hint: 'From your rating model. Replaces the age-band rate', syn: ['pd', '12m pd', '12-month pd', 'current pd', 'probability of default'] },
  { key: 'origPd', label: 'PD at initial recognition', required: false, adv: true, hint: 'With "PD now" this tests a significant increase in credit risk (5.5.9)', syn: ['origination pd', 'pd at origination', 'initial pd', 'original pd', 'pd at recognition'] },
  { key: 'lgd', label: 'LGD', required: false, adv: true, hint: 'Loss given default per row. Replaces the general LGD', syn: ['lgd', 'loss given default'] },
  { key: 'eir', label: 'Effective interest rate', required: false, adv: true, hint: 'Per row, used to discount (B5.5.44)', syn: ['eir', 'effective interest rate', 'interest rate'] },
  { key: 'undrawn', label: 'Undrawn commitment', required: false, adv: true, hint: 'Unused credit limit / loan commitment (5.5.20, B5.5.31)', syn: ['undrawn', 'undrawn amount', 'unused limit', 'commitment', 'off balance'] },
  { key: 'poci', label: 'POCI flag', required: false, adv: true, hint: 'Yes if purchased or originated credit-impaired (5.5.13)', syn: ['poci', 'purchased credit impaired', 'originated credit impaired'] },
  { key: 'pociInitial', label: 'Lifetime ECL at initial recognition (POCI)', required: false, adv: true, hint: 'POCI only. The allowance is the change since then (5.5.14)', syn: ['initial ecl', 'ecl at initial recognition', 'ecl at origination'] },
  { key: 'impaired', label: 'Credit-impaired flag', required: false, hint: 'Yes/No. Defaulted, insolvent or disputed accounts', syn: ['impaired', 'credit impaired', 'default', 'defaulted', 'disputed', 'status'] },
];
export function autoMap(headers: string[]): Record<FieldKey, number> {
  const res = {} as Record<FieldKey, number>; const used = new Set<number>();
  const h = headers.map(x => (x ?? '').toString().toLowerCase().trim());
  FIELDS.forEach(f => { res[f.key] = -1; });
  // exact header matches first for every field, then partial matches (short codes such as "pd" only match exactly)
  FIELDS.forEach(f => { for (const s of f.syn) { const i = h.findIndex((x, j) => !used.has(j) && x === s); if (i >= 0) { res[f.key] = i; used.add(i); break; } } });
  FIELDS.forEach(f => {
    if (res[f.key] >= 0) return;
    for (const s of f.syn) { if (s.length < 3) continue; const i = h.findIndex((x, j) => !used.has(j) && x.includes(s)); if (i >= 0) { res[f.key] = i; used.add(i); break; } }
  });
  return res;
}
const yes = (v: string) => /^(y|yes|true|1|default|defaulted|impaired|credit.?impaired|disputed|poci)$/i.test(v.trim());
export function buildInvoices(data: string[][], map: Record<FieldKey, number>, dayFirst: boolean) {
  const rows: Inv[] = []; const issues: { row: number; why: string }[] = [];
  const get = (r: string[], k: FieldKey) => (map[k] !== undefined && map[k] >= 0 ? (r[map[k]] ?? '').toString().trim() : '');
  // rate columns: if any value is above 1 or has a % sign, the whole column is read as percentages (2.5 = 2.5%)
  const pctCol = (k: FieldKey) => data.some(r => { const v = get(r, k); const n = toNum(v); return /%/.test(v) || (n !== null && Math.abs(n) > 1); });
  const pc = { pd: pctCol('pd'), origPd: pctCol('origPd'), lgd: pctCol('lgd'), eir: pctCol('eir') };
  const rate = (r: string[], k: 'pd' | 'origPd' | 'lgd' | 'eir') => { const n = toNum(get(r, k)); if (n === null) return null; const x = pc[k] ? n / 100 : n; return k === 'eir' ? x : Math.min(1, Math.max(0, x)); };
  data.forEach((r, i) => {
    const row = i + 2;
    const amount = toNum(get(r, 'amount')); const invDate = toISODate(get(r, 'invDate'), dayFirst); const customer = get(r, 'customer');
    if (!customer) return issues.push({ row, why: 'No customer name' });
    if (amount === null) return issues.push({ row, why: 'Amount is empty or not a number' });
    if (!invDate) return issues.push({ row, why: 'Invoice date is empty or not readable' });
    const dd = get(r, 'dueDate'); const due = dd ? toISODate(dd, dayFirst) : '';
    if (dd && !due) return issues.push({ row, why: 'Due date not readable' });
    const md = get(r, 'maturity'); const mat = md ? toISODate(md, dayFirst) : '';
    if (md && !mat) return issues.push({ row, why: 'Maturity date not readable' });
    const st = /([123])/.exec(get(r, 'stage'));
    rows.push(blankInv({
      row, customer, invNo: get(r, 'invNo'), invDate, dueDate: due, amount, segment: get(r, 'segment'), country: get(r, 'country'), currency: get(r, 'currency'),
      collateral: Math.max(0, toNum(get(r, 'collateral')) || 0), impaired: yes(get(r, 'impaired')),
      dpdIn: toNum(get(r, 'dpd')), maturity: mat, stageIn: st ? +st[1] : 0, pdIn: rate(r, 'pd'), origPd: rate(r, 'origPd'), lgdIn: rate(r, 'lgd'), eirIn: rate(r, 'eir'),
      undrawn: Math.max(0, toNum(get(r, 'undrawn')) || 0), poci: yes(get(r, 'poci')), pociInitial: toNum(get(r, 'pociInitial')) || 0,
    }));
  });
  return { rows, issues };
}

// ---------- sample data ----------
export function sampleData(full: boolean): string[][] {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const cust = [
    ['Al Noor Trading', 'Wholesale', 'Saudi Arabia'], ['Gulf Build Contracting', 'Construction', 'Saudi Arabia'], ['Riyadh Fresh Mart', 'Retail', 'Saudi Arabia'],
    ['Nile Tech Solutions', 'Technology', 'Egypt'], ['Emirates Supply Co', 'Wholesale', 'UAE'], ['Kuwait Medical Group', 'Healthcare', 'Kuwait'],
    ['Ministry Services Unit', 'Government', 'Saudi Arabia'], ['Desert Star Retail', 'Retail', 'Saudi Arabia'], ['Delta Construction', 'Construction', 'Egypt'],
    ['Skyline Software', 'Technology', 'UAE'], ['Coastal Foods', 'Retail', 'UAE'], ['Najd Industrial', 'Wholesale', 'Saudi Arabia'],
    ['Red Sea Logistics', 'Transport', 'Saudi Arabia'], ['Falcon Builders', 'Construction', 'Saudi Arabia'],
  ];
  const rows: string[][] = [];
  const head = full ? ['Customer name', 'Invoice no', 'Invoice date', 'Due date', 'Outstanding amount', 'Segment', 'Country', 'Currency', 'Collateral', 'Credit impaired'] : ['Customer name', 'Invoice date', 'Amount'];
  rows.push(head);
  const rd = Date.UTC(2026, 8, 30);
  for (let i = 0; i < 120; i++) {
    const c = cust[Math.floor(rnd() * cust.length)];
    const age = Math.floor(Math.pow(rnd(), 2.2) * 380) + 1;
    const d = new Date(rd - age * DAY); const ds = d.toISOString().slice(0, 10);
    const terms = c[1] === 'Government' ? 60 : 30; const due = new Date(+d + terms * DAY).toISOString().slice(0, 10);
    const amt = Math.round((2000 + rnd() * 98000) / 10) * 10 + (rnd() < 0.1 ? 150000 : 0);
    const imp = c[0] === 'Delta Construction' && age > 200 ? 'Yes' : 'No';
    const col = c[0] === 'Emirates Supply Co' ? Math.round(amt * 0.5) : 0;
    rows.push(full ? [c[0], 'INV-' + (1001 + i), ds, due, String(amt), c[1], c[2], 'SAR', String(col), imp] : [c[0], ds, String(amt)]);
  }
  return rows;
}

// Demo "last period" file: same invoices issued up to 30 Jun 2026, plus some that were paid since.
export function samplePrior(): { rows: Inv[]; date: string } {
  const d = sampleData(true); const { rows } = buildInvoices(d.slice(1), autoMap(d[0]), true);
  const out = rows.filter(r => r.invDate <= '2026-06-30');
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const names = ['Al Noor Trading', 'Riyadh Fresh Mart', 'Gulf Build Contracting', 'Najd Industrial', 'Desert Star Retail'];
  for (let i = 0; i < 14; i++) {
    const age = 20 + Math.floor(rnd() * 200); const dt = addDays('2026-06-30', -age);
    out.push(blankInv({ row: 500 + i, customer: names[i % names.length], invNo: 'INV-9' + (100 + i), invDate: dt, dueDate: addDays(dt, 30), amount: Math.round((3000 + rnd() * 60000) / 10) * 10, segment: 'Wholesale', country: 'Saudi Arabia', currency: 'SAR' }));
  }
  return { rows: out, date: '2026-06-30' };
}

// Demo loan book (general approach): all three stages and POCI are present, reporting date 30 Sep 2026.
export function sampleLoans(): string[][] {
  let seed = 23; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const names = ['Al Rajhi Steel', 'Najd Foods', 'Desert Homes', 'Gulf Marine', 'Red Sea Hotels', 'Medina Clinics', 'Eastern Plastics', 'Tabuk Farms', 'Jeddah Retail Group', 'Qassim Dates',
    'Hail Logistics', 'Abha Resorts', 'Dammam Chemicals', 'Yanbu Energy', 'Taif Motors', 'Khobar Tech', 'Jazan Fisheries', 'Asir Cement', 'Riyadh Pharma', 'Makkah Textiles'];
  const segs = ['Corporate', 'SME', 'Real estate', 'Corporate', 'SME'];
  const head = ['Borrower', 'Loan ID', 'Disbursement date', 'Maturity date', 'Outstanding', 'Segment', 'Currency', 'Collateral', 'Days past due', 'Probability of default', 'PD at origination', 'LGD', 'Effective interest rate', 'Undrawn amount', 'POCI', 'Initial ECL', 'Credit impaired'];
  const rows: string[][] = [head];
  const rd = Date.UTC(2026, 8, 30); const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  for (let i = 0; i < 60; i++) {
    const seg = segs[i % segs.length]; const start = rd - Math.floor(200 + rnd() * 1500) * DAY; const mat = rd + Math.floor(120 + rnd() * 1800) * DAY;
    const amt = Math.round((seg === 'Corporate' ? 1500000 : seg === 'Real estate' ? 2500000 : 300000) * (0.4 + rnd() * 1.6) / 1000) * 1000;
    const origPd = +(0.004 + rnd() * 0.025).toFixed(4); const u = rnd();
    let dpd = 0, pd = origPd * (0.8 + rnd() * 0.6), imp = 'No';
    if (u > 0.94) { dpd = 95 + Math.floor(rnd() * 200); pd = 0.35; imp = rnd() > 0.4 ? 'Yes' : 'No'; }
    else if (u > 0.84) { dpd = 31 + Math.floor(rnd() * 55); pd = origPd * (2 + rnd() * 2); }
    else if (u > 0.76) { pd = origPd * (2.2 + rnd() * 2); }
    else if (u > 0.6) dpd = 1 + Math.floor(rnd() * 28);
    const col = seg === 'Real estate' ? Math.round(amt * 0.6) : seg === 'Corporate' ? Math.round(amt * 0.25) : 0;
    const und = seg === 'Corporate' && rnd() > 0.5 ? Math.round(amt * 0.3 / 1000) * 1000 : 0;
    rows.push([names[i % names.length] + (i >= names.length ? ' ' + (Math.floor(i / names.length) + 1) : ''), 'LN-' + String(1001 + i), iso(start), iso(mat), String(amt), seg, 'SAR', String(col), String(dpd),
      (Math.min(pd, 1) * 100).toFixed(2) + '%', (origPd * 100).toFixed(2) + '%', seg === 'Real estate' ? '30%' : seg === 'Corporate' ? '40%' : '50%', (6 + rnd() * 5).toFixed(2) + '%', String(und), 'No', '', imp]);
  }
  rows.push(['Distressed Debt Buyout', 'LN-2001', '2025-10-01', '2028-10-01', '900000', 'Purchased', 'SAR', '0', '100', '60%', '60%', '60%', '18%', '0', 'Yes', '250000', 'Yes']);
  return rows;
}
