import { Calc, Inv, Settings, calculate } from './ecl';

export type Res = ReturnType<typeof calculate>;
export const eclShort = (n: number) => Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + 'K' : Math.round(n).toLocaleString('en-US');

export function cohorts(rows: Calc[]) {
  const m = new Map<string, { owed: number; ecl: number; n: number }>();
  rows.forEach(r => { const k = r.invDate.slice(0, 7); const x = m.get(k) || { owed: 0, ecl: 0, n: 0 }; x.owed += r.amount; x.ecl += r.ecl; x.n++; m.set(k, x); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ key: k, ...v }));
}

// ECL if the economy were exactly at the normal range (all scenario multipliers = 1)
export function econEffect(rows: Inv[], s: Settings, weighted: number) {
  const flat = { ...s, factors: s.factors.map(f => ({ ...f, base: f.baseline, up: f.baseline, down: f.baseline })) };
  const neutral = calculate(rows, flat).ecl;
  return { neutral, delta: weighted - neutral, pct: neutral ? (weighted - neutral) / neutral : 0 };
}

// Extra ECL if the invoices in the band just before the default line are still unpaid 30 days from now.
// Recalculated with the full model (band change, stage change and PD 100% where it applies), not estimated.
export function slideImpact(res: Res, s: Settings) {
  const i = s.buckets.findIndex(x => s.defaultDays >= x.from && s.defaultDays <= x.to);
  if (i < 0) return { owed: 0, extra: 0, n: 0, label: '' };
  const label = s.buckets[i].label;
  const rows = res.rows.filter(r => !r.isSpec && r.bucket === label && r.stage < 3);
  if (!rows.length) return { owed: 0, extra: 0, n: 0, label };
  const owed = rows.reduce((a, r) => a + r.amount, 0);
  const cur = rows.reduce((a, r) => a + r.ecl, 0);
  const later = { ...s, reportDate: new Date(Date.parse(s.reportDate + 'T00:00:00Z') + 30 * 86400000).toISOString().slice(0, 10), specific: {} };
  const moved = calculate(rows.map(r => ({ ...r, dpdIn: r.dpdIn !== null ? r.dpdIn + 30 : null })), later).ecl;
  return { owed, extra: moved - cur, n: rows.length, label };
}

// ---------- comparison with last period, IFRS 7.35H / 35I reconciliation ----------
export const STAGES = ['Stage 1', 'Stage 2', 'Stage 3', 'POCI'];
export type ReconLine = { label: string; v: Record<string, number> };
export type Recon = { allowance: ReconLine[]; gross: ReconLine[] };
export type Prior = { res: Res; date: string; matched: boolean;
  drivers: { newInv: number; cleared: number; aging: number } | null; recon: Recon | null };

type Agg = { amount: number; ecl: number; stageKey: string; rank: number };
const rankOf = (k: string) => k === 'POCI' ? 4 : +k.slice(-1);
function aggregate(rows: Calc[]) {
  // invoice numbers can repeat (instalments, several lines); combine them by customer + number
  const m = new Map<string, Agg>();
  rows.forEach(r => {
    const k = r.customer + '|' + r.invNo; const x = m.get(k);
    if (!x) m.set(k, { amount: r.amount, ecl: r.ecl, stageKey: r.stageKey, rank: rankOf(r.stageKey) });
    else { x.amount += r.amount; x.ecl += r.ecl; if (rankOf(r.stageKey) > x.rank) { x.rank = rankOf(r.stageKey); x.stageKey = r.stageKey; } }
  });
  return m;
}
function reconcile(now: Map<string, Agg>, prior: Map<string, Agg>, f: 'amount' | 'ecl'): ReconLine[] {
  const z = () => Object.fromEntries(STAGES.map(k => [k, 0])) as Record<string, number>;
  const open = z(), tin = z(), tout = z(), nw = z(), der = z(), rem = z(), close = z();
  prior.forEach((p, k) => { open[p.stageKey] += p[f]; const n = now.get(k); if (!n) der[p.stageKey] -= p[f]; });
  now.forEach((n, k) => {
    close[n.stageKey] += n[f]; const p = prior.get(k);
    if (!p) { nw[n.stageKey] += n[f]; return; }
    if (p.stageKey !== n.stageKey) { tout[p.stageKey] -= p[f]; tin[n.stageKey] += p[f]; }
    rem[n.stageKey] += n[f] - p[f];
  });
  const isA = f === 'ecl';
  return [
    { label: isA ? 'Opening loss allowance (recalculated)' : 'Opening gross carrying amount', v: open },
    { label: 'Transfers in from other stages', v: tin },
    { label: 'Transfers out to other stages', v: tout },
    { label: isA ? 'New invoices / assets originated' : 'New invoices / assets originated', v: nw },
    { label: 'Paid, settled or written off (derecognised)', v: der },
    { label: isA ? 'Remeasurement of open items (ageing, risk, economy)' : 'Changes in balance of open items', v: rem },
    { label: isA ? 'Closing loss allowance' : 'Closing gross carrying amount', v: close },
  ];
}
export function comparePrior(now: Res, prior: Res, date: string): Prior {
  const withNo = (r: Res) => r.rows.filter(x => x.invNo).length / Math.max(1, r.rows.length);
  const can = withNo(now) >= 0.8 && withNo(prior) >= 0.8;
  if (!can) return { res: prior, date, matched: false, drivers: null, recon: null };
  const pm = aggregate(prior.rows); const nm = aggregate(now.rows);
  let newInv = 0, cleared = 0, aging = 0;
  nm.forEach((n, k) => { const p = pm.get(k); if (!p) newInv += n.ecl; else aging += n.ecl - p.ecl; });
  pm.forEach((p, k) => { if (!nm.has(k)) cleared += p.ecl; });
  return { res: prior, date, matched: true, drivers: { newInv, cleared: -cleared, aging }, recon: { allowance: reconcile(nm, pm, 'ecl'), gross: reconcile(nm, pm, 'amount') } };
}

