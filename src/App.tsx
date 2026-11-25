import { Method } from './Method';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Closing, FileCard } from '@instinct/files';
import './style.css';
import { Bucket, Calc, Specific, defaultBuckets, setBandEnd, removeBand, addBand, historyRate, FIELDS, Inv, samplePrior, sampleLoans, FieldKey, Settings, autoMap, buildInvoices, calculate, defaultSettings, parseCSV, sampleData, toISODate } from './ecl';
import { Country, FALLBACK_COUNTRIES, MacroResult, applyMacro, loadCountries, loadMacro } from './macro';
import { Dashboard } from './Dashboard';
import { ReconLine, STAGES, comparePrior } from './dash';
import { Cell, Sheet, download, readXlsx, toCSV, writeXlsx } from './xlsx';
import { Btn, Card, Field, Info, Note, Num, STAGE_COLOR, Seg, Steps, Tabs, fmt, pct, short } from './ui';

const cleanCell = (v: Cell) => v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : /^%:/.test(v) ? String(+(parseFloat(v.slice(2)) * 100).toFixed(4)) + '%' : v.replace(/^​/, '').replace(/[\t\r\n]+/g, ' ');
const toTSV = (rows: Cell[][]) => rows.map(r => r.map(cleanCell).join('\t')).join('\n');
const eom = (iso: string) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const lastMonthEnd = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10); };
// Plain-language explanation of where an age band's rate came from (shown on screen, in the band download and in the report)
export function bandBasis(b: Bucket, s: Settings): string {
    const basis = s.rateBasis || 'example';
    if (basis === 'history') return b.hBal && b.hBal > 0 ? `History: ${fmt(b.hLost || 0)} never collected / ${fmt(b.hBal)} in band = ${pct((b.hLost || 0) / b.hBal, 2)} (loss rate, B5.5.35)` : `No history entered: ${pct(b.pd, 2)} used as a loss rate (no LGD). Enter the history or type the rate`;
    if (basis === 'own') return s.rateType === 'loss' ? 'Your own loss rate (LGD included)' : 'Your own probability of default, x LGD ' + pct(s.lgd, 0);
    return 'Illustrative example, x LGD ' + pct(s.lgd, 0) + '. Replace with your own history';
}
type Kind = 'receivables' | 'loans';
type SetTab = 'basics' | 'economy' | 'rates' | 'staging' | 'specific' | 'prior';

