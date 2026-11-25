import React, { useMemo, useState } from 'react';

// ---------- formatting ----------
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const pct = (n: number, d = 1) => (isFinite(n) ? (n * 100).toFixed(d) : '0') + '%';
export const short = (n: number) => Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(0) + 'K' : fmt(n);
export const acct = (n: number) => n >= 0 ? fmt(n) : '(' + fmt(-n) + ')';
export const STAGE_COLOR: Record<string, string> = { 'Stage 1': '#10b981', 'Stage 2': '#f59e0b', 'Stage 3': '#e11d48', POCI: '#7c3aed' };
export const STAGE_TEXT: Record<string, { title: string; plain: string; horizon: string }> = {
    'Stage 1': { title: 'Performing', plain: 'No significant increase in credit risk since the start.', horizon: '12-month expected loss' },
    'Stage 2': { title: 'Under-performing', plain: 'Credit risk has increased significantly since the start.', horizon: 'Lifetime expected loss' },
    'Stage 3': { title: 'Credit-impaired', plain: 'In default or credit-impaired.', horizon: 'Lifetime expected loss, PD 100%' },
    POCI: { title: 'Bought / lent credit-impaired', plain: 'Credit-impaired when first recognised.', horizon: 'Change in lifetime loss since recognition' },
};

