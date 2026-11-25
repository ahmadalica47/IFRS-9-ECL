import React, { useMemo, useState } from 'react';
import { Calc, Inv, Settings, calculate } from './ecl';
import { Prior, ReconLine, Res, STAGES, actions, cohorts, econEffect, slideImpact } from './dash';
import { Method } from './Method';
import { Bars, C, Donut, HBars, Heatmap, RISK, Stack100, Waterfall } from './charts';
import { Btn, Card, Col, DataTable, Drawer, Info, Kpi, Note, STAGE_COLOR, STAGE_TEXT, Slider, Tabs, acct, fmt, pct, short } from './ui';

type TabKey = 'overview' | 'stages' | 'ageing' | 'customers' | 'scenarios' | 'movement' | 'accounting' | 'method';
type Filter = { stage: string | null; bucket: string | null; seg: string | null };
type Agg = { key: string; n: number; gross: number; ecl: number; rows: Calc[] };

const sum = (rows: Calc[], k: 'amount' | 'ecl' | 'eclBase' | 'eclUp' | 'eclDown') => rows.reduce((a, r) => a + r[k], 0);
function group(rows: Calc[], key: (r: Calc) => string, order?: string[]): Agg[] {
    const m = new Map<string, Calc[]>(); rows.forEach(r => { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
    const keys = order ? [...order.filter(k => m.has(k)), ...[...m.keys()].filter(k => !order.includes(k))] : [...m.keys()];
    return keys.map(k => { const a = m.get(k)!; return { key: k, n: a.length, gross: sum(a, 'amount'), ecl: sum(a, 'ecl'), rows: a }; });
}
const deltaOf = (now: number, before: number | null | undefined, inverse = true, isPct = false) => {
    if (before === null || before === undefined) return null; const d = now - before; if (Math.abs(d) < (isPct ? 0.0005 : 0.5)) return { txt: 'no change', bad: false };
    const txt = (d > 0 ? '▲ ' : '▼ ') + (isPct ? (Math.abs(d) * 100).toFixed(1) + ' pts' : before ? pct(Math.abs(d / before), 1) : fmt(Math.abs(d)));
    return { txt, bad: inverse ? d > 0 : d < 0 };
};

export function Dashboard({ res, s, inv, where, prior, onDlX, onDlC, copyText, onEdit, onApply }: {
    res: Res; s: Settings; inv: Inv[]; where: string; prior: Prior | null; onDlX: () => void; onDlC: () => void; copyText: () => string; onEdit: () => void; onApply: (p: Partial<Settings>) => void;
}) {
    const [tab, setTab] = useState<TabKey>('overview');
    const [f, setF] = useState<Filter>({ stage: null, bucket: null, seg: null });
    const [cust, setCust] = useState<string | null>(null);
    const [row, setRow] = useState<Calc | null>(null);
    const [copy, setCopy] = useState<string | null>(null);
    const toggle = (k: keyof Filter, v: string) => setF(p => ({ ...p, [k]: p[k] === v ? null : v }));
    const rows = useMemo(() => res.rows.filter(r => (!f.stage || r.stageKey === f.stage) && (!f.bucket || r.bucket === f.bucket) && (!f.seg || r.seg === f.seg)), [res, f]);
    const filtered = !!(f.stage || f.bucket || f.seg);
    const bandOrder = [...s.buckets.map(b => b.label), 'Specific provision'];
    const A = useMemo(() => { const econ = econEffect(inv, s, res.ecl); const slide = slideImpact(res, s); return { econ, slide, acts: actions(res, s, fmt, slide, econ) }; }, [res, s, inv]);

    const g = sum(rows, 'amount'), e = sum(rows, 'ecl');
    const overdue = sum(rows.filter(r => r.dpd > 0), 'amount'); const s23 = sum(rows.filter(r => r.stageKey !== 'Stage 1'), 'amount');
    const byStage = group(rows, r => r.stageKey, STAGES); const byBand = group(rows, r => r.bucket, bandOrder); const bySeg = group(rows, r => r.seg).sort((a, b) => b.ecl - a.ecl);
    const byCust = group(rows, r => r.customer).sort((a, b) => b.ecl - a.ecl);
    const stageAll = group(res.rows.filter(r => (!f.bucket || r.bucket === f.bucket) && (!f.seg || r.seg === f.seg)), r => r.stageKey, STAGES);
    const P = prior?.res; const unit = s.method === 'general' ? 'exposures' : 'invoices';

    const tabs: { key: TabKey; label: string; badge?: string | number }[] = [
        { key: 'overview', label: 'Overview' }, { key: 'stages', label: 'Stages 1-2-3' }, { key: 'ageing', label: 'Ageing & segments' }, { key: 'customers', label: 'Customers & ' + unit },
        { key: 'scenarios', label: 'Economy & what-if' }, { key: 'movement', label: 'Movement' }, { key: 'accounting', label: 'Journal & disclosure' }, { key: 'method', label: 'How it is calculated' },
    ];

    return <div className="dash">
        {/* ---------- headline ---------- */}
        <div className="hero">
            <div className="hero-l">
                <div className="hero-tags"><span>As at {s.reportDate}</span><span>{s.method === 'simplified' ? 'Simplified approach (lifetime)' : 'General approach (3 stages)'}</span><span>{where}</span>{s.measure === 'fvoci' && <span>FVOCI</span>}</div>
                <p className="hero-k">Loss allowance to book</p>
                <h2>{fmt(res.ecl)}</h2>
                <p className="hero-p">That is <b>{pct(res.coverage, 2)}</b> of the <b>{fmt(res.gross)}</b> owed across {res.rows.length} {unit}.{s.measure === 'ac' && <> Net carrying amount <b>{fmt(res.gross - res.ecl + res.undrawn.ecl)}</b>.</>}
                    {' '}P&L charge this period <b>{acct(res.charge)}</b>.{res.undrawn.ecl > 0 && <> Includes {fmt(res.undrawn.ecl)} on undrawn commitments (shown as a provision).</>}</p>
            </div>
            <div className="hero-r">
                <Btn kind="light" onClick={onDlX}>Download Excel report</Btn>
                <Btn kind="ghost" onClick={onDlC}>{unit === 'invoices' ? 'Invoice' : 'Exposure'} list (CSV)</Btn>
                <Btn kind="ghost" onClick={() => setCopy(copyText())}>Copy for Excel</Btn>
                <Btn kind="ghost" onClick={onEdit}>Edit assumptions</Btn>
            </div>
        </div>
        {res.future.length > 0 && <Note tone="warn" title={`${res.future.length} ${unit} left out`}>They are dated after the reporting date ({fmt(res.future.reduce((a, r) => a + r.amount, 0))} in total).</Note>}
        {res.clamped.length > 0 && <Note tone="warn" title="An economy scenario hit its limit">The risk multiplier was capped at 0.5 to 3. Check the economic factors in step 3.</Note>}

        <Tabs tabs={tabs} value={tab} onChange={setTab} />

        {/* ---------- filter bar ---------- */}
        {['overview', 'stages', 'ageing', 'customers'].includes(tab) && <div className="fbar">
            <span className="mut">Filter:</span>
            <select className="in sm" value={f.stage || ''} onChange={e => setF({ ...f, stage: e.target.value || null })}><option value="">All stages</option>{STAGES.filter(k => res.byStage.some(x => x.key === k)).map(k => <option key={k}>{k}</option>)}</select>
            <select className="in sm" value={f.bucket || ''} onChange={e => setF({ ...f, bucket: e.target.value || null })}><option value="">All age bands</option>{bandOrder.filter(k => res.rows.some(r => r.bucket === k)).map(k => <option key={k}>{k}</option>)}</select>
            <select className="in sm" value={f.seg || ''} onChange={e => setF({ ...f, seg: e.target.value || null })}><option value="">All segments</option>{[...new Set(res.rows.map(r => r.seg))].sort().map(k => <option key={k}>{k}</option>)}</select>
            {filtered ? <Btn small kind="ghost" onClick={() => setF({ stage: null, bucket: null, seg: null })}>Clear filters</Btn> : <span className="mut fbar-h">Tip: click any bar, slice or stage card to filter.</span>}
        </div>}

        {/* ---------- OVERVIEW ---------- */}
        {tab === 'overview' && <>
            <div className="kpis">
                <Kpi label="Expected credit loss" value={fmt(e)} tone="#0f766e" delta={!filtered ? deltaOf(e, P ? P.ecl : s.openingAllowance > 0 ? s.openingAllowance : null) : null} sub={filtered ? pct(res.ecl ? e / res.ecl : 0, 0) + ' of total' : 'no earlier period'} info="The loss allowance: the amount you expect not to collect, weighted over three economic scenarios (IFRS 9 5.5.17)." />
                <Kpi label="Gross amount owed" value={fmt(g)} tone="#4f46e5" delta={!filtered && P ? deltaOf(g, P.gross, false) : null} sub={rows.length + ' ' + unit} />
                <Kpi label="Coverage" value={pct(g ? e / g : 0, 2)} tone="#7c3aed" delta={!filtered && P ? deltaOf(g ? e / g : 0, P.coverage, true, true) : null} sub="loss / owed" info="Expected loss as a share of the gross amount. Compare it between periods and with peers." />
                <Kpi label="Overdue" value={pct(g ? overdue / g : 0, 0)} tone="#d97706" sub={short(overdue) + ' past due'} />
                <Kpi label="In Stage 2 or 3" value={pct(g ? s23 / g : 0, 0)} tone="#e11d48" sub={short(s23) + ' at higher risk'} info="Share of the amount where credit risk has increased significantly (Stage 2) or that is credit-impaired (Stage 3)." onClick={() => setTab('stages')} />
            </div>
            <StageStrip groups={stageAll} total={sum(res.rows, 'amount')} s={s} selected={f.stage} onSelect={k => toggle('stage', k)} />
            <div className="g2">
                <Card title="Where the expected loss sits" sub="By age band (days past due). Click a bar to filter." info="Provision matrix by days past due (IFRS 9 B5.5.35). Older items carry higher rates.">
                    <Bars labels={byBand.map(b => b.key)} series={[{ name: 'Expected loss', values: byBand.map(b => b.ecl) }]} perBar={RISK} selected={f.bucket} onSelect={k => toggle('bucket', k)} fmtV={fmt}
                        tipExtra={i => <div className="mut">Owed {fmt(byBand[i].gross)} | coverage {pct(byBand[i].gross ? byBand[i].ecl / byBand[i].gross : 0, 1)}</div>} />
                </Card>
                <Card title="Amount owed by stage" sub="Hover for detail, click to filter.">
                    <Donut parts={byStage.map(x => ({ label: x.key, value: x.gross, color: STAGE_COLOR[x.key] }))} center={short(g)} centerSub="owed" selected={f.stage} onSelect={k => toggle('stage', k)} />
                </Card>
            </div>
            <div className="g2">
                <Card title={`Top ${s.method === 'general' ? 'borrowers' : 'customers'} by expected loss`} sub="Click a name for every item and its calculation.">
                    <HBars items={byCust.slice(0, 7).map(c => ({ label: c.key, value: c.ecl, sub: `owes ${fmt(c.gross)} | ${pct(c.gross ? c.ecl / c.gross : 0, 1)} coverage` }))} onSelect={setCust} />
                </Card>
                <Card title="What to do next" sub="Actions that lower the allowance or the risk.">
                    <ol className="acts">{A.acts.slice(0, 5).map((a, i) => <li key={i}><div><b>{a.title}</b>{a.amount && <em>{a.amount}</em>}</div><span>{a.why}</span></li>)}</ol>
                </Card>
            </div>
        </>}

        {/* ---------- STAGES ---------- */}
        {tab === 'stages' && <>
            <StageStrip groups={stageAll} total={sum(res.rows, 'amount')} s={s} selected={f.stage} onSelect={k => toggle('stage', k)} />
            <Card title="How items are put into stages" sub={s.method === 'simplified' ? 'Simplified approach: every item already carries lifetime expected loss (5.5.15), so the stage does not change the amount. Stages are still needed for the IFRS 7 disclosure.' : 'General approach (5.5.3-5.5.5): the stage decides whether 12-month or lifetime expected loss is booked.'}>
                <div className="rules">
                    <div style={{ ['--c' as any]: STAGE_COLOR['Stage 1'] }}><b>Stage 1</b><span>Up to {s.sicrDays} days past due and no other sign of increased risk.</span><em>{s.method === 'general' ? '12-month expected loss' : 'Lifetime (simplified)'}</em></div>
                    <div style={{ ['--c' as any]: STAGE_COLOR['Stage 2'] }}><b>Stage 2</b><span>More than {s.sicrDays} days past due (5.5.11), or PD at least {s.sicrMult}x the PD at the start (5.5.9), or set to 2 in your file.</span><em>Lifetime expected loss</em></div>
                    <div style={{ ['--c' as any]: STAGE_COLOR['Stage 3'] }}><b>Stage 3</b><span>More than {s.defaultDays} days past due (B5.5.37), flagged credit-impaired, or set to 3 in your file.</span><em>{s.method === 'general' ? 'Lifetime, PD 100%' : 'Lifetime; PD 100% if flagged'}</em></div>
                    <div style={{ ['--c' as any]: STAGE_COLOR.POCI }}><b>POCI</b><span>Bought or lent when already credit-impaired (5.5.13).</span><em>Change in lifetime loss</em></div>
                </div>
            </Card>
            <div className="g2">
                <Card title="Share of amount and of loss by stage" sub="Most of the loss usually sits in a small share of the amount.">
                    <Stack100 colors={STAGE_COLOR} onSelect={k => toggle('stage', k)} rows={[{ label: 'Owed', parts: byStage.map(x => ({ key: x.key, value: x.gross })) }, { label: 'Expected loss', parts: byStage.map(x => ({ key: x.key, value: x.ecl })) }]} />
                    <table className="tbl mt"><thead><tr><th>Stage</th><th className="r">Items</th><th className="r">Owed</th><th className="r">Expected loss</th><th className="r">Coverage</th></tr></thead>
                        <tbody>{byStage.map(x => <tr key={x.key} className="click" onClick={() => toggle('stage', x.key)}><td><i className="dot" style={{ background: STAGE_COLOR[x.key] }} />{x.key}</td><td className="r">{x.n}</td><td className="r">{fmt(x.gross)}</td><td className="r">{fmt(x.ecl)}</td><td className="r">{pct(x.gross ? x.ecl / x.gross : 0, 2)}</td></tr>)}
                            <tr className="tot"><td>Total</td><td className="r">{rows.length}</td><td className="r">{fmt(g)}</td><td className="r">{fmt(e)}</td><td className="r">{pct(g ? e / g : 0, 2)}</td></tr></tbody></table>
                </Card>
                <Card title="Why items are in each stage" sub="The rule that placed each item, so the staging can be checked.">
                    <table className="tbl"><thead><tr><th>Stage</th><th>Reason</th><th className="r">Items</th><th className="r">Owed</th></tr></thead>
                        <tbody>{group(rows, r => r.stageKey + '|' + r.stageWhy).sort((a, b) => a.key.localeCompare(b.key)).map(x => { const [st, why] = x.key.split('|'); return <tr key={x.key}><td><i className="dot" style={{ background: STAGE_COLOR[st] }} />{st}</td><td>{why}</td><td className="r">{x.n}</td><td className="r">{fmt(x.gross)}</td></tr>; })}</tbody></table>
                </Card>
            </div>
            <Card title="Credit risk by age band and stage (IFRS 7.35M)" sub="Gross amount and expected loss for each age band in each stage.">
                <div className="scroll"><table className="tbl"><thead><tr><th>Age band</th>{byStage.map(x => <th key={x.key} className="r">{x.key} owed</th>)}{byStage.map(x => <th key={x.key + 'e'} className="r">{x.key} loss</th>)}</tr></thead>
                    <tbody>{byBand.map(b => <tr key={b.key}><td>{b.key}</td>{byStage.map(x => <td key={x.key} className="r">{fmt(sum(b.rows.filter(r => r.stageKey === x.key), 'amount'))}</td>)}{byStage.map(x => <td key={x.key + 'e'} className="r">{fmt(sum(b.rows.filter(r => r.stageKey === x.key), 'ecl'))}</td>)}</tr>)}</tbody></table></div>
            </Card>
        </>}

        {/* ---------- AGEING & SEGMENTS ---------- */}
        {tab === 'ageing' && <>
            <Card title="Owed and expected loss by age band" sub="Click a band to filter the whole dashboard.">
                <Bars labels={byBand.map(b => b.key)} series={[{ name: 'Owed', values: byBand.map(b => b.gross) }, { name: 'Expected loss', values: byBand.map(b => b.ecl) }]} colors={['#a5b4fc', '#e11d48']} selected={f.bucket} onSelect={k => toggle('bucket', k)} fmtV={fmt} />
                <table className="tbl mt"><thead><tr><th>Age band</th><th className="r">Rate used</th><th className="r">Items</th><th className="r">Owed</th><th className="r">Expected loss</th><th className="r">Coverage</th></tr></thead>
                    <tbody>{byBand.map(b => { const bk = s.buckets.find(x => x.label === b.key); return <tr key={b.key} className="click" onClick={() => toggle('bucket', b.key)}><td>{b.key}</td><td className="r">{bk ? pct(bk.pd, 1) : 'individual'}</td><td className="r">{b.n}</td><td className="r">{fmt(b.gross)}</td><td className="r">{fmt(b.ecl)}</td><td className="r">{pct(b.gross ? b.ecl / b.gross : 0, 1)}</td></tr>; })}</tbody></table>
            </Card>
            {bySeg.length > 1 && <Card title="Coverage heatmap: segment x age band" sub="Darker = higher share expected to be lost. Click a cell to filter by both.">
                <Heatmap rows={bySeg.map(x => x.key)} cols={byBand.map(b => b.key)} cell={(sg, bd) => { const rs = rows.filter(r => r.seg === sg && r.bucket === bd); return { gross: sum(rs, 'amount'), ecl: sum(rs, 'ecl') }; }} onSelect={(sg, bd) => setF({ ...f, seg: sg, bucket: bd })} />
            </Card>}
            <div className="g2">
                <Card title="Expected loss by segment" sub="Click to filter.">
                    <HBars items={bySeg.map(x => ({ label: x.key, value: x.ecl, sub: `owes ${fmt(x.gross)} | ${pct(x.gross ? x.ecl / x.gross : 0, 1)}` }))} onSelect={k => toggle('seg', k)} selected={f.seg} color={C.teal2} />
                </Card>
                <Card title="When the open items were issued" sub="Old months still unpaid are a warning sign.">
                    {(() => { const co = cohorts(rows); return <Bars height={200} labels={co.map(c => c.key)} series={[{ name: 'Owed', values: co.map(c => c.owed) }, { name: 'Expected loss', values: co.map(c => c.ecl) }]} colors={['#a5b4fc', '#f59e0b']} fmtV={fmt} />; })()}
                </Card>
            </div>
        </>}

        {/* ---------- CUSTOMERS & ITEMS ---------- */}
        {tab === 'customers' && <>
            <Card title={s.method === 'general' ? 'Borrowers' : 'Customers'} sub="Click a row to see every item and how its loss was worked out.">
                <DataTable rows={byCust} onRow={c => setCust(c.key)} initialSort={{ key: 'ecl', dir: -1 }} cols={[
                    { key: 'name', label: 'Name', get: c => c.key },
                    { key: 'n', label: 'Items', get: c => c.n, num: true },
                    { key: 'gross', label: 'Owed', get: c => c.gross, show: c => fmt(c.gross), num: true },
                    { key: 'ecl', label: 'Expected loss', get: c => c.ecl, show: c => fmt(c.ecl), num: true },
                    { key: 'cov', label: 'Coverage', get: c => c.gross ? c.ecl / c.gross : 0, show: c => pct(c.gross ? c.ecl / c.gross : 0, 1), num: true },
                    { key: 'st', label: 'Worst stage', get: c => c.rows.reduce((a, r) => Math.max(a, r.poci ? 4 : r.stage), 0), show: c => { const w = c.rows.reduce((a, r) => (r.poci ? 4 : r.stage) > a.v ? { v: r.poci ? 4 : r.stage, k: r.stageKey } : a, { v: 0, k: '' }); return <span className="badge" style={{ background: STAGE_COLOR[w.k] }}>{w.k}</span>; }, num: true },
                ] as Col<Agg>[]} />
            </Card>
            <Card title={'Every ' + (unit === 'invoices' ? 'invoice' : 'exposure')} sub="Click a row for the step-by-step calculation.">
                <DataTable rows={rows} onRow={setRow} initialSort={{ key: 'ecl', dir: -1 }} cols={itemCols(s)} />
            </Card>
        </>}

        {/* ---------- ECONOMY & WHAT-IF ---------- */}
        {tab === 'scenarios' && <Scenarios res={res} s={s} inv={inv} where={where} econ={A.econ} onApply={onApply} />}

        {/* ---------- MOVEMENT ---------- */}
        {tab === 'movement' && <Movement res={res} s={s} prior={prior} onEdit={onEdit} />}

        {/* ---------- ACCOUNTING ---------- */}
        {tab === 'accounting' && <Accounting res={res} s={s} />}

        {tab === 'method' && <Method res={res} s={s} where={where} />}

        {/* ---------- drill-downs ---------- */}
        {cust && (() => { const rs = res.rows.filter(r => r.customer === cust); const cg = sum(rs, 'amount'), ce = sum(rs, 'ecl');
            return <Drawer title={cust} sub={`${rs.length} item${rs.length === 1 ? '' : 's'} | owes ${fmt(cg)} | expected loss ${fmt(ce)} (${pct(cg ? ce / cg : 0, 1)})`} onClose={() => setCust(null)}>
                {rs.some(r => r.isSpec) && <Note title="Specific provision">This customer is assessed individually: {s.specific[cust]?.note || 'no reason entered'}.</Note>}
                <DataTable rows={rs} onRow={r => { setRow(r); }} search={false} pageSize={20} initialSort={{ key: 'ecl', dir: -1 }} cols={itemCols(s).filter(c => c.key !== 'cust')} />
                <p className="mut">Click an item for its calculation.</p>
            </Drawer>; })()}
        {row && <Drawer title={(row.invNo || 'Row ' + row.row) + ' - ' + row.customer} sub={`${row.stageKey} | ${row.bucket} | ${row.horizon}`} onClose={() => setRow(null)}><Trace r={row} s={s} res={res} /></Drawer>}
        {copy !== null && <Drawer title="Copy the results into Excel" sub="Use this if the download button is blocked in your browser." onClose={() => setCopy(null)}>
            <textarea className="ta" readOnly value={copy} onFocus={e => e.currentTarget.select()} />
            <p className="mut">Click inside the box, press Ctrl+A then Ctrl+C, and paste into cell A1 of a new Excel sheet.</p></Drawer>}
    </div>;
}

function itemCols(s: Settings): Col<Calc>[] {
    return [
        { key: 'cust', label: s.method === 'general' ? 'Borrower' : 'Customer', get: r => r.customer },
        { key: 'no', label: 'Reference', get: r => r.invNo || r.invDate },
        { key: 'dpd', label: 'Days late', get: r => r.dpd, show: r => Math.max(0, r.dpd), num: true },
        { key: 'amt', label: 'Owed', get: r => r.amount, show: r => fmt(r.amount), num: true },
        { key: 'st', label: 'Stage', get: r => r.stageKey, show: r => <span className="badge" style={{ background: STAGE_COLOR[r.stageKey] }}>{r.stageKey}</span> },
        { key: 'pd', label: 'PD', get: r => r.pd, show: r => pct(r.pd, 2), num: true },
        { key: 'ecl', label: 'Expected loss', get: r => r.ecl, show: r => fmt(r.ecl), num: true },
    ];
}

function StageStrip({ groups, total, s, selected, onSelect }: { groups: Agg[]; total: number; s: Settings; selected: string | null; onSelect: (k: string) => void }) {
    const show = STAGES.filter(k => k !== 'POCI' || groups.some(x => x.key === 'POCI'));
    return <div className={'stages n' + show.length}>{show.map(k => { const x = groups.find(y => y.key === k) || { n: 0, gross: 0, ecl: 0 }; const t = STAGE_TEXT[k];
        return <button type="button" key={k} className={'stc' + (selected === k ? ' on' : '') + (selected && selected !== k ? ' dim' : '')} style={{ ['--c' as any]: STAGE_COLOR[k] }} onClick={() => onSelect(k)}>
            <div className="stc-h"><b>{k}</b><span>{t.title}</span></div>
            <div className="stc-v">{fmt(x.ecl)}</div>
            <div className="stc-m"><span>{x.n} item{x.n === 1 ? '' : 's'}</span><span>owed {short(x.gross)}</span><span>coverage {pct(x.gross ? x.ecl / x.gross : 0, 1)}</span></div>
            <div className="stc-bar"><i style={{ width: (total ? x.gross / total * 100 : 0) + '%' }} /></div>
            <small>{s.method === 'simplified' && k !== 'POCI' ? 'Lifetime expected loss (simplified)' : t.horizon}</small>
        </button>; })}</div>;
}

function Trace({ r, s, res }: { r: Calc; s: Settings; res: Res }) {
    const w = res.scen; const band = s.buckets.find(b => b.label === r.bucket);
    const steps: [string, React.ReactNode, string?][] = [
        ['Amount owed', fmt(r.amount)],
        ...(r.undrawn ? [['Undrawn commitment x CCF', fmt(r.undrawn) + ' x ' + pct(s.ccf, 0), 'B5.5.31'] as [string, string, string]] : []),
        ...(r.collateral ? [['Less collateral / insurance', '(' + fmt(r.collateral) + ')', 'B5.5.55'] as [string, string, string]] : []),
        ['Exposure at default', <b key="e">{fmt(r.base)}</b>],
        ['Days past due', `${Math.max(0, r.dpd)} days ${r.dpdIn !== null ? '(from your file)' : r.dueDate ? '(from due date)' : '(invoice date + ' + s.termsDays + ' days terms)'}`],
        ['Stage', <span key="s"><span className="badge" style={{ background: STAGE_COLOR[r.stageKey] }}>{r.stageKey}</span> {r.stageWhy}</span>, '5.5.3-5.5.11'],
        ['Horizon', r.horizon, s.method === 'general' ? '5.5.5 / B5.5.43' : '5.5.15'],
        ['PD before economy', r.isSpec ? 'Individual assessment' : pct(r.pd, 2) + (r.pdIn !== null ? ' (your PD column' + (r.maturity ? ', 12-month' : '') + ')' : band ? ' (band "' + band.label + '")' : '')],
        ['Share lost (LGD)', r.isSpec ? '-' : pct(r.lgdUsed, 0) + (r.lgdIn !== null ? ' (your file)' : s.rateType === 'loss' ? ' (inside loss rate)' : '')],
        ['Normal economy', fmt(r.eclBase) + '  (weight ' + pct(w[0].w, 0) + ', risk x' + w[0].mult.toFixed(3) + ')'],
        ['Better economy', fmt(r.eclUp) + '  (weight ' + pct(w[1].w, 0) + ', risk x' + w[1].mult.toFixed(3) + ')'],
        ['Worse economy', fmt(r.eclDown) + '  (weight ' + pct(w[2].w, 0) + ', risk x' + w[2].mult.toFixed(3) + ')'],
        ...(r.poci ? [['Less lifetime loss at initial recognition', '(' + fmt(r.pociInitial) + ')', '5.5.14'] as [string, string, string]] : []),
    ];
    return <div>
        <div className="trace">{steps.map(([k, v, ref], i) => <div key={i} className="tr-r"><span>{k}{ref && <small className="ref">{ref}</small>}</span><span>{v}</span></div>)}</div>
        <div className="tr-tot"><span>Expected credit loss (probability-weighted)</span><b>{fmt(r.ecl)}</b></div>
        <p className="mut">{r.isSpec ? 'Specific provision allocated from the amount you set for this customer.' : r.pd >= 1 ? 'Credit-impaired: exposure x 100% x LGD x discount' + (s.overlay ? ' x (1 + overlay)' : '') + '. The economy does not change a 100% PD.' : r.maturity
            ? 'Term structure: the 12-month PD is spread over each year of the horizon, discounted at the EIR to the middle of each year (B5.5.44).'
            : 'Each scenario: exposure x min(100%, PD x risk multiplier) x LGD x discount ' + Math.pow(1 + (r.eirIn ?? s.eir), -s.months / 12).toFixed(4) + (s.overlay ? ' x (1 + ' + pct(s.overlay, 0) + ' overlay)' : '') + '.'}</p>
    </div>;
}

function Scenarios({ res, s, inv, where, econ, onApply }: { res: Res; s: Settings; inv: Inv[]; where: string; econ: { neutral: number; delta: number; pct: number }; onApply: (p: Partial<Settings>) => void }) {
    const [wd, setWd] = useState(s.wDown / (s.wBase + s.wUp + s.wDown || 1));
    const [stress, setStress] = useState(0); const [lgdAdj, setLgdAdj] = useState(0); const [ov, setOv] = useState(s.overlay);
    const segs = useMemo(() => [...new Set(res.rows.map(r => r.seg))], [res]);
    const what = useMemo(() => {
        const rest = (s.wBase + s.wUp) || 1; const k = (1 - wd) / rest;
        const p: Partial<Settings> = { wDown: wd, wBase: s.wBase * k, wUp: s.wUp * k, overlay: ov, lgd: Math.min(1, Math.max(0, s.lgd + lgdAdj)),
            segMult: Object.fromEntries(segs.map(sg => [sg, (s.segMult[sg] ?? 1) * (1 + stress)])) };
        return { p, res: calculate(inv, { ...s, ...p }) };
    }, [wd, stress, lgdAdj, ov, s, inv, segs]);
    const d = what.res.ecl - res.ecl; const changed = Math.abs(d) >= 0.5;
    const reset = () => { setWd(s.wDown / (s.wBase + s.wUp + s.wDown || 1)); setStress(0); setLgdAdj(0); setOv(s.overlay); };
    const names = ['Normal', 'Better', 'Worse'];
    return <>
        <div className="scen">{[1, 0, 2].map(i => { const x = res.scen[i]; return <div key={i} className={'sc sc' + i}><small>{names[i]} economy</small><b>{fmt(x.ecl)}</b><span>weight {pct(x.w, 0)} | risk x{x.mult.toFixed(2)}</span></div>; })}
            <div className="sc sc-w"><small>Probability-weighted</small><b>{fmt(res.ecl)}</b><span>normal economy only: {fmt(econ.neutral)}</span></div></div>
        <div className="g2">
            <Card title="What-if: test your assumptions" sub="Move the sliders and see the effect at once. Nothing changes until you press Apply." info="Useful for sensitivity disclosures (IFRS 7.35G) and for management challenge of the assumptions.">
                <Slider label="Weight of the worse economy" value={wd} min={0} max={1} step={0.05} onChange={setWd} show={pct(wd, 0)} />
                <Slider label="Stress all default rates (PD)" value={stress} min={-0.5} max={1} step={0.05} onChange={setStress} show={(stress >= 0 ? '+' : '') + pct(stress, 0)} />
                {s.rateType === 'pd' && <Slider label="Change share lost (LGD)" value={lgdAdj} min={-0.2} max={0.3} step={0.05} onChange={setLgdAdj} show={pct(Math.min(1, Math.max(0, s.lgd + lgdAdj)), 0)} />}
                <Slider label="Management overlay" value={ov} min={0} max={0.3} step={0.01} onChange={setOv} show={pct(ov, 0)} />
                <div className={'wi ' + (d > 0.5 ? 'up' : d < -0.5 ? 'down' : '')}><div><small>Allowance with these changes</small><b>{fmt(what.res.ecl)}</b></div>
                    <div><small>Change</small><b>{changed ? (d > 0 ? '+' : '-') + fmt(Math.abs(d)) + ' (' + pct(Math.abs(d) / (res.ecl || 1), 1) + ')' : 'none'}</b></div></div>
                <div className="row"><Btn disabled={!changed} onClick={() => onApply(what.p)}>Apply to my assumptions</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></div>
                {s.rateType === 'pd' && lgdAdj !== 0 && <p className="mut">The LGD change does not affect rows that have their own LGD in your file.</p>}
            </Card>
            <Card title="Sensitivity: if one economy happened for sure" sub="Expected loss with 100% weight on each scenario.">
                <Bars height={210} labels={['Better', 'Normal', 'Worse', 'Weighted']} perBar={['#10b981', '#6366f1', '#e11d48', '#0f766e']} series={[{ name: 'Expected loss', values: [res.scen[1].ecl, res.scen[0].ecl, res.scen[2].ecl, res.ecl] }]} fmtV={fmt} />
                <p className="mut">The economy {econ.delta >= 0 ? 'adds' : 'removes'} {fmt(Math.abs(econ.delta))} ({pct(Math.abs(econ.pct), 1)}) compared with a normal year.</p>
            </Card>
        </div>
        <Card title={'Economic factors (' + where + ')'} sub="Edit them in step 3. World Bank figures are past actuals: enter your own forecasts for a reportable figure (IFRS 9 5.5.17).">
            <div className="scroll"><table className="tbl"><thead><tr><th>Factor</th><th className="r">Normal range</th><th className="r">Normal</th><th className="r">Better</th><th className="r">Worse</th><th className="r">Strength</th><th>Source</th></tr></thead>
                <tbody>{s.factors.map(x => <tr key={x.name}><td>{x.name}</td><td className="r">{x.baseline}</td><td className="r">{x.base}</td><td className="r">{x.up}</td><td className="r">{x.down}</td><td className="r">{x.sens}</td><td className="mut">{x.src || 'Manual default'}</td></tr>)}</tbody></table></div>
        </Card>
    </>;
}

function Movement({ res, s, prior, onEdit }: { res: Res; s: Settings; prior: Prior | null; onEdit: () => void }) {
    if (!prior) return <Card title="Compare with last period"><Note title="No earlier period added">To see what changed (new items, items paid, items that got older, and the IFRS 7 reconciliation by stage), add last period's file in step 3. I will not invent a trend.</Note><Btn onClick={onEdit}>Add last period's file</Btn></Card>;
    const P = prior.res; const rc = prior.recon;
    const tot = (l: ReconLine) => STAGES.reduce((a, k) => a + l.v[k], 0);
    const sk = rc ? STAGES.filter(k => rc.allowance.some(l => Math.abs(l.v[k]) >= 0.5) || rc.gross.some(l => Math.abs(l.v[k]) >= 0.5)) : [];
    const T = ({ title, lines }: { title: string; lines: ReconLine[] }) => <div className="scroll"><table className="tbl"><thead><tr><th>{title}</th>{sk.map(k => <th key={k} className="r">{k}</th>)}<th className="r">Total</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={l.label} className={i === 0 || i === lines.length - 1 ? 'tot' : ''}><td>{l.label}</td>{sk.map(k => <td key={k} className="r">{acct(l.v[k])}</td>)}<td className="r">{acct(tot(l))}</td></tr>)}</tbody></table></div>;
    return <>
        <div className="kpis">
            <Kpi label={'Allowance at ' + prior.date} value={fmt(P.ecl)} tone="#64748b" sub="recalculated, today's assumptions" />
            <Kpi label={'Allowance at ' + s.reportDate} value={fmt(res.ecl)} tone="#0f766e" delta={deltaOf(res.ecl, P.ecl)} />
            <Kpi label="Owed" value={fmt(res.gross)} tone="#4f46e5" delta={deltaOf(res.gross, P.gross, false)} />
            <Kpi label="Coverage" value={pct(res.coverage, 2)} tone="#7c3aed" delta={deltaOf(res.coverage, P.coverage, true, true)} />
        </div>
        {rc ? <>
            <Card title="Why the allowance moved" sub={`From ${prior.date} to ${s.reportDate}. Red raises the allowance, green lowers it.`}>
                <Waterfall steps={[{ label: 'Opening allowance', value: tot(rc.allowance[0]), total: true }, { label: 'New items', value: tot(rc.allowance[3]) }, { label: 'Paid, settled or written off', value: tot(rc.allowance[4]) }, { label: 'Remeasurement of open items', value: tot(rc.allowance[5]) }, { label: 'Closing allowance', value: tot(rc.allowance[6]), total: true }]} />
            </Card>
            <Card title="Reconciliation by stage (IFRS 7.35H and 35I)" sub="Transfers are shown at the opening allowance of the item that moved. The rest of its change is in remeasurement.">
                <T title="Loss allowance" lines={rc.allowance} /><T title="Gross carrying amount" lines={rc.gross} />
                {s.openingAllowance > 0 && Math.abs(s.openingAllowance - P.ecl) >= 1 && <Note tone="warn" title="Booked opening allowance differs">You booked {fmt(s.openingAllowance)}; last period's file recalculated today gives {fmt(P.ecl)}. The difference of {fmt(Math.abs(s.openingAllowance - P.ecl))} comes from changed assumptions, not from the receivables.</Note>}
            </Card>
        </> : <Card title="Movement by age band"><Note tone="warn">Most rows have no invoice number, so items cannot be matched one by one. Add an invoice number column for the full reconciliation.</Note>
            <Bars labels={res.byBucket.map(b => b.key)} series={[{ name: prior.date, values: res.byBucket.map(b => P.byBucket.find(x => x.key === b.key)?.ecl || 0) }, { name: s.reportDate, values: res.byBucket.map(b => b.ecl) }]} colors={['#c4b5fd', '#14b8a6']} fmtV={fmt} /></Card>}
    </>;
}

function Accounting({ res, s }: { res: Res; s: Settings }) {
    const ac = s.measure === 'ac';
    const je: [string, number | null, number | null][] = [
        ...(res.charge >= 0 ? [['Impairment loss on financial assets (P&L)', res.charge, null], [ac ? 'Loss allowance (balance sheet)' : 'OCI - FVOCI reserve', null, res.charge]] as [string, number | null, number | null][]
            : [[ac ? 'Loss allowance (balance sheet)' : 'OCI - FVOCI reserve', -res.charge, null], ['Reversal of impairment loss (P&L)', null, -res.charge]] as [string, number | null, number | null][]),
        ...(s.writeOffs ? [['Loss allowance (write-off used)', s.writeOffs, null], ['Receivables / loans (gross)', null, s.writeOffs]] as [string, number | null, number | null][] : []),
        ...(s.recoveries ? [['Cash / bank', s.recoveries, null], ['Impairment loss - recoveries (P&L)', null, s.recoveries]] as [string, number | null, number | null][] : []),
    ];
    return <>
        <div className="g2">
            <Card title="Allowance movement" sub="Opening + charge - write-offs = closing.">
                <table className="tbl"><tbody>
                    <tr><td>Opening loss allowance</td><td className="r">{fmt(s.openingAllowance)}</td></tr>
                    <tr><td>Charge to profit or loss</td><td className="r">{acct(res.charge)}</td></tr>
                    <tr><td>Amounts written off (allowance used)</td><td className="r">{acct(-s.writeOffs)}</td></tr>
                    <tr className="tot"><td>Closing loss allowance</td><td className="r">{fmt(res.ecl)}</td></tr>
                    {s.recoveries > 0 && <tr><td>Recoveries credited to P&L</td><td className="r">{acct(-s.recoveries)}</td></tr>}
                    <tr className="tot"><td>Net impairment loss in P&L</td><td className="r">{acct(res.pl)}</td></tr></tbody></table>
                {s.openingAllowance === 0 && <Note tone="warn">Opening allowance is 0, so the whole allowance shows as this period's charge. Enter the real figure in step 3.</Note>}
            </Card>
            <Card title="Journal entries" sub={ac ? 'Amortised cost' : 'Debt at FVOCI: the allowance sits in OCI (5.5.2)'}>
                <table className="tbl"><thead><tr><th>Account</th><th className="r">Debit</th><th className="r">Credit</th></tr></thead>
                    <tbody>{je.map(([a, dr, cr], i) => <tr key={i}><td className={cr !== null ? 'ind' : ''}>{a}</td><td className="r">{dr !== null ? fmt(dr) : ''}</td><td className="r">{cr !== null ? fmt(cr) : ''}</td></tr>)}</tbody></table>
            </Card>
        </div>
        <Card title="Presentation in the balance sheet">
            <table className="tbl"><tbody>
                <tr><td>Gross carrying amount</td><td className="r">{fmt(res.gross)}</td></tr>
                <tr><td>Less loss allowance on drawn amounts</td><td className="r">{acct(-(res.ecl - res.undrawn.ecl))}</td></tr>
                <tr className="tot"><td>{ac ? 'Net carrying amount' : 'Carrying amount (fair value; allowance in OCI)'}</td><td className="r">{ac ? fmt(res.gross - res.ecl + res.undrawn.ecl) : fmt(res.gross)}</td></tr>
                {res.undrawn.ecl > 0 && <tr><td>Provision for undrawn commitments (liability, IFRS 7 B8E)</td><td className="r">{fmt(res.undrawn.ecl)}</td></tr>}</tbody></table>
        </Card>
        <Card title="IFRS 7 disclosures this tool prepares" sub="All are in the Excel report.">
            <ul className="chk">
                <li className="ok">35H / 35I reconciliation of allowance and gross amount by stage <span className="mut">(needs last period's file)</span></li>
                <li className="ok">35M credit risk exposure by grade (age band) and stage</li>
                <li className="ok">35G inputs, assumptions and techniques: assumptions sheet and calculation method</li>
                <li className="ok">35N provision matrix for simplified-approach receivables</li>
                <li className="ok">Concentration of credit risk by customer and segment (34(c))</li>
                <li>35F credit risk management policies, write-off policy and modification disclosures: <span className="mut">write these yourself</span></li>
            </ul>
        </Card>
    </>;
}