export function App() {
    const [step, setStep] = useState(1);
    const [kind, setKind] = useState<Kind>('receivables');
    const [raw, setRaw] = useState<string[][] | null>(null);
    const [fileName, setFileName] = useState('');
    const [err, setErr] = useState('');
    const [map, setMap] = useState<Record<FieldKey, number> | null>(null);
    const [dayFirst, setDayFirst] = useState(true);
    const [s, setS] = useState<Settings>(defaultSettings('2026-12-31'));
    const [setTab, setSetTab] = useState<SetTab>('basics');
    const [showMethod, setShowMethod] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [prior, setPrior] = useState<{ name: string; rows: Inv[]; date: string } | null>(null);
    const [priorErr, setPriorErr] = useState('');
    const priorRef = useRef<HTMLInputElement>(null);
    const onPrior = async (f?: File | null) => {
        if (!f) return;
        try {
            const data = /\.xlsx$/i.test(f.name) ? await readXlsx(await f.arrayBuffer()) : parseCSV(await f.text());
            const m = autoMap(data[0] || []);
            if (m.customer < 0 || m.invDate < 0 || m.amount < 0) { setPriorErr('That file needs customer, date and amount columns, like your main file.'); return; }
            const { rows } = buildInvoices(data.slice(1), m, dayFirst);
            if (!rows.length) { setPriorErr('No usable rows were found in that file.'); return; }
            const last = rows.map(r => r.invDate).sort().pop()!;
            setPrior({ name: f.name, rows, date: eom(last) }); setPriorErr('');
        } catch (e: any) { setPriorErr('Could not read that file: ' + (e?.message || e)); }
    };
    const [robust, setRobust] = useState(true);
    const [macroRes, setMacroRes] = useState<MacroResult[]>([]);
    const [countries, setCountries] = useState<Country[]>(FALLBACK_COUNTRIES);
    const [iso, setIso] = useState('SAU');
    const [yearPick, setYearPick] = useState<number | null>(null);
    const [macro, setMacro] = useState<{ status: 'idle' | 'loading' | 'ok' | 'part' | 'fail'; msg: string }>({ status: 'idle', msg: '' });
    const year = yearPick ?? (parseInt(s.reportDate.slice(0, 4)) || 2026);
    const countryName = countries.find(c => c.id === iso)?.name || iso;
    useEffect(() => {
        if (step !== 3) return; const ac = new AbortController();
        loadCountries(ac.signal).then(setCountries).catch(() => { });
        return () => ac.abort();
    }, [step === 3]);
    // World Bank data loads only when the country, year or method changes (or after a new file), so forecasts typed by the user are kept.
    const macroKey = useRef('');
    useEffect(() => {
        if (step !== 3) return; const key = iso + '|' + year + '|' + robust; if (macroKey.current === key) return;
        const ac = new AbortController();
        setMacro({ status: 'loading', msg: 'Loading ' + countryName + ' data from the World Bank...' });
        loadMacro(iso, year, robust, ac.signal).then(({ results, updated }) => {
            macroKey.current = key;
            const found = results.filter(r => r.found);
            if (!found.length && results.every(r => r.err)) { setMacro({ status: 'fail', msg: 'Could not reach the World Bank (slow, offline or blocked). Your current numbers were kept. Pick the country again to retry, or type your own figures.' }); return; }
            if (!found.length) { setMacro({ status: 'fail', msg: `The World Bank has no recent data for ${countryName}. Your current numbers were kept. Type your own figures.` }); return; }
            setMacroRes(results); setS(prev => ({ ...prev, factors: applyMacro(prev.factors, results, countryName + ' ' + year + (robust ? ' (median)' : ' (average)')) }));
            const miss = results.filter(r => !r.found).map(r => r.name);
            const old = found.filter(r => r.usedYear! < year).map(r => `${r.name} (${r.usedYear})`);
            setMacro({ status: miss.length ? 'part' : 'ok', msg: `World Bank World Development Indicators${updated ? ', updated ' + updated : ''}.` + (old.length ? ` Latest published year used where ${year} is not out yet: ${old.join(', ')}.` : '') + (miss.length ? ` No data for: ${miss.join(', ')} (current numbers kept).` : '') });
        }).catch(e => { if (e?.name !== 'AbortError') setMacro({ status: 'fail', msg: 'Could not reach the World Bank (offline or blocked). Your current numbers were kept. Type your own figures.' }); });
        return () => ac.abort();
    }, [step === 3, iso, year, robust]);

    const load = (data: string[][], name: string, k: Kind, reportDate?: string) => {
        if (data.length < 2) { setErr('The file has no data rows. It needs a header row and at least one row of data.'); return; }
        setPrior(null); macroKey.current = ''; setMacroRes([]); setMacro({ status: 'idle', msg: '' }); const m = autoMap(data[0]); setRaw(data); setFileName(name); setMap(m); setErr(''); setKind(k);
        const { rows } = buildInvoices(data.slice(1), m, true);
        const last = rows.map(r => r.invDate).sort().pop();
        const rd = reportDate || (k === 'loans' ? lastMonthEnd() : last ? eom(last) : lastMonthEnd());
        setS(prev => ({ ...defaultSettings(rd), method: k === 'loans' ? 'general' : 'simplified', segMult: {}, specific: {} }));
        setStep(2);
    };
    const onFile = async (f?: File | null) => {
        if (!f) return;
        try {
            if (/\.xlsx$/i.test(f.name)) load(await readXlsx(await f.arrayBuffer()), f.name, kind);
            else if (/\.(csv|txt|tsv)$/i.test(f.name)) load(parseCSV(await f.text()), f.name, kind);
            else setErr('Please upload a .xlsx or .csv file. If your file is .xls, open it in Excel and use Save As .xlsx.');
        } catch (e: any) { setErr('Could not read that file: ' + (e?.message || e)); }
    };

    const built = useMemo(() => raw && map ? buildInvoices(raw.slice(1), map, dayFirst) : null, [raw, map, dayFirst]);
    const segNames = useMemo(() => {
        if (!built || s.segBy === 'none') return [] as string[];
        return [...new Set(built.rows.map(r => (s.segBy === 'country' ? r.country : r.segment) || 'Unspecified'))].sort();
    }, [built, s.segBy]);
    const res = useMemo(() => built && built.rows.length ? calculate(built.rows, s) : null, [built, s]);
    const priorCmp = useMemo(() => prior && res ? comparePrior(res!, calculate(prior.rows, { ...s, reportDate: prior.date, openingAllowance: 0, writeOffs: 0, recoveries: 0 }), prior.date) : null, [prior, res, s]);
    const ready = !!(map && map.customer >= 0 && map.invDate >= 0 && map.amount >= 0 && built && built.rows.length);
    const set = (p: Partial<Settings>) => setS(prev => ({ ...prev, ...p }));
    const setBucket = (i: number, p: Partial<Bucket>) => set({ buckets: s.buckets.map((b, j) => j === i ? { ...b, ...p } : b) });
    const wTotal = s.wBase + s.wUp + s.wDown;
    const setSpec = (c: string, p: Partial<Specific>) => set({ specific: { ...s.specific, [c]: { ...s.specific[c], ...p } } });
    const custNames = useMemo(() => built ? [...new Set(built.rows.map(r => r.customer))].sort() : [], [built]);
    const hasLoanCols = !!(map && (map.maturity >= 0 || map.pd >= 0));

    const dlSample = (which: 'full' | 'min' | 'loans', ext: 'csv' | 'xlsx') => {
        const d = which === 'loans' ? sampleLoans() : sampleData(which === 'full'); const nm = 'ecl-demo-' + which;
        if (ext === 'csv') download(nm + '.csv', new Blob([toCSV(d)], { type: 'text/csv' }));
        else download(nm + '.xlsx', writeXlsx([{ name: 'Data', rows: d, widths: d[0].map(() => 18) }]));
    };

    const workbook = () => {
        if (!res) return null;
        const B = (t: string) => '\u200b' + t;
        const summary: Cell[][] = [
            ['IFRS 9 expected credit loss - summary'], [],
            [B('Reporting date'), s.reportDate], [B('Approach'), s.method === 'simplified' ? 'Simplified (lifetime ECL, IFRS 9 5.5.15)' : 'General (3-stage)'],
            [B('Measurement category'), s.measure === 'ac' ? 'Amortised cost' : 'FVOCI (debt instruments) - allowance in OCI, 5.5.2'],
            [B('Invoices / exposures included'), res.rows.length], ...(res.future.length ? [[B('Left out: dated after the reporting date'), res.future.length] as Cell[]] : []),
            [B('Gross carrying amount'), res.gross], [B('Group (collective) ECL'), res.coll.ecl], [B('Specific provisions'), res.spec.ecl], [B('Total expected credit loss'), res.ecl],
            ...(res.undrawn.amount ? [[B('  of which on undrawn commitments (provision, IFRS 7 B8E)'), res.undrawn.ecl] as Cell[]] : []),
            [B('Coverage'), '%:' + res.coverage], [B(s.measure === 'ac' ? 'Net carrying amount' : 'Carrying amount = fair value (allowance not deducted)'), s.measure === 'ac' ? res.gross - res.ecl + res.undrawn.ecl : null], [],
            [B('Allowance movement'), 'Amount'], ['Opening loss allowance', s.openingAllowance], ['Amounts written off during the period (used)', s.writeOffs ? -s.writeOffs : 0], ['Charge to profit or loss (balancing)', res.charge], [B('Closing loss allowance (ECL)'), res.ecl],
            ['Recoveries of amounts previously written off (credited to P&L)', s.recoveries], [B('Net impairment loss in profit or loss'), res.pl], [],
            [B('Journal entries'), 'Debit', 'Credit'],
            ...(res.charge >= 0
                ? [['Impairment loss on financial assets (P&L)', res.charge, null], [s.measure === 'ac' ? '   Loss allowance (SOFP)' : '   Other comprehensive income (FVOCI reserve)', null, res.charge]]
                : [[s.measure === 'ac' ? 'Loss allowance (SOFP)' : 'Other comprehensive income (FVOCI reserve)', -res.charge, null], ['   Reversal of impairment loss (P&L)', null, -res.charge]]) as Cell[][],
            ...(s.writeOffs ? [['Loss allowance (SOFP) - write-off used', s.writeOffs, null], ['   Trade receivables / loans (gross)', null, s.writeOffs]] as Cell[][] : []),
            ...(s.recoveries ? [['Cash / bank', s.recoveries, null], ['   Impairment loss - recoveries (P&L)', null, s.recoveries]] as Cell[][] : []), [],
            ['Illustrative defaults. Replace with your own loss history and forecasts before using for reporting.'],
        ];
        const assum: Cell[][] = [['Assumption', 'Value'],
            ['Band rates are', s.rateType === 'pd' ? 'Probability of default (multiplied by LGD)' : 'Historical loss rates (LGD already included)'],
            ['Payment terms if no due date (days)', s.termsDays], ['Loss given default', s.rateType === 'loss' ? 'Included in loss rates (100%)' : '%:' + s.lgd], ['Effective interest rate', '%:' + s.eir], ['Months to collection (discounting)', s.months],
            ['Discount factor', res.df], ['Management overlay', '%:' + s.overlay],
            ['Significant increase in credit risk: days past due over', s.sicrDays], ['Default: days past due over', s.defaultDays], ['Significant increase: PD now / PD at recognition at least', s.sicrMult],
            ['Credit conversion factor for undrawn commitments', '%:' + s.ccf], [],
            ['Age band', 'From (days past due)', 'To', 'Rate', 'How the rate was set'], ...s.buckets.map(b => [b.label, b.from < -999 ? '' : b.from, b.to > 9999 ? '' : b.to, '%:' + b.pd, bandBasis(b, s)] as Cell[]), [],
            ['Macro factor', 'Unit', 'Baseline', 'Base', 'Upside', 'Downside', 'Sensitivity (log-PD per unit)', 'Source'], ...s.factors.map(f => [f.name, f.unit, f.baseline, f.base, f.up, f.down, f.sens, f.src || 'Manual default'] as Cell[]), [],
            ['Scenario', 'Weight', 'PD multiplier', 'ECL'], ...res.scen.map(x => [x.name, '%:' + x.w, x.mult, x.ecl] as Cell[])];
        const ageing: Cell[][] = [['Bucket', 'Invoices', 'Gross amount', 'ECL', 'Coverage %'], ...res.byBucket.map(b => [b.key, b.n, b.gross, b.ecl, '%:' + (b.gross ? b.ecl / b.gross : 0)] as Cell[]), ...(res.spec.n ? [['Specific provisions', res.spec.n, res.spec.gross, res.spec.ecl, '%:' + (res.spec.gross ? res.spec.ecl / res.spec.gross : 0)] as Cell[]] : []), ['Total', res.rows.length, res.gross, res.ecl, '%:' + res.coverage]];
        const bkeys = res.byBucket.map(b => b.key);
        const matrix: Cell[][] = [['Segment', ...bkeys.map(k => k + ' - gross'), 'Total gross', ...bkeys.map(k => k + ' - ECL'), 'Total ECL', 'Coverage %']];
        res.bySeg.forEach(g => matrix.push([g.key, ...bkeys.map(k => g.rows.filter(r => r.bucket === k).reduce((a, r) => a + r.amount, 0)), g.gross, ...bkeys.map(k => g.rows.filter(r => r.bucket === k).reduce((a, r) => a + r.ecl, 0)), g.ecl, '%:' + (g.gross ? g.ecl / g.gross : 0)]));
        const cust: Cell[][] = [['Customer', 'Invoices', 'Gross amount', 'ECL', 'Coverage %'], ...res.byCust.map(c => [c.key, c.n, c.gross, c.ecl, '%:' + (c.gross ? c.ecl / c.gross : 0)] as Cell[])];
        const inv: Cell[][] = [['Row', 'Customer', 'Invoice no', 'Invoice date', 'Due date used', 'Amount', 'Segment', 'Country', 'Currency', 'Collateral', 'Undrawn', 'Exposure (EAD)', 'Credit impaired', 'Days past due', 'Bucket', 'Stage', 'Stage reason', 'Horizon', 'PD before economy', 'LGD used', 'ECL base', 'ECL upside', 'ECL downside', 'ECL weighted', 'Rate %'],
            ...res.rows.map(r => [r.row, r.customer, r.invNo, r.invDate, r.dueDate || 'invoice date + ' + s.termsDays + ' days', r.amount, r.segment, r.country, r.currency, r.collateral, r.undrawn, r.base, r.impaired ? 'Yes' : 'No', r.dpd, r.bucket, r.stageKey, r.stageWhy, r.horizon, '%:' + r.pd, '%:' + r.lgdUsed, r.eclBase, r.eclUp, r.eclDown, r.ecl, '%:' + r.rate] as Cell[])];
        // IFRS 7.35M: gross carrying amount by credit risk grade (age band) and stage
        const stKeys = res.byStage.map(g => g.key);
        const grades = [...new Set(res.rows.map(r => r.bucket))];
        const expo: Cell[][] = [['Age band / grade', ...stKeys.map(k => k + ' - gross'), 'Total gross', ...stKeys.map(k => k + ' - ECL'), 'Total ECL'],
            ...grades.map(gk => { const rs = res.rows.filter(r => r.bucket === gk); return [gk, ...stKeys.map(k => rs.filter(r => r.stageKey === k).reduce((a, r) => a + r.amount, 0)), rs.reduce((a, r) => a + r.amount, 0), ...stKeys.map(k => rs.filter(r => r.stageKey === k).reduce((a, r) => a + r.ecl, 0)), rs.reduce((a, r) => a + r.ecl, 0)] as Cell[]; }),
            ['Total', ...stKeys.map(k => res.byStage.find(g => g.key === k)!.gross), res.gross, ...stKeys.map(k => res.byStage.find(g => g.key === k)!.ecl), res.ecl]];
        const extra: Sheet[] = [{ name: 'Credit risk by stage', rows: expo, widths: [26, ...stKeys.map(() => 16), 16, ...stKeys.map(() => 16), 16] }];
        if (priorCmp?.recon) {
            const rc = priorCmp.recon; const sk = STAGES.filter(k => rc.allowance.some(l => l.v[k]) || rc.gross.some(l => l.v[k]));
            const tbl = (lines: ReconLine[]) => lines.map(l => [l.label, ...sk.map(k => l.v[k]), sk.reduce((a, k) => a + l.v[k], 0)] as Cell[]);
            extra.push({ name: 'Reconciliation (IFRS 7)', widths: [52, ...sk.map(() => 16), 16], rows: [
                ['Reconciliation from ' + priorCmp.date + ' to ' + s.reportDate + ' (IFRS 7.35H and 35I)'], [],
                [B('Loss allowance'), ...sk, 'Total'], ...tbl(rc.allowance), [],
                [B('Gross carrying amount'), ...sk, 'Total'], ...tbl(rc.gross), [],
                ['The opening allowance is recalculated on last period\'s file with today\'s assumptions, so the movement comes from the receivables. Booked opening allowance: ' + fmt(s.openingAllowance) + '.'],
                ['Write-offs are inside "Paid, settled or written off". Enter the amount written off in step 3 for the journal entry.'],
            ] });
        }
        const sheets: Sheet[] = [
            { name: 'Summary', rows: summary, widths: [46, 20, 20] }, { name: 'Assumptions', rows: assum, widths: [44, 16, 14, 16, 14, 14, 26] },
            { name: 'Ageing', rows: ageing, widths: [26, 10, 18, 18, 12] }, { name: 'Segment x ageing', rows: matrix, widths: [24, ...bkeys.map(() => 16), 16, ...bkeys.map(() => 16), 16, 12] },
            { name: 'Customers', rows: cust, widths: [30, 10, 18, 18, 12] }, ...extra,
            { name: 'Invoices', rows: inv, widths: [6, 28, 14, 12, 14, 14, 16, 14, 10, 12, 12, 14, 10, 10, 18, 9, 36, 26, 10, 10, 14, 14, 14, 14, 10] },
        ];
        return { sheets, inv };
    };
    const bandRows = (): Cell[][] => {
        const r = res!; const head: Cell[] = ['Age band', 'From (days past due)', 'To (days past due)', 'Rate', 'How the rate was set', 'Past amount in band', 'Never collected', 'Items now', 'Owed now', 'Expected loss now'];
        return [head, ...s.buckets.map((b, i) => { const rs = r.rows.filter(x => x.bucket === b.label);
            return [b.label, i === 0 ? 'not yet due' : b.from, i === s.buckets.length - 1 ? 'and over' : b.to, '%:' + b.pd, bandBasis(b, s), b.hBal || null, b.hLost || null, rs.length, rs.reduce((a, x) => a + x.amount, 0), rs.reduce((a, x) => a + x.ecl, 0)] as Cell[]; }),
            [], ['Reporting date', s.reportDate], ['Rates are', s.rateBasis === 'history' || s.rateType === 'loss' ? 'Loss rates (LGD included)' : 'Probability of default, multiplied by LGD ' + pct(s.lgd, 0)]];
    };
    const dlBands = (kind: 'xlsx' | 'csv') => { if (!res) return; const rows = bandRows();
        if (kind === 'csv') download('ifrs9-age-bands.csv', new Blob([toCSV(rows)], { type: 'text/csv' }));
        else download('ifrs9-age-bands.xlsx', writeXlsx([{ name: 'Age bands', rows, widths: [18, 14, 14, 10, 60, 16, 16, 10, 16, 18] }])); };
    const tsvAll = () => { const w = workbook(); return w ? w.sheets.map(sh => '### ' + sh.name + '\n' + toTSV(sh.rows)).join('\n\n') : ''; };
    const dlXlsx = () => { const w = workbook(); if (w) download('ifrs9-ecl-results.xlsx', writeXlsx(w.sheets)); };
    const dlCsv = () => { const w = workbook(); if (w) download('ifrs9-ecl-items.csv', new Blob([toCSV(w.inv)], { type: 'text/csv' })); };

    const sampleCheck = useMemo(() => { const d = sampleData(true); const b = buildInvoices(d.slice(1), autoMap(d[0]), true); return calculate(b.rows, defaultSettings('2026-09-30')); }, []);
    const colName = (k: FieldKey) => map && raw && map[k] >= 0 ? raw[0][map[k]] : '';
    const mapOk = !!(map && map.customer >= 0 && map.invDate >= 0 && map.amount >= 0);
    const unit = kind === 'loans' ? 'exposures' : 'invoices';
    const can = (k: number) => k === 1 || (k === 2 && !!raw) || (k >= 3 && ready);
    const go = (k: number) => { setShowMethod(false); setStep(k); window.scrollTo?.(0, 0); };

    return <FileCard>
        <div className="app">
            <header className="top">
                <div className="top-row">
                    <div><div className="brand"><span className="logo">9</span>IFRS 9 Expected Credit Loss</div>
                        <p className="top-sub">Work out the loss allowance for {kind === 'loans' ? 'loans and advances' : 'trade receivables'} in four steps, with every number explained.</p></div>
                    <Btn kind="ghost" small onClick={() => setShowMethod(!showMethod)}>{showMethod ? 'Close method' : 'How it is calculated'}</Btn>
                </div>
                <Steps names={['Your data', 'Check columns', 'Assumptions', 'Dashboard']} step={step} can={can} onGo={go} />
            </header>

            {showMethod && <div className="pane"><Method res={res ?? sampleCheck} s={res ? s : defaultSettings('2026-09-30')} where={res ? countryName + ' ' + year : 'demo data'} /></div>}

            {/* ---------------- STEP 1 ---------------- */}
            {!showMethod && step === 1 && <div className="pane">
                <h2 className="h">What are you measuring?</h2>
                <p className="lead">This decides which IFRS 9 approach is used. You can change it later.</p>
                <div className="choose">
                    <button type="button" className={'opt' + (kind === 'receivables' ? ' on' : '')} onClick={() => setKind('receivables')}>
                        <span className="opt-ic">{'\u{1F9FE}'}</span><b>Trade receivables</b><span>Unpaid customer invoices and contract assets.</span>
                        <em>Simplified approach: lifetime expected loss for everything (IFRS 9 5.5.15). Uses a provision matrix by days past due.</em></button>
                    <button type="button" className={'opt' + (kind === 'loans' ? ' on' : '')} onClick={() => setKind('loans')}>
                        <span className="opt-ic">{'\u{1F3E6}'}</span><b>Loans, advances and debt</b><span>Bank loans, staff loans, intercompany loans, bonds.</span>
                        <em>General approach: Stage 1 = 12-month loss, Stage 2 and 3 = lifetime loss (5.5.3-5.5.5).</em></button>
                </div>
                <h3 className="h3">Add your file</h3>
                <div className="drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void onFile(e.dataTransfer.files?.[0]); }}>
                    <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt,.tsv" hidden onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
                    <div className="drop-ic">{'⬆'}</div>
                    <div><b>Drop an Excel or CSV file here</b><p className="mut">One row per {kind === 'loans' ? 'loan' : 'unpaid invoice'}. Your data stays in your browser.</p></div>
                    <Btn onClick={() => fileRef.current?.click()}>Choose file</Btn>
                </div>
                {err && <Note tone="bad" title="This file did not work">{err}</Note>}
                <div className="g2">
                    <Card title="Columns you need" sub="Only the first three are required. Names do not have to match exactly.">
                        <table className="tbl"><thead><tr><th>Column</th><th>Example</th><th /></tr></thead><tbody>
                            <tr><td>{kind === 'loans' ? 'Borrower' : 'Customer name'}</td><td>Al Noor Trading</td><td><span className="req">required</span></td></tr>
                            <tr><td>{kind === 'loans' ? 'Disbursement date' : 'Invoice date'}</td><td>2026-07-14</td><td><span className="req">required</span></td></tr>
                            <tr><td>Outstanding amount</td><td>45,000</td><td><span className="req">required</span></td></tr>
                            <tr><td>Due date, segment, country, collateral, credit-impaired (Yes/No)</td><td /><td><span className="opt-t">better result</span></td></tr>
                            {kind === 'loans' && <tr><td>Maturity date, PD, PD at origination, LGD, EIR, days past due, undrawn, stage, POCI</td><td /><td><span className="opt-t">for loans</span></td></tr>}
                        </tbody></table>
                    </Card>
                    <Card title="No file yet? Try a demo" sub="Real-looking data so you can see every screen.">
                        <div className="demos">
                            <button type="button" className="demo" onClick={() => load(sampleData(true), 'Demo: trade receivables', 'receivables')}><b>Trade receivables</b><span>120 invoices, 14 customers, simplified approach</span></button>
                            <button type="button" className="demo" onClick={() => load(sampleLoans(), 'Demo: loan book', 'loans', '2026-09-30')}><b>Loan book</b><span>61 loans across Stage 1, 2, 3 and POCI, general approach</span></button>
                            <button type="button" className="demo" onClick={() => load(sampleData(false), 'Demo: 3 columns only', 'receivables')}><b>Minimum file</b><span>Only customer, date and amount</span></button>
                        </div>
                        <p className="mut sm">Download the demo files to try an upload: receivables <a href="#" onClick={e => { e.preventDefault(); dlSample('full', 'xlsx'); }}>.xlsx</a> / <a href="#" onClick={e => { e.preventDefault(); dlSample('full', 'csv'); }}>.csv</a>, loans <a href="#" onClick={e => { e.preventDefault(); dlSample('loans', 'xlsx'); }}>.xlsx</a> / <a href="#" onClick={e => { e.preventDefault(); dlSample('loans', 'csv'); }}>.csv</a>.</p>
                    </Card>
                </div>
                <Glossary />
            </div>}

            {/* ---------------- STEP 2 ---------------- */}
            {!showMethod && step === 2 && raw && map && built && <div className="pane">
                <h2 className="h">Check your data</h2>
                <p className="lead">We read <b>{fileName}</b>. Check the summary and the columns we matched.</p>
                <div className="kpis">
                    <div className="kpi" style={{ ['--tone' as any]: '#0f766e' }}><small>Rows we can use</small><b>{built.rows.length}</b><span className="kd flat">of {raw.length - 1} in the file</span></div>
                    <div className="kpi" style={{ ['--tone' as any]: '#4f46e5' }}><small>Total outstanding</small><b>{short(built.rows.reduce((a, r) => a + r.amount, 0))}</b><span className="kd flat">{new Set(built.rows.map(r => r.customer)).size} {kind === 'loans' ? 'borrowers' : 'customers'}</span></div>
                    <div className="kpi" style={{ ['--tone' as any]: '#7c3aed' }}><small>Dates from</small><b className="sm">{built.rows.map(r => r.invDate).sort()[0] || '-'}</b><span className="kd flat">to {built.rows.map(r => r.invDate).sort().pop() || '-'}</span></div>
                    <div className="kpi" style={{ ['--tone' as any]: built.issues.length ? '#d97706' : '#10b981' }}><small>Rows skipped</small><b>{built.issues.length}</b><span className="kd flat">{built.issues.length ? 'see below' : 'all good'}</span></div>
                </div>
                <Card title="Data checks">
                    <ul className="chk">
                        <li className={mapOk ? 'ok' : 'bad'}>{mapOk ? <>Required columns found: <b>{colName('customer')}</b>, <b>{colName('invDate')}</b>, <b>{colName('amount')}</b></> : 'We could not find all required columns. Choose them below (marked *).'}</li>
                        {built.issues.length > 0 && <li className="warn">{built.issues.length} rows skipped, for example {built.issues.slice(0, 3).map(i => `row ${i.row} (${i.why})`).join('; ')}.</li>}
                        <li className={map.dueDate >= 0 || map.dpd >= 0 ? 'ok' : 'warn'}>{map.dueDate >= 0 ? 'Due dates found: ageing uses them.' : map.dpd >= 0 ? 'Days past due found in your file.' : `No due date: ageing uses invoice date + ${s.termsDays} days payment terms (change in step 3).`}</li>
                        <li className={map.segment >= 0 ? 'ok' : 'warn'}>{map.segment >= 0 ? 'Segments found: results are split by segment (IFRS 9 B5.5.5 grouping).' : 'No segment column: everything is one group.'}</li>
                        <li className={map.impaired >= 0 || map.stage >= 0 ? 'ok' : 'warn'}>{map.impaired >= 0 ? `Credit-impaired flag found (${built.rows.filter(r => r.impaired).length} flagged).` : 'No credit-impaired flag: Stage 3 is decided from days past due only.'}</li>
                        {kind === 'loans' && <li className={hasLoanCols ? 'ok' : 'warn'}>{hasLoanCols ? 'Loan columns found (maturity / PD): 12-month and lifetime loss are worked out over the remaining life.' : 'No maturity date or PD column: items are treated as short-term, so 12-month and lifetime loss are the same.'}</li>}
                        {kind === 'receivables' && hasLoanCols && <li className="warn">Your file has loan columns (maturity or PD). For loans choose "Loans, advances and debt" in step 1, or switch the method in step 3.</li>}
                        {built.rows.some(r => r.amount < 0) && <li className="warn">Negative amounts (credit notes) reduce the total but carry no loss.</li>}
                        {new Set(built.rows.map(r => r.currency).filter(Boolean)).size > 1 && <li className="bad">Several currencies and no conversion. Convert everything to one currency first.</li>}
                        {(() => { const n = built.rows.filter(r => r.invDate > s.reportDate).length; return n > 0 && <li className="warn">{n} rows are dated after the reporting date ({s.reportDate}) and will be left out. Check the date in step 3.</li>; })()}
                        {(() => { const m = new Map<string, number>(); built.rows.forEach(r => { if (r.invNo) { const k = r.customer + '|' + r.invNo; m.set(k, (m.get(k) || 0) + 1); } }); const d = [...m.values()].filter(v => v > 1).length; return d > 0 && <li className="warn">{d} reference numbers appear on more than one row. Make sure nothing is listed twice.</li>; })()}
                        {built.rows.some(r => r.collateral > Math.abs(r.amount) && r.amount > 0) && <li className="warn">Some rows have more collateral than the amount owed. If collateral is per customer, split it across rows first.</li>}
                    </ul>
                </Card>
                <details className="dx" open={!mapOk}><summary>Matched columns (change if wrong)</summary>
                    {[false, true].map(adv => {
                        const grid = <div className="form">{FIELDS.filter(f => !!f.adv === adv).map(f => <Field key={f.key} label={<>{f.label}{f.required ? ' *' : ''}</>} hint={f.hint}>
                            <select className="in" value={map[f.key]} onChange={e => setMap({ ...map, [f.key]: +e.target.value })}>
                                <option value={-1}>{f.required ? '- choose column -' : '- not in my file -'}</option>
                                {raw[0].map((h, i) => <option key={i} value={i}>{h || `(column ${i + 1})`}</option>)}
                            </select></Field>)}</div>;
                        return adv ? <div key="adv"><h4 className="h4">Loan and bank columns (optional)</h4><p className="mut">Rates can be written as 2.5, 2.5% or 0.025. A column with any value above 1 is read as percentages.</p>{grid}</div> : <React.Fragment key="std">{grid}</React.Fragment>;
                    })}
                    <div className="form"><Field label="How are dates written?" hint="Only matters for dates like 03/04/2026">
                        <select className="in" value={dayFirst ? 'd' : 'm'} onChange={e => setDayFirst(e.target.value === 'd')}><option value="d">Day / Month / Year (31/12/2026)</option><option value="m">Month / Day / Year (12/31/2026)</option></select></Field></div>
                </details>
                <details className="dx"><summary>First rows of your file</summary>
                    <div className="scroll"><table className="tbl"><thead><tr>{raw[0].map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{raw.slice(1, 8).map((r, i) => <tr key={i}>{raw[0].map((_, j) => <td key={j}>{r[j]}</td>)}</tr>)}</tbody></table></div>
                </details>
                <div className="nav"><Btn kind="ghost" onClick={() => go(1)}>Back</Btn><Btn disabled={!ready} onClick={() => go(3)}>Next: assumptions</Btn></div>
            </div>}

            {/* ---------------- STEP 3 ---------------- */}
            {!showMethod && step === 3 && ready && res && <div className="pane">
                <div className="live">
                    <div><small>Live estimate</small><b>{fmt(res.ecl)}</b><span>{pct(res.coverage, 2)} of {short(res.gross)}</span></div>
                    <div className="live-st">{res.byStage.map(x => <span key={x.key} title={x.key + ': ' + fmt(x.ecl)}><i style={{ background: STAGE_COLOR[x.key] }} />{x.key} {short(x.ecl)}</span>)}</div>
                    <Btn onClick={() => go(4)}>See dashboard</Btn>
                </div>
                <h2 className="h">Assumptions</h2>
                <p className="lead">Every value has a sensible start. Check the <b>reporting date</b> and <b>country</b>, then go to the dashboard. The estimate above updates as you type.</p>
                <Tabs<SetTab> value={setTab} onChange={setSetTab} tabs={[{ key: 'basics', label: '1. Date & country' }, { key: 'economy', label: '2. Economy' }, { key: 'rates', label: '3. Loss rates' }, { key: 'staging', label: '4. Stages' }, { key: 'specific', label: '5. Individual customers', badge: Object.keys(s.specific).length || undefined }, { key: 'prior', label: '6. Last period', badge: prior ? '✓' : undefined }]} />

                {setTab === 'basics' && <Card>
                    <div className="form">
                        <Field label="Reporting date" hint="Days past due are counted up to this day." info="The date of the balance sheet the allowance is for."><input className="in" type="date" value={s.reportDate} onChange={e => e.target.value && toISODate(e.target.value, false) && set({ reportDate: e.target.value })} /></Field>
                        <Field label="Approach" info="Simplified (5.5.15) is required for trade receivables and contract assets without a significant financing component. General (5.5.3) applies to loans and debt investments.">
                            <select className="in" value={s.method} onChange={e => set({ method: e.target.value as any })}><option value="simplified">Simplified - lifetime loss for all (receivables)</option><option value="general">General - 3 stages (loans and debt)</option></select></Field>
                        <Field label="Country of your customers" hint="Loads growth, unemployment, inflation and interest rates from the World Bank.">
                            <select className="in" value={iso} onChange={e => setIso(e.target.value)}>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                        <Field label="Economic data year" hint="Normally the year of the reporting date.">
                            <select className="in" value={year} onChange={e => setYearPick(+e.target.value)}>{Array.from({ length: 27 }, (_, i) => 2030 - i).map(y => <option key={y} value={y}>{y}</option>)}</select></Field>
                        <Field label="Measurement category" info="Debt instruments at fair value through OCI keep the allowance in OCI; it does not reduce the carrying amount (5.5.2).">
                            <select className="in" value={s.measure} onChange={e => set({ measure: e.target.value as any })}><option value="ac">Amortised cost</option><option value="fvoci">Fair value through OCI (debt)</option></select></Field>
                        <Field label="Show results by" hint="How items are grouped (B5.5.5).">
                            <select className="in" value={s.segBy} onChange={e => set({ segBy: e.target.value as any })}><option value="segment" disabled={map!.segment < 0}>Segment / industry{map!.segment < 0 ? ' (no column)' : ''}</option><option value="country" disabled={map!.country < 0}>Country{map!.country < 0 ? ' (no column)' : ''}</option><option value="none">No split</option></select></Field>
                    </div>
                    {macro.status !== 'idle' && <Note tone={macro.status === 'part' ? 'warn' : macro.status === 'fail' ? 'bad' : macro.status === 'ok' ? 'ok' : 'info'} title={macro.status === 'loading' ? 'Loading economic data...' : macro.status === 'ok' ? 'Economic data loaded for ' + countryName : macro.status === 'part' ? 'Loaded, with gaps' : 'Could not load economic data'}>{macro.msg}</Note>}
                    <h4 className="h4">For the journal entry</h4>
                    <div className="form">
                        <Field label="Last period's loss allowance" hint="Leave 0 if this is the first time."><Num value={s.openingAllowance} onChange={n => set({ openingAllowance: n })} /></Field>
                        <Field label="Written off this period" info="Amounts removed because there is no reasonable expectation of recovery (5.4.4). They use up the allowance, so they are needed for the correct P&L charge."><Num value={s.writeOffs} onChange={n => set({ writeOffs: Math.max(0, n) })} /></Field>
                        <Field label="Recovered after write-off" hint="Cash received on items written off earlier (credited to P&L)."><Num value={s.recoveries} onChange={n => set({ recoveries: Math.max(0, n) })} /></Field>
                    </div>
                    <div className="nav"><span /><Btn onClick={() => setSetTab('economy')}>Next: economy</Btn></div>
                </Card>}

                {setTab === 'economy' && (() => {
                    const single = s.wUp === 0 && s.wDown === 0;
                    const mB = res.scen[0].mult;
                    const editBase = (i: number, n: number) => set({ factors: s.factors.map((x, j) => { if (j !== i) return x; const d = n - x.base; return { ...x, base: n, up: +(x.up + d).toFixed(4), down: +(x.down + d).toFixed(4) }; }) });
                    return <Card title="Economic outlook" sub="Enter your forecast for each factor. IFRS 9 5.5.17 requires the allowance to reflect forecasts of future economic conditions.">
                        <div className="scroll"><table className="tbl ed rows">
                            <thead><tr><th>Factor</th><th>Long-run level</th><th>Your forecast</th><th>Effect on default risk</th><th>Source</th></tr></thead>
                            <tbody>{s.factors.map((f, i) => { const eff = Math.exp(f.sens * (f.base - f.baseline)) - 1;
                                return <tr key={f.name}>
                                    <td><b>{f.name}</b> <span className="mut">({f.unit})</span></td>
                                    <td>{f.baseline}</td>
                                    <td><Num w={110} value={f.base} step={0.1} onChange={n => editBase(i, n)} /></td>
                                    <td className={Math.abs(eff) < 0.0005 ? 'mut' : eff > 0 ? 'neg' : 'pos'}>{Math.abs(eff) < 0.0005 ? 'none' : (eff > 0 ? '+' : '') + pct(eff, 1)}</td>
                                    <td className="mut sm">{f.src ? 'World Bank, ' + (f.src.match(/data year (\d+)/)?.[1] || '') : 'Manual'}</td></tr>; })}
                                <tr className="tot"><td>All factors together</td><td /><td /><td className={mB > 1.0005 ? 'neg' : mB < 0.9995 ? 'pos' : 'mut'}>{mB > 1.0005 || mB < 0.9995 ? (mB > 1 ? '+' : '') + pct(mB - 1, 1) : 'none'}</td><td /></tr>
                            </tbody></table></div>
                        <p className="mut sm">"Long-run level" is the normal level from the past 10 years. A forecast worse than that level raises the chance of not paying; a better one lowers it.</p>

                        <h4 className="h4">How the forecast is used</h4>
                        <table className="tbl rows"><tbody>
                            <tr><td><label className="radio"><input type="radio" checked={!single} onChange={() => set({ wBase: 0.5, wUp: 0.2, wDown: 0.3 })} /> <b>Three outcomes, weighted</b> <span className="tag">Recommended</span></label></td>
                                <td className="mut">Your forecast plus a better and a worse case, weighted {pct(s.wBase, 0)} / {pct(s.wUp, 0)} / {pct(s.wDown, 0)}. IFRS 9 B5.5.42 expects a range of outcomes because losses rise faster in bad times than they fall in good times.</td></tr>
                            <tr><td><label className="radio"><input type="radio" checked={single} onChange={() => set({ wBase: 1, wUp: 0, wDown: 0 })} /> <b>Your forecast only</b></label></td>
                                <td className="mut">One outcome. Simpler, but may understate the allowance: document why one scenario is enough.</td></tr>
                        </tbody></table>

                        {macro.status === 'fail' && <Note tone="warn" title="Economic data not loaded">{macro.msg}</Note>}
                        <details className="dx"><summary>Advanced: better and worse cases, weights and strength</summary>
                            <p className="mut sm">The better and worse cases move with your forecast. They sit one typical year-to-year swing either side of it.</p>
                            <div className="scroll"><table className="tbl ed"><thead><tr><th>Factor</th><th>Better case</th><th>Worse case</th><th>Strength <Info text="Change in log default rate per unit. -0.08 means +1 point of GDP growth lowers default rates by about 8%. Illustrative: estimate from your own loss history." /></th></tr></thead>
                                <tbody>{s.factors.map((f, i) => { const up = (p: Partial<typeof f>) => set({ factors: s.factors.map((x, j) => j === i ? { ...x, ...p } : x) }); return <tr key={f.name}><td>{f.name}</td>
                                    <td><Num w={100} value={f.up} step={0.1} onChange={n => up({ up: n })} /></td><td><Num w={100} value={f.down} step={0.1} onChange={n => up({ down: n })} /></td>
                                    <td><Num w={100} value={f.sens} step={0.005} onChange={n => up({ sens: n })} /></td></tr>; })}</tbody></table></div>
                            {!single && <table className="tbl ed"><thead><tr><th>Weight</th><th>Normal (your forecast)</th><th>Better</th><th>Worse</th></tr></thead><tbody><tr><td>Probability</td>
                                <td><Num w={100} value={s.wBase} pctMode onChange={n => set({ wBase: n })} /></td><td><Num w={100} value={s.wUp} pctMode onChange={n => set({ wUp: n })} /></td><td><Num w={100} value={s.wDown} pctMode onChange={n => set({ wDown: n })} /></td></tr></tbody></table>}
                            {Math.abs(wTotal - 1) > 0.0005 && <Note tone="warn" title="Weights do not add to 100%">They add to {pct(wTotal, 1)}. They are scaled to 100% in the calculation.</Note>}
                            <Field label="Long-run level based on"><select className="in" value={robust ? 'r' : 'm'} onChange={e => setRobust(e.target.value === 'r')}><option value="r">Median of 10 years (recommended)</option><option value="m">Average of 10 years</option></select></Field>
                            {macroRes.filter(r => r.found).map(r => <div key={r.name} className="scroll"><p className="sm"><b>{r.name}</b> <span className="mut">({r.code}; latest year {r.usedYear})</span></p>
                                <table className="tbl ed"><thead><tr>{r.series!.map(p => <th key={p.year}>{p.year}</th>)}</tr></thead><tbody><tr>{r.series!.map(p => <td key={p.year}>{p.value.toFixed(1)}</td>)}</tr></tbody></table></div>)}
                        </details>
                        <Note tone="warn" title="Check the forecasts">World Bank figures are the latest actuals, not forecasts. For reporting, type your own forecast, for example from the IMF World Economic Outlook.</Note>
                        <div className="nav"><Btn kind="ghost" onClick={() => setSetTab('basics')}>Back</Btn><Btn onClick={() => setSetTab('rates')}>Next: loss rates</Btn></div>
                    </Card>;
                })()}

                {setTab === 'rates' && (() => {
                    const basis = s.rateBasis || 'example';
                    const lossMode = basis === 'history' || s.rateType === 'loss';
                    const setBands = (b: Bucket[], extra: Partial<Settings> = {}) => set({ buckets: b, ...extra });
                    const editRate = (i: number, n: number) => setBands(s.buckets.map((b, j) => j === i ? { ...b, pd: Math.min(1, Math.max(0, n)) } : b), basis === 'example' ? { rateBasis: 'own' } : {});
                    const editHist = (i: number, p: Partial<Bucket>) => setBands(s.buckets.map((b, j) => { if (j !== i) return b; const nb = { ...b, ...p }; const hr = historyRate(nb); return hr === null ? nb : { ...nb, pd: hr }; }));
                    const days = (b: Bucket, i: number) => i === 0 ? 'Not yet due' : i === s.buckets.length - 1 ? 'Over ' + (b.from - 1) + ' days' : b.from + ' to ' + b.to + ' days';
                    return <Card title="Loss rates" sub="The rate for each age band is the share of money in that band you expect to lose (IFRS 9 provision matrix, B5.5.35).">
                        <h4 className="h4 first">1. Basic settings</h4>
                        <table className="tbl ed rows"><tbody>
                            <tr><td><b>Share lost if not paid (LGD)</b><small>After recoveries and collateral</small></td>
                                <td>{lossMode ? <span className="mut">Not used: already inside the loss rates</span> : <Num w={130} value={s.lgd} pctMode onChange={n => set({ lgd: Math.min(1, Math.max(0, n)) })} />}</td></tr>
                            <tr><td><b>Payment terms</b><small>Used when a row has no due date</small></td><td><Num w={130} value={s.termsDays} onChange={n => set({ termsDays: n })} suffix="days" /></td></tr>
                            <tr><td><b>Discount rate</b><small>Time value of money (5.5.17(b)). 0 = no discounting</small></td><td><Num w={130} value={s.eir} pctMode step={0.5} onChange={n => set({ eir: n })} /></td></tr>
                            <tr><td><b>Time to collect</b><small>Used for discounting</small></td><td><Num w={130} value={s.months} onChange={n => set({ months: n })} suffix="months" /></td></tr>
                            <tr><td><b>Management overlay</b><small>Extra margin for risks not in the model. Document why</small></td><td><Num w={130} value={s.overlay} pctMode step={1} onChange={n => set({ overlay: n })} /></td></tr>
                        </tbody></table>

                        <h4 className="h4">2. Rate for each age band</h4>
                        <div className="basis">
                            <span className="mut">Where do the rates come from?</span>
                            <Seg<'example' | 'own' | 'history'> value={basis} onChange={k => k === 'example' ? set({ rateBasis: 'example', rateType: 'pd', buckets: defaultBuckets() }) : k === 'history' ? set({ rateBasis: 'history', rateType: 'loss', buckets: s.buckets.map(b => { const hr = historyRate(b); return hr === null ? b : { ...b, pd: hr }; }) }) : set({ rateBasis: 'own' })}
                                options={[{ key: 'example', label: 'Example rates' }, { key: 'own', label: 'My own rates' }, { key: 'history', label: 'Calculate from my history' }]} />
                        </div>
                        {basis === 'example' && <Note tone="warn" title="Example rates">These rates are illustrations, not from IFRS 9 or your data. Replace them before reporting.</Note>}
                        {basis === 'own' && <table className="tbl rows"><tbody><tr><td><b>My rates are</b></td><td><select className="in" value={s.rateType} onChange={e => set({ rateType: e.target.value as any })}><option value="pd">Chance of not paying (PD), multiplied by LGD</option><option value="loss">Loss rates, LGD already included</option></select></td></tr></tbody></table>}
                        {basis === 'history' && s.buckets.some(b => historyRate(b) === null) && <Note tone="warn" title={`${s.buckets.filter(b => historyRate(b) === null).length} of ${s.buckets.length} bands have no history yet`}>Their current rate is used as a loss rate with no LGD, which can overstate the allowance. Enter the past amount and the amount never collected for every band, or type the rate you can support.</Note>}
                        {basis === 'history' && <p className="mut sm">For each band, enter the amount that was in the band in past periods and how much of it was never collected. Rate = never collected / amount in band. These are loss rates, so LGD is not applied again. IFRS 9 B5.5.52 asks you to adjust them for current and future conditions; the economic outlook does that.</p>}
                        <div className="scroll"><table className="tbl ed bands"><thead><tr><th>Age band</th><th>Days past due</th><th>Up to day</th>
                            {basis === 'history' && <><th>Past amount in band</th><th>Never collected</th></>}
                            <th>Rate</th><th>How the rate was set</th><th>Items now</th><th>Owed now</th><th>Expected loss now</th><th /></tr></thead>
                            <tbody>{s.buckets.map((b, i) => { const rs = res.rows.filter(r => r.bucket === b.label); const hr = historyRate(b);
                                return <tr key={i}>
                                    <td><input className="in" style={{ width: 130 }} value={b.label} onChange={e => setBands(s.buckets.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td>
                                    <td className="mut">{days(b, i)}</td>
                                    <td>{i < s.buckets.length - 1 ? <Num w={90} value={b.to} onChange={n => setBands(setBandEnd(s.buckets, i, n))} /> : <span className="mut">and over</span>}</td>
                                    {basis === 'history' && <><td><Num w={130} value={b.hBal || 0} onChange={n => editHist(i, { hBal: Math.max(0, n) })} /></td><td><Num w={130} value={b.hLost || 0} onChange={n => editHist(i, { hLost: Math.max(0, n) })} /></td></>}
                                    <td>{basis === 'history' && hr !== null ? <b>{pct(b.pd, 2)}</b> : <Num w={100} value={b.pd} pctMode onChange={n => editRate(i, n)} />}</td>
                                    <td className="basis-t">{bandBasis(b, s)}</td>
                                    <td>{rs.length}</td><td>{fmt(rs.reduce((a, r) => a + r.amount, 0))}</td><td>{fmt(rs.reduce((a, r) => a + r.ecl, 0))}</td>
                                    <td>{s.buckets.length > 2 && <Btn small kind="ghost" onClick={() => setBands(removeBand(s.buckets, i))}>Remove</Btn>}</td></tr>; })}</tbody></table></div>
                        <div className="row">
                            <Btn small kind="ghost" onClick={() => setBands(addBand(s.buckets))}>Add a band</Btn>
                            <Btn small kind="ghost" onClick={() => set({ buckets: defaultBuckets(), rateBasis: 'example', rateType: 'pd' })}>Reset to examples</Btn>
                            <span className="grow" />
                            <Btn small kind="ghost" onClick={() => dlBands('xlsx')}>Download bands (Excel)</Btn>
                            <Btn small kind="ghost" onClick={() => dlBands('csv')}>Download (CSV)</Btn>
                        </div>
                        {segNames.length > 0 && <details className="dx"><summary>Riskier or safer groups (optional)</summary><p className="mut sm">1.0 = average. Use 1.5 for a riskier group and 0.7 for a safer one.</p>
                            <table className="tbl ed"><thead><tr><th>Group</th><th>Multiplier</th></tr></thead><tbody>{segNames.map(n => <tr key={n}><td>{n}</td><td><Num w={100} step={0.1} value={s.segMult[n] ?? 1} onChange={v => set({ segMult: { ...s.segMult, [n]: v } })} /></td></tr>)}</tbody></table></details>}
                        <div className="nav"><Btn kind="ghost" onClick={() => setSetTab('economy')}>Back</Btn><Btn onClick={() => setSetTab('staging')}>Next: stages</Btn></div>
                    </Card>;
                })()}

                {setTab === 'staging' && (() => {
                    const cnt = (f: (r: Calc) => boolean) => res.rows.filter(f).length;
                    const hasPd = res.rows.some(r => r.pdIn !== null && r.origPd !== null); const hasUndrawn = res.rows.some(r => r.undrawn > 0);
                    return <Card title="Stages" sub="Each item is placed in Stage 1, 2 or 3 by the rules below. Under the simplified approach the stage is shown for disclosure only; under the general approach it decides 12-month or lifetime loss.">
                        <table className="tbl ed rows"><thead><tr><th>Rule</th><th>Setting</th><th>IFRS 9</th><th>Items caught now</th></tr></thead><tbody>
                            <tr><td><b>Move to Stage 2</b> when more than ... days past due</td><td><Num w={120} value={s.sicrDays} onChange={n => set({ sicrDays: Math.max(0, Math.round(n)) })} suffix="days" /></td><td className="mut sm">5.5.11, presumed 30</td><td>{cnt(r => r.stage === 2 && /days past due/.test(r.stageWhy))}</td></tr>
                            <tr><td><b>Move to Stage 3 (default)</b> when more than ... days past due</td><td><Num w={120} value={s.defaultDays} onChange={n => set({ defaultDays: Math.max(0, Math.round(n)) })} suffix="days" /></td><td className="mut sm">B5.5.37, presumed 90</td><td>{cnt(r => r.stage === 3 && /days past due/.test(r.stageWhy))}</td></tr>
                            <tr><td><b>Move to Stage 3</b> when flagged credit-impaired in your file</td><td className="mut">Always on</td><td className="mut sm">Appendix A</td><td>{cnt(r => r.stage === 3 && /impaired/i.test(r.stageWhy))}</td></tr>
                            <tr><td><b>Move to Stage 2</b> when PD has grown to ... times the PD at the start</td><td><Num w={120} value={s.sicrMult} step={0.25} onChange={n => set({ sicrMult: Math.max(1, n) })} suffix="x" /></td><td className="mut sm">5.5.9</td><td>{hasPd ? cnt(r => /PD now/.test(r.stageWhy)) : <span className="mut">needs PD columns</span>}</td></tr>
                            <tr><td><b>Your own stage</b> from a "Stage" column in your file</td><td className="mut">Overrides the rules</td><td className="mut sm">5.5.10, B5.5.17</td><td>{cnt(r => /your own/.test(r.stageWhy))}</td></tr>
                            <tr><td><b>Unused credit limits</b> expected to be drawn (CCF)</td><td><Num w={120} value={s.ccf} pctMode onChange={n => set({ ccf: Math.min(1, Math.max(0, n)) })} /></td><td className="mut sm">B5.5.31</td><td>{hasUndrawn ? cnt(r => r.undrawn > 0) : <span className="mut">needs undrawn column</span>}</td></tr>
                        </tbody></table>
                        {(s.sicrDays !== 30 || s.defaultDays !== 90) && <Note tone="warn" title="You changed a rebuttable presumption">Keep reasonable and supportable evidence for your auditor (5.5.11, B5.5.37).</Note>}
                        {s.defaultDays < s.sicrDays && <Note tone="bad" title="Check the settings">The Stage 3 line is lower than the Stage 2 line.</Note>}
                        <h4 className="h4">Result</h4>
                        <table className="tbl ed rows"><thead><tr><th>Stage</th><th>Meaning</th><th>Items</th><th>Owed</th><th>Expected loss</th><th>Coverage</th></tr></thead><tbody>
                            {STAGES.map(k => { const x = res.byStage.find(y => y.key === k); if (!x && k === 'POCI') return null; const g = x || { n: 0, gross: 0, ecl: 0 };
                                return <tr key={k}><td><i className="dot" style={{ background: STAGE_COLOR[k] }} /><b>{k}</b></td><td className="mut">{k === 'Stage 1' ? 'Performing' : k === 'Stage 2' ? 'Credit risk increased significantly' : k === 'Stage 3' ? 'Credit-impaired / default' : 'Credit-impaired when bought or lent'}</td>
                                    <td>{g.n}</td><td>{fmt(g.gross)}</td><td>{fmt(g.ecl)}</td><td>{pct(g.gross ? g.ecl / g.gross : 0, 1)}</td></tr>; })}
                            <tr className="tot"><td>Total</td><td /><td>{res.rows.length}</td><td>{fmt(res.gross)}</td><td>{fmt(res.ecl)}</td><td>{pct(res.coverage, 1)}</td></tr>
                        </tbody></table>
                        <div className="nav"><Btn kind="ghost" onClick={() => setSetTab('rates')}>Back</Btn><Btn onClick={() => setSetTab('specific')}>Next: individual customers</Btn></div>
                    </Card>;
                })()}

                {setTab === 'specific' && <Card title="Customers assessed one by one" sub="For example a customer in dispute, in insolvency or on a payment plan. They are taken out of the group calculation (5.5.4).">
                    {Object.entries(s.specific).length > 0 ? <div className="scroll"><table className="tbl ed"><thead><tr><th>Customer</th><th>Type</th><th className="r">Value</th><th>Reason</th><th /></tr></thead><tbody>{Object.entries(s.specific).map(([c, v]) => <tr key={c}><td>{c}</td>
                        <td><select className="in" value={v.mode} onChange={e => setSpec(c, { mode: e.target.value as any, value: 0 })}><option value="pct">% of what they owe</option><option value="amt">Fixed amount</option></select></td>
                        <td className="r"><Num w={110} pctMode={v.mode === 'pct'} value={v.value} onChange={n => setSpec(c, { value: Math.max(0, n) })} /></td>
                        <td><input className="in" style={{ width: 180 }} value={v.note} placeholder="Reason (for the audit file)" onChange={e => setSpec(c, { note: e.target.value })} /></td>
                        <td className="r"><Btn small kind="ghost" onClick={() => { const n = { ...s.specific }; delete n[c]; set({ specific: n }); }}>Remove</Btn></td></tr>)}</tbody></table></div> : <p className="mut">None yet.</p>}
                    <div className="form"><Field label="Add a customer"><select className="in" value="" onChange={e => { if (e.target.value) set({ specific: { ...s.specific, [e.target.value]: { mode: 'pct', value: 1, note: '' } } }); }}><option value="">- choose -</option>{custNames.filter(c => !s.specific[c]).map(c => <option key={c} value={c}>{c}</option>)}</select></Field></div>
                    <div className="nav"><Btn kind="ghost" onClick={() => setSetTab('staging')}>Back</Btn><Btn onClick={() => setSetTab('prior')}>Next: last period</Btn></div>
                </Card>}

                {setTab === 'prior' && <Card title="Compare with last period (optional)" sub="Add last period's file with the same columns. The dashboard then shows what changed and the IFRS 7 reconciliation by stage.">
                    <input ref={priorRef} type="file" accept=".xlsx,.csv,.txt,.tsv" hidden onChange={e => { void onPrior(e.target.files?.[0]); e.target.value = ''; }} />
                    {!prior ? <div className="row"><Btn kind="ghost" onClick={() => priorRef.current?.click()}>Add last period's file</Btn>{fileName === 'Demo: trade receivables' && <Btn kind="ghost" onClick={() => { const p = samplePrior(); setPrior({ name: 'Demo last period (30 Jun 2026)', rows: p.rows, date: p.date }); }}>Use demo last period</Btn>}</div> : <div>
                        <Note tone="ok" title={'Added ' + prior.name}>{prior.rows.length} rows.</Note>
                        <div className="form"><Field label="Reporting date of that file"><input className="in" type="date" value={prior.date} onChange={e => e.target.value && setPrior({ ...prior, date: e.target.value })} /></Field></div>
                        <Btn small kind="ghost" onClick={() => setPrior(null)}>Remove</Btn></div>}
                    {priorErr && <Note tone="bad" title="This file did not work">{priorErr}</Note>}
                    <div className="nav"><Btn kind="ghost" onClick={() => setSetTab('specific')}>Back</Btn><Btn onClick={() => go(4)}>See dashboard</Btn></div>
                </Card>}
            </div>}

            {/* ---------------- STEP 4 ---------------- */}
            {!showMethod && step === 4 && res && built && <div className="pane">
                <Dashboard res={res} s={s} inv={built.rows} where={countryName + ' ' + year} prior={priorCmp} onDlX={dlXlsx} onDlC={dlCsv} copyText={tsvAll} onEdit={() => go(3)} onApply={p => set(p)} />
            </div>}

            <Closing>Results use the assumptions you set. The starting rates are illustrative, and the output is a draft for review, not an audited figure. Your data stays in your browser.</Closing>
        </div>
    </FileCard>;
}

function Glossary() {
    return <details className="dx"><summary>What do these words mean?</summary>
        <dl className="gl">
            <dt>Expected credit loss (ECL)</dt><dd>The amount you expect not to collect. IFRS 9 says you must book it as a "loss allowance" before any loss happens.</dd>
            <dt>Days past due</dt><dd>How many days late a payment is, counted from its due date to the reporting date.</dd>
            <dt>PD - chance of not paying</dt><dd>The probability that a customer defaults. It grows as items get older.</dd>
            <dt>LGD - share lost</dt><dd>If a customer defaults, the share of the amount you lose after recoveries and collateral.</dd>
            <dt>Stage 1, 2, 3</dt><dd>Stage 1 = performing (12-month loss under the general approach). Stage 2 = credit risk has increased significantly, presumed after 30 days past due (lifetime loss). Stage 3 = credit-impaired, presumed after 90 days past due (lifetime loss). Under the simplified approach everything carries lifetime loss and stages are shown for disclosure.</dd>
            <dt>POCI</dt><dd>Purchased or originated credit-impaired: bought or lent when already in default. The allowance is the change in lifetime loss since then (5.5.13).</dd>
            <dt>Write-off</dt><dd>Removing an amount you no longer reasonably expect to recover. It uses up the allowance (5.4.4).</dd>
        </dl></details>;
}