// ---------- small building blocks ----------
export function Btn({ children, onClick, kind = 'primary', small, disabled, title }: { children: React.ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'light' | 'danger'; small?: boolean; disabled?: boolean; title?: string }) {
    return <button type="button" title={title} className={'btn btn-' + kind + (small ? ' btn-s' : '')} disabled={disabled} onClick={onClick}>{children}</button>;
}
export function Info({ text }: { text: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return <span className="info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <button type="button" className="info-i" aria-label="More information" onClick={() => setOpen(!open)}>i</button>
        {open && <span className="info-pop" role="tooltip">{text}</span>}
    </span>;
}
export function Note({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'ok' | 'bad'; title?: React.ReactNode; children?: React.ReactNode }) {
    const icon = { info: 'i', warn: '!', ok: '✓', bad: '!' }[tone];
    return <div className={'note note-' + tone}><span className="note-ic">{icon}</span><div>{title && <b>{title}</b>}{children && <div className="note-body">{children}</div>}</div></div>;
}
export function Card({ title, sub, right, children, className = '', info }: { title?: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; className?: string; info?: React.ReactNode }) {
    return <section className={'cd ' + className}>
        {(title || right) && <header className="cd-h"><div><h4>{title}{info && <Info text={info} />}</h4>{sub && <p className="cd-sub">{sub}</p>}</div>{right && <div className="cd-r">{right}</div>}</header>}
        {children}
    </section>;
}
export function Kpi({ label, value, sub, tone, delta, info, onClick, active }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; delta?: { txt: string; bad: boolean } | null; info?: React.ReactNode; onClick?: () => void; active?: boolean }) {
    return <div className={'kpi' + (onClick ? ' click' : '') + (active ? ' on' : '')} style={tone ? { ['--tone' as any]: tone } : undefined} onClick={onClick}>
        <small>{label}{info && <Info text={info} />}</small><b>{value}</b>
        {delta ? <span className={'kd ' + (delta.bad ? 'bad' : 'good')}>{delta.txt}</span> : sub ? <span className="kd flat">{sub}</span> : null}
    </div>;
}
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; badge?: string | number }[]; value: T; onChange: (k: T) => void }) {
    return <div className="tabs" role="tablist">{tabs.map(t => <button type="button" role="tab" aria-selected={value === t.key} key={t.key} className={'tab' + (value === t.key ? ' on' : '')} onClick={() => onChange(t.key)}>{t.label}{t.badge !== undefined && <span className="tab-b">{t.badge}</span>}</button>)}</div>;
}
export function Seg<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
    return <div className="seg">{options.map(o => <button type="button" key={o.key} className={value === o.key ? 'on' : ''} onClick={() => onChange(o.key)}>{o.label}</button>)}</div>;
}
export function Field({ label, hint, info, children, wide }: { label: React.ReactNode; hint?: React.ReactNode; info?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
    return <label className={'fl' + (wide ? ' wide' : '')}><span className="fl-l">{label}{info && <Info text={info} />}</span>{children}{hint && <small className="fl-h">{hint}</small>}</label>;
}
export function Num({ value, onChange, step = 1, pctMode = false, w, suffix }: { value: number; onChange: (n: number) => void; step?: number; pctMode?: boolean; w?: number; suffix?: string }) {
    const [txt, setTxt] = useState<string | null>(null);
    const shown = pctMode ? +(value * 100).toFixed(4) : value;
    const input = <input className="in num" type="number" inputMode="decimal" step={step} style={w ? { width: w } : undefined}
        value={txt ?? String(shown)}
        onChange={e => { setTxt(e.target.value); const n = parseFloat(e.target.value); if (!isNaN(n)) onChange(pctMode ? n / 100 : n); }}
        onBlur={() => setTxt(null)} />;
    const sfx = suffix ?? (pctMode ? '%' : '');
    return sfx ? <span className="in-wrap">{input}<span className="in-sfx">{sfx}</span></span> : input;
}
export function Slider({ label, value, min, max, step, onChange, show }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; show: string }) {
    return <label className="sl"><span className="sl-t"><span>{label}</span><b>{show}</b></span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} /></label>;
}
export function Drawer({ title, sub, onClose, children }: { title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
    return <div className="dr-back" onClick={onClose}><aside className="dr" onClick={e => e.stopPropagation()} role="dialog" aria-label="Details">
        <header className="dr-h"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div><button type="button" className="dr-x" onClick={onClose} aria-label="Close">{'×'}</button></header>
        <div className="dr-b">{children}</div></aside></div>;
}
export function Steps({ names, step, can, onGo }: { names: string[]; step: number; can: (k: number) => boolean; onGo: (k: number) => void }) {
    return <ol className="stepper">{names.map((n, i) => {
        const k = i + 1; const done = step > k; const ok = can(k);
        return <li key={n} className={(step === k ? 'on ' : '') + (done ? 'done ' : '') + (ok ? '' : 'off')}>
            <button type="button" disabled={!ok} onClick={() => onGo(k)}><span className="st-n">{done ? '✓' : k}</span><span className="st-l">{n}</span></button></li>;
    })}</ol>;
}

// ---------- data table: search, sort, paging ----------
export type Col<T> = { key: string; label: string; get: (r: T) => string | number; show?: (r: T) => React.ReactNode; num?: boolean; w?: number };
export function DataTable<T>({ rows, cols, onRow, pageSize = 12, search = true, initialSort, empty = 'Nothing to show.' }: { rows: T[]; cols: Col<T>[]; onRow?: (r: T) => void; pageSize?: number; search?: boolean; initialSort?: { key: string; dir: 1 | -1 }; empty?: string }) {
    const [q, setQ] = useState(''); const [sort, setSort] = useState(initialSort || { key: cols[0].key, dir: 1 as 1 | -1 }); const [page, setPage] = useState(0);
    const data = useMemo(() => {
        const ql = q.trim().toLowerCase();
        const f = ql ? rows.filter(r => cols.some(c => String(c.get(r)).toLowerCase().includes(ql))) : rows;
        const c = cols.find(x => x.key === sort.key) || cols[0];
        return f.slice().sort((a, b) => { const x = c.get(a), y = c.get(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
    }, [rows, cols, q, sort]);
    const pages = Math.max(1, Math.ceil(data.length / pageSize)); const pg = Math.min(page, pages - 1);
    return <div className="dt-w">
        {search && <div className="dt-tools"><input className="in" placeholder="Search..." value={q} onChange={e => { setQ(e.target.value); setPage(0); }} /><span className="mut">{data.length} rows</span></div>}
        <div className="scroll"><table className="tbl"><thead><tr>{cols.map(c => <th key={c.key} className={c.num ? 'r' : ''} style={c.w ? { width: c.w } : undefined}>
            <button type="button" className="th-b" onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (-sort.dir as 1 | -1) : (c.num ? -1 : 1) })}>{c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>)}</tr></thead>
            <tbody>{data.slice(pg * pageSize, pg * pageSize + pageSize).map((r, i) => <tr key={i} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>{cols.map(c => <td key={c.key} className={c.num ? 'r' : ''}>{c.show ? c.show(r) : c.get(r)}</td>)}</tr>)}
                {!data.length && <tr><td colSpan={cols.length} className="mut">{empty}</td></tr>}</tbody></table></div>
        {pages > 1 && <div className="dt-pg"><Btn small kind="ghost" disabled={pg === 0} onClick={() => setPage(pg - 1)}>Previous</Btn><span className="mut">Page {pg + 1} of {pages}</span><Btn small kind="ghost" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)}>Next</Btn></div>}
    </div>;
}
