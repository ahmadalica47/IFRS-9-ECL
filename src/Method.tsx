import React from 'react';
import { Calc, Settings, scenarioRaw } from './ecl';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pc = (n: number, d = 2) => (n * 100).toFixed(d) + '%';
const SRC = [
    ['IFRS 9 Financial Instruments, IFRS Foundation (5.5.15 simplified approach, 5.5.17 measurement, B5.5.35 provision matrix)', 'https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs9.html'],
    ['IFRS 9 Illustrative Examples, Example 12 provision matrix and Examples 8-9 loss rates', 'https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs9-ie.html'],
    ['IASB review of IFRS 9 impairment: 30 days past due (credit risk presumed up) and 90 days past due (default presumed)', 'https://www.ifrs.org/content/dam/ifrs/meetings/2022/october/cmac/ap4-cmac-pir-ifrs-9-impairment.pdf'],
    ['IFRS 7 Financial Instruments: Disclosures (35F-35N credit risk, 35H-35I reconciliations, 35M credit risk grades)', 'https://www.ifrs.org/issued-standards/list-of-standards/ifrs-7-financial-instruments-disclosures/'],
    ['World Bank World Development Indicators (economic data)', 'https://data.worldbank.org/'],
];

export function Method({ res, s, where }: { res: any; s: Settings; where: string }) {
    const col: Calc[] = res.rows.filter((r: Calc) => !r.isSpec);
    const df = res.df as number;
    const top = col.slice().sort((a, b) => b.ecl - a.ecl)[0];
    const mB = res.scen[0].mult as number;
    const raw = (['base', 'up', 'down'] as const).map(k => scenarioRaw(s.factors, k));
    const wsum = s.wBase + s.wUp + s.wDown || 1;
    return <div className="card meth"><h4>How this was calculated</h4>
        <p className="cs">Every number follows these steps, using the settings you chose. Open each step to see the numbers behind it.</p>
        <details open><summary><b>1. Grouping</b> - invoices with similar risk are treated together</summary>
            <p className="p">IFRS 9 expects receivables to be grouped by shared credit risk (paragraph B5.5.5). Here the groups are <b>{s.segBy === 'none' ? 'one single group' : s.segBy === 'country' ? 'country' : 'segment / industry'}</b> and the <b>age of each invoice</b>. {s.segBy !== 'none' && 'A group can be made riskier or safer with a multiplier (1.0 = average).'} {res.coll.n} invoices ({fmt(res.coll.gross)}) are in the group calculation.</p>
            {Object.keys(s.segMult).some(k => s.segMult[k] !== 1) && <p className="p mut">Multipliers in use: {Object.entries(s.segMult).filter(([, v]) => v !== 1).map(([k, v]) => `${k} x${v}`).join(', ')}.</p>}
        </details>
        <details open><summary><b>2. Ageing</b> - how late is each invoice</summary>
            <p className="p">Days past due = reporting date ({s.reportDate}) minus due date. If your file has no due date, we use invoice date plus {s.termsDays} days. Invoices are then placed in age bands:</p>
            <div className="scroll"><table className="tb"><thead><tr><th>Band</th><th className="r">Invoices</th><th className="r">Owed</th><th className="r">Chance of not paying</th><th className="r">Share lost</th><th className="r">Expected loss</th></tr></thead>
                <tbody>{res.byBucket.map((b: any) => { const pds = s.buckets.find(x => x.label === b.key); return <tr key={b.key}><td>{b.key}</td><td className="r">{b.n}</td><td className="r">{fmt(b.gross)}</td><td className="r">{pds ? pc(pds.pd, 1) : ''}</td><td className="r">{pc(s.lgd, 0)}</td><td className="r">{fmt(b.ecl)}</td></tr>; })}
                    <tr className="tot"><td>Group total</td><td className="r">{res.coll.n}</td><td className="r">{fmt(res.coll.gross)}</td><td /><td /><td className="r">{fmt(res.coll.ecl)}</td></tr></tbody></table></div>
        </details>
        <details><summary><b>3. Default rates (PD)</b> - where the percentages come from</summary>
            <p className="p">Under the simplified approach (5.5.15) the loss allowance is always the loss expected over the whole life of the receivable. The usual tool is a <b>provision matrix</b> (B5.5.35): for each age band, the share of invoices that history shows ended unpaid, adjusted for what you expect from the economy.</p>
            <p className="p"><b>Rate for a band = amount that ended up lost in that band in the past / amount that was in that band.</b> For example, if 1,000,000 was 61-90 days late over the last 3 years and 66,000 of it was never collected, the rate is 6.6% (the 61-90 day rate used in IFRS 9 Illustrative Example 12). Use the helper in the settings to work out your own.</p>
            <p className="p"><b>PD or loss rate?</b> A loss rate from your write-off history already contains the share lost. Multiplying it again by an LGD would understate the allowance. This page is set to treat the band rates as <b>{s.rateType === 'loss' ? 'historical loss rates, so LGD is not applied again' : 'probabilities of default, multiplied by an LGD of ' + pc(s.lgd, 0)}</b>. Change it in step 3 if this does not match where your rates come from.</p>
            <p className="p"><b>Warning:</b> the rates in this page are illustrative starting values (1/3/8/15/35/60/90%). They are not from IFRS 9 and not from your history. IFRS 9 gives no table. Replace them before relying on the result.</p>
        </details>
        <details><summary><b>4. Share lost (LGD) and security</b></summary>
            <p className="p">If a customer does not pay you may still recover part. LGD is the share you expect to lose: <b>{s.rateType === 'loss' ? '100% (already inside your loss rates)' : pc(s.lgd, 0)}</b>{' '}(a per-row LGD column replaces it). Collateral, guarantees or credit insurance that are part of the contract terms and not recognised separately are taken into account (B5.5.55): exposure = amount + expected drawdown of undrawn limits ({pc(s.ccf, 0)} credit conversion factor, B5.5.31) - collateral. Enter collateral at what you expect to receive after the costs of getting and selling it.</p>
        </details>
        <details><summary><b>5. Economy (forward-looking) and scenarios</b></summary>
            <p className="p">IFRS 9 5.5.17 requires an unbiased, probability-weighted amount using reasonable and supportable information about past events, current conditions and forecasts. The page tests three economies and weights them:</p>
            <div className="scroll"><table className="tb"><thead><tr><th>Scenario</th><th className="r">Weight</th><th className="r">Risk multiplier</th><th className="r">Expected loss</th></tr></thead>
                <tbody>{['Normal', 'Better', 'Worse'].map((n, i) => <tr key={n}><td>{n}</td><td className="r">{pc(res.scen[i].w, 0)}</td><td className="r">{res.scen[i].mult.toFixed(3)}{(raw[i] < 0.5 || raw[i] > 3) ? ' (limit reached)' : ''}</td><td className="r">{fmt(res.scen[i].ecl)}</td></tr>)}
                    <tr className="tot"><td>Weighted result</td><td className="r">{pc(wsum / wsum, 0)}</td><td /><td className="r">{fmt(res.ecl)}</td></tr></tbody></table></div>
            <p className="p">Multiplier = e^(sum of strength x (scenario value - normal range)) for GDP growth, unemployment, inflation, lending rate and oil price, limited to between 0.5 and 3. A multiplier of 0.8 cuts every chance of not paying by 20%. Each invoice's chance of not paying = band rate x multiplier.</p>
            <p className="p"><b>Warning:</b> the "strength" numbers are illustrative assumptions, not estimated from data. Economic data from {where} is history, not a forecast. For a real IFRS 9 figure, enter your own forecasts (for example from the IMF World Economic Outlook) and strengths estimated from your own loss history.</p>
        </details>
        <details><summary><b>6. Time value of money (discounting)</b></summary>
            <p className="p">5.5.17(b) asks for the time value of money. Expected loss is multiplied by 1 / (1 + {pc(s.eir, 1)})^({s.months}/12) = <b>{df.toFixed(4)}</b>. Set months to 0 to turn this off (IFRS 9 Example 12 does not discount).</p>
        </details>
        <details><summary><b>7. Stages, significant increase in credit risk and default</b></summary>
            <p className="p">Each item is put in a stage, in this order: (1) the stage in your file, if you gave one (your own assessment, e.g. watch list, low credit risk 5.5.10, or cure); (2) flagged credit-impaired = Stage 3; (3) more than <b>{s.defaultDays}</b> days past due = Stage 3 (default presumed, B5.5.37); (4) more than <b>{s.sicrDays}</b> days past due = Stage 2 (significant increase presumed, 5.5.11); (5) PD now at least <b>{s.sicrMult}x</b> the PD at initial recognition = Stage 2 (5.5.9, only if both PD columns are in your file); otherwise Stage 1. Purchased or originated credit-impaired items are shown as POCI.</p>
            <p className="p">{s.method === 'simplified' ? 'You are using the simplified method (5.5.15): every item carries lifetime expected loss, so the stage does not change the amount. Stages are shown for disclosure (IFRS 7.35M). Only items you flagged credit-impaired (or set to Stage 3) get a 100% chance of not paying; other items past the default line keep their provision-matrix rate.' : 'General method (5.5.3-5.5.5): Stage 1 = 12-month expected loss; Stage 2 = lifetime expected loss; Stage 3 = lifetime expected loss with a 100% chance of default. For items with a maturity date, the 12-month PD is turned into a yearly default curve over the remaining life (constant hazard), and each year is discounted at the effective interest rate (B5.5.44). Items without a maturity date are treated as short-term receivables whose life is under 12 months, so their 12-month and lifetime loss are the same (Appendix A definition of 12-month expected credit losses).'}</p>
            <p className="p mut">Not modelled here and needing your own work: contract modifications (5.4.3), interest revenue on the net amount for Stage 3 (5.4.1(b)), and amortising exposure profiles for loans (the exposure is held flat over the life).</p>
        </details>
        <details open><summary><b>8. Specific provisions</b> - customers you assess one by one</summary>
            <p className="p">Customers with a specific provision are taken out of the group calculation above and provided for separately (IFRS 9 allows individual assessment, 5.5.4). {res.spec.n ? <>Specific provisions: <b>{fmt(res.spec.ecl)}</b> on {fmt(res.spec.gross)} owed ({res.spec.n} invoices). Group ECL: <b>{fmt(res.coll.ecl)}</b>. Total allowance: <b>{fmt(res.ecl)}</b>.</> : 'None are set, so all invoices are in the group calculation. Add them in step 3 under "Specific provisions".'}</p>
            {res.spec.n > 0 && <div className="scroll"><table className="tb"><thead><tr><th>Customer</th><th className="r">Owed</th><th className="r">Provision</th><th>Reason</th></tr></thead><tbody>{Object.entries(s.specific).filter(([, v]) => v.value > 0).map(([c, v]) => { const rs = res.spec.rows.filter((r: Calc) => r.customer === c); return <tr key={c}><td>{c}</td><td className="r">{fmt(rs.reduce((a: number, r: Calc) => a + r.amount, 0))}</td><td className="r">{fmt(rs.reduce((a: number, r: Calc) => a + r.ecl, 0))}</td><td>{v.note}</td></tr>; })}</tbody></table></div>}
        </details>
        {top && <details><summary><b>Worked example</b> - one invoice, start to finish</summary>
            <p className="p">{top.customer}{top.invNo ? ', invoice ' + top.invNo : ''}: owed {fmt(top.amount)}, {top.dpd > 0 ? top.dpd + ' days late' : 'not yet due'}, band <b>{top.bucket}</b>.</p>
            {top.pd >= 1 || top.maturity ? <p className="p">Exposure {fmt(top.base)}{top.collateral ? ' (after ' + fmt(top.collateral) + ' collateral)' : ''}, stage {top.stageKey} ({top.stageWhy}), horizon {top.horizon}, PD {pc(top.pd, 2)}{top.pd >= 1 ? ' (credit-impaired: the economy does not change a 100% PD)' : ' per year before the economy'}, share lost {pc(top.lgdUsed, 0)}{s.overlay ? ', overlay ' + pc(s.overlay, 0) : ''}. Normal scenario result: <b>{fmt(top.eclBase)}</b>. Better {fmt(top.eclUp)}, worse {fmt(top.eclDown)}; weighted: {fmt(top.ecl)}.</p>
            : <p className="p">Exposure {fmt(top.base)}{top.collateral ? ' (after ' + fmt(top.collateral) + ' collateral)' : ''} x chance of not paying {pc(top.pd, 2)}{top.pd !== (s.buckets.find(b => b.label === top.bucket)?.pd ?? top.pd) ? ' (band rate x group multiplier, or your PD column)' : ''} x economy {mB.toFixed(3)} (normal scenario){top.pd * mB > 1 ? ', capped at 100%' : ''} x share lost {pc(top.lgdUsed, 0)} x discount {Math.pow(1 + (top.eirIn ?? s.eir), -s.months / 12).toFixed(4)}{s.overlay ? ' x (1 + overlay ' + pc(s.overlay, 0) + ')' : ''}{top.poci ? ' - lifetime ECL at initial recognition ' + fmt(top.pociInitial) : ''} = <b>{fmt(top.eclBase)}</b>. The page does the same for the better ({fmt(top.eclUp)}) and worse ({fmt(top.eclDown)}) scenarios and weights the three ({pc(res.scen[0].w, 0)} / {pc(res.scen[1].w, 0)} / {pc(res.scen[2].w, 0)}) to get <b>{fmt(top.ecl)}</b> for this invoice.</p>}
        </details>}
        <p className="cs"><b>Sources</b></p>
        <ul className="srcs">{SRC.map(([t, u]) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{t}</a></li>)}</ul>
        <p className="cs">This page is a calculation aid. It follows the structure of IFRS 9 but its default rates and economic sensitivities are illustrative. It is not an audited figure.</p>
    </div>;
}