export type Action = { title: string; why: string; amount?: string };
export function actions(res: Res, s: Settings, f: (n: number) => string, slide: ReturnType<typeof slideImpact>, econ: ReturnType<typeof econEffect>): Action[] {
  const out: Action[] = [];
  const noun = s.method === 'general' ? 'exposures' : 'invoices';
  const overD = res.rows.filter(r => r.dpd > s.defaultDays && !r.impaired);
  const oD = overD.reduce((a, r) => a + r.amount, 0);
  const top = res.byCust.filter(c => c.ecl > 0).slice(0, 3);
  if (top.length) out.push({ title: `Chase ${top.map(c => c.key).join(', ')} first`, why: `${top.length === 1 ? 'This customer carries' : 'These ' + top.length + ' carry'} ${Math.round(100 * top.reduce((a, c) => a + c.ecl, 0) / Math.max(res.ecl, 1))}% of the expected loss. Every payment they make lowers your allowance.`, amount: f(top.reduce((a, c) => a + c.ecl, 0)) + ' expected loss' });
  if (oD > 0) out.push({ title: `Agree a payment plan or escalate ${noun} over ${s.defaultDays} days`, why: `${overD.length} ${noun} are more than ${s.defaultDays} days past due. IFRS 9 presumes default at this point (B5.5.37) and they sit in Stage 3. Check whether any should be flagged credit-impaired or written off (5.4.4).`, amount: f(oD) + ' owed' });
  if (slide.owed > 0 && slide.extra > 0) out.push({ title: `Collect the ${slide.label} ${noun} this month`, why: `${slide.n} ${noun} are close to the ${s.defaultDays}-day default line. If they are still unpaid in 30 days, your allowance rises by about ${f(slide.extra)} (recalculated, not estimated).`, amount: f(slide.owed) + ' owed' });
  const imp = res.rows.filter(r => r.impaired && !r.isSpec);
  if (imp.length) out.push({ title: 'Decide on defaulted customers: recover, restructure or write off', why: `${imp.length} ${noun} are flagged credit-impaired. They are provided at a 100% chance of not paying, times the share lost (LGD), on the amount not covered by collateral.`, amount: f(imp.reduce((a, r) => a + r.amount, 0)) + ' owed' });
  const big = res.byCust.slice().sort((a, b) => b.gross - a.gross)[0];
  if (big && res.gross && big.gross / res.gross > 0.15) out.push({ title: `Review the credit limit for ${big.key}`, why: `One customer is ${Math.round(100 * big.gross / res.gross)}% of everything you are owed. A single default would hurt. IFRS 7.34(c) asks you to disclose concentrations of risk.`, amount: f(big.gross) + ' owed' });
  if (econ.pct > 0.1) out.push({ title: 'Watch the economy: it is adding to your allowance', why: `Economic conditions raise the expected loss by about ${Math.round(econ.pct * 100)}% compared with a normal year (${f(econ.delta)}). Re-check each quarter.`, amount: '+' + f(econ.delta) });
  const unins = res.rows.filter(r => r.dpd > 60 && r.collateral === 0).reduce((a, r) => a + r.amount, 0);
  if (unins > 0 && res.gross && unins / res.gross > 0.1) out.push({ title: 'Ask for guarantees or credit insurance on risky accounts', why: 'Late items with no collateral or insurance carry the full loss. Cover reduces the allowance (B5.5.55).', amount: f(unins) + ' unprotected and late' });
  out.push({ title: 'Replace the example loss rates with your own history', why: 'The default rates are examples. Use how much you really lost in past years for each lateness group, adjusted for current and forecast conditions (B5.5.35, B5.5.52), before you rely on the number.' });
  return out.slice(0, 6);
}
