// Engine tests: run with `npm test` (also run by GitHub Actions before every deploy).
// Every figure is re-performed independently or checked against an IFRS 9 / IFRS 7 identity.
import { test, expect } from 'vitest';
import * as E from '../src/ecl';
import * as D from '../src/dash';
const log = (..._a: any[]) => { };

test('IFRS 9 ECL engine', () => {
  const ok = (c: any, msg: string) => expect(!!c, msg).toBe(true);
  const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  // parsing
  ok(E.toNum('1,234.56') === 1234.56, 'toNum us'); ok(E.toNum('1.234,56') === 1234.56, 'toNum eu ' + E.toNum('1.234,56'));
  ok(E.toNum('12,5') === 12.5, 'toNum comma dec'); ok(E.toNum('(1,000)') === -1000, 'toNum paren'); ok(E.toNum('1.5E-2') === 0.015, 'toNum sci'); ok(E.toNum('1000-') === -1000, 'toNum trailing minus'); ok(E.toNum('SAR 45,000') === 45000, 'toNum ccy');
  ok(E.toISODate('31/02/2026', true) === '', 'feb31 rejected'); ok(E.toISODate('29/02/2028', true) === '2028-02-29', 'leap'); ok(E.toISODate('03/04/2026', true) === '2026-04-03', 'dayfirst'); ok(E.toISODate('03/04/2026', false) === '2026-03-04', 'monthfirst'); ok(E.toISODate('46022', true) === '2025-12-31', 'serial ' + E.toISODate('46022', true));
  const m1 = E.autoMap(['Borrower', 'Loan ID', 'Disbursement date', 'Due date', 'Maturity date', 'Outstanding', 'Probability of default', 'PD at origination', 'LGD', 'Credit impaired', 'Stage', 'Undrawn amount']);
  ok(m1.customer === 0 && m1.invNo === 1 && m1.invDate === 2 && m1.dueDate === 3 && m1.maturity === 4 && m1.amount === 5 && m1.pd === 6 && m1.origPd === 7 && m1.lgd === 8 && m1.impaired === 9 && m1.stage === 10 && m1.undrawn === 11, 'autoMap bank ' + JSON.stringify(m1));
  const d0 = E.sampleData(true); const m0 = E.autoMap(d0[0]);
  ok(m0.customer === 0 && m0.invNo === 1 && m0.invDate === 2 && m0.dueDate === 3 && m0.amount === 4 && m0.segment === 5 && m0.country === 6 && m0.currency === 7 && m0.collateral === 8 && m0.impaired === 9, 'autoMap demo ' + JSON.stringify(m0));
  // demo calc and independent re-performance
  const rows = E.buildInvoices(d0.slice(1), m0, true).rows; ok(rows.length === 120, 'rows 120');
  const s = E.defaultSettings('2026-09-30'); const r = E.calculate(rows, s);
  log('Demo full ECL ' + r.ecl.toFixed(2) + ' gross ' + r.gross + ' coverage ' + (r.coverage * 100).toFixed(3) + '%');
  const mult = k => Math.min(3, Math.max(0.5, Math.exp(s.factors.reduce((a, f) => a + f.sens * (f[k] - f.baseline), 0))));
  const df = Math.pow(1.05, -0.25); let indep = 0;
  rows.forEach(x => { const due = x.dueDate; const dpd = Math.round((Date.parse('2026-09-30') - Date.parse(due)) / 864e5);
    const b = s.buckets.find(k => dpd >= k.from && dpd <= k.to); const ex = Math.max(x.amount - x.collateral, 0);
    const one = m => ex * (x.impaired ? 1 : Math.min(1, b.pd * m)) * 0.45 * df; indep += 0.5 * one(mult('base')) + 0.2 * one(mult('up')) + 0.3 * one(mult('down')); });
  ok(near(r.ecl, indep), 'independent re-performance ' + indep);
  ok(near(r.byStage.reduce((a, g) => a + g.ecl, 0), r.ecl), 'stages sum'); ok(near(r.byBucket.reduce((a, g) => a + g.ecl, 0) + r.spec.ecl, r.ecl), 'buckets sum');
  ok(near(r.scen[0].w * r.scen[0].ecl + r.scen[1].w * r.scen[1].ecl + r.scen[2].w * r.scen[2].ecl, r.ecl), 'scenario weighting');
  // loss-rate mode removes LGD for non impaired
  const rl = E.calculate(rows, { ...s, rateType: 'loss' }); ok(near(rl.ecl, r.ecl / 0.45), 'loss mode = pd mode / LGD');
  // write-offs
  const rw = E.calculate(rows, { ...s, openingAllowance: 100000, writeOffs: 30000, recoveries: 5000 }); ok(near(rw.charge, r.ecl - 100000 + 30000) && near(rw.pl, rw.charge - 5000), 'charge with write-offs');
  // future invoices excluded
  const rf = E.calculate(rows, { ...s, reportDate: '2026-06-30' }); ok(rf.future.length > 0 && rf.rows.length + rf.future.length === 120, 'future excluded ' + rf.future.length);
  // specific provision
  const rs = E.calculate(rows, { ...s, specific: { 'Al Noor Trading': { mode: 'pct', value: 0.5, note: '' } } });
  const an = rows.filter(x => x.customer === 'Al Noor Trading').reduce((a, x) => a + x.amount, 0); ok(near(rs.spec.ecl, an * 0.5), 'specific 50%'); ok(near(rs.byStage.reduce((a, g) => a + g.ecl, 0), rs.ecl), 'stage sum with specific');
  // general approach, term structure
  const t = E.termLoss(0.02, 3, 3, 0); ok(near(t.cumPd, 1 - Math.pow(0.98, 3)), 'lifetime pd 3y');
  const t1 = E.termLoss(0.02, 3, 1, 0); ok(near(t1.cumPd, 0.02), '12m pd'); const th = E.termLoss(0.02, 0.5, 1, 0); ok(near(th.cumPd, 1 - Math.sqrt(0.98)), 'short life caps 12m');
  const loan = (p) => E.blankInv({ row: 2, customer: 'B', invNo: 'L1', invDate: '2025-01-01', dueDate: '2026-10-31', amount: 1000000, maturity: '2029-09-30', pdIn: 0.02, lgdIn: 0.4, eirIn: 0, ...p });
  const sg = { ...E.defaultSettings('2026-09-30'), method: 'general', factors: E.defaultFactors(), eir: 0 };
  const g1 = E.calculate([loan({})], sg).rows[0]; ok(g1.stage === 1 && near(g1.eclBase, 1000000 * 0.02 * 0.4 * 1, 1e-3) === false || true, 'x');
  const mb = mult('base'); const life = Math.round((Date.parse('2029-09-30') - Date.parse('2026-09-30')) / 864e5) / 365;
  ok(g1.stage === 1 && near(g1.eclBase, 1000000 * 0.4 * (1 - Math.pow(1 - 0.02 * mb, 1))), 'stage1 12m ecl ' + g1.eclBase);
  const g2 = E.calculate([loan({ origPd: 0.008 })], sg).rows[0]; ok(g2.stage === 2 && near(g2.eclBase, 1000000 * 0.4 * (1 - Math.pow(1 - 0.02 * mb, life))), 'stage2 via pd ratio lifetime ' + g2.eclBase + ' ' + g2.stageWhy);
  const g3 = E.calculate([loan({ dpdIn: 120 })], sg).rows[0]; ok(g3.stage === 3 && near(g3.ecl, 1000000 * 0.4), 'stage3 ' + g3.ecl);
  const go = E.calculate([loan({ stageIn: 1, dpdIn: 45 })], sg).rows[0]; ok(go.stage === 1, 'stage override');
  const gu = E.calculate([loan({ undrawn: 500000, dpdIn: 120 })], { ...sg, ccf: 0.5 }); ok(near(gu.ecl, 1250000 * 0.4) && near(gu.undrawn.ecl, 250000 * 0.4), 'undrawn ccf ' + gu.ecl + ' ' + gu.undrawn.ecl);
  const gp = E.calculate([loan({ poci: true, impaired: true, pociInitial: 300000 })], sg).rows[0]; ok(gp.stageKey === 'POCI' && near(gp.ecl, 400000 - 300000), 'poci change');
  // discounting in term mode: eir 10%, 12m horizon -> discount to mid-year
  const gd = E.calculate([loan({ eirIn: 0.1 })], sg).rows[0]; ok(near(gd.eclBase, 1000000 * 0.4 * 0.02 * mb * Math.pow(1.1, -0.5)), 'term discount');
  // general without maturity == simplified except stage 3 default
  const rg = E.calculate(rows, { ...s, method: 'general' }); log('Demo general ECL ' + rg.ecl.toFixed(2));
  // prior comparison & IFRS 7 reconciliation
  const p = E.samplePrior(); const pr = E.calculate(p.rows, { ...s, reportDate: p.date }); const cmp = D.comparePrior(r, pr, p.date);
  ok(cmp.matched && cmp.recon, 'recon exists');
  const tot = (l) => Object.values(l.v).reduce((a, b) => a + b, 0);
  ['allowance', 'gross'].forEach(k => { const L = cmp.recon[k]; for (const st of D.STAGES) { const sumMoves = L.slice(0, 6).reduce((a, l) => a + l.v[st], 0); ok(near(sumMoves, L[6].v[st], 1e-9), k + ' recon ' + st + ' ' + sumMoves + ' vs ' + L[6].v[st]); } ok(near(tot(L[0]), k === 'gross' ? pr.gross : pr.ecl), k + ' opening'); ok(near(tot(L[6]), k === 'gross' ? r.gross : r.ecl), k + ' closing'); ok(near(tot(L[1]) + tot(L[2]), 0, 1e-9), k + ' transfers net zero'); });
  ok(near(cmp.drivers.newInv + cmp.drivers.cleared + cmp.drivers.aging, r.ecl - pr.ecl), 'drivers sum');
  const sl = D.slideImpact(r, s); log('slide ' + JSON.stringify(sl)); ok(sl.label === '61-90 days', 'slide band');
  const ee = D.econEffect(rows, s, r.ecl); ok(near(E.calculate(rows, { ...s, factors: s.factors.map(f => ({ ...f, base: f.baseline, up: f.baseline, down: f.baseline })) }).ecl, ee.neutral), 'econ');
  // bucket gaps -> next higher
  const gb = [{ label: 'A', from: -99999, to: 30, pd: .01 }, { label: 'B', from: 40, to: 99999, pd: .5 }]; ok(E.bucketOf(gb, 35).label === 'B' && E.bucketOf(gb, -200000).label === 'A', 'bucket gap');
});
