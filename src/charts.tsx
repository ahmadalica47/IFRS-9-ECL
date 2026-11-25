import React, { useState } from 'react';
import { fmt, pct, short } from './ui';

export const RISK = ['#10b981', '#84cc16', '#facc15', '#fb923c', '#f97316', '#ef4444', '#be123c', '#9f1239'];
export const C = { teal: '#0f766e', teal2: '#14b8a6', indigo: '#6366f1', grey: '#cbd5e1', red: '#e11d48', amber: '#f59e0b', ink: '#0f2a33', violet: '#8b5cf6' };

type Tip = { x: number; y: number; html: React.ReactNode } | null;
function useTip() { const [tip, setTip] = useState<Tip>(null); return { tip, setTip }; }
const TipBox = ({ tip }: { tip: Tip }) => tip ? <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.html}</div> : null;
const rel = (e: React.MouseEvent, el: HTMLElement | null) => { const r = el?.getBoundingClientRect(); return r ? { x: e.clientX - r.left + 12, y: e.clientY - r.top - 10 } : { x: 0, y: 0 }; };

// Vertical bars, one or more series. Click a group to select it.
export function Bars({ labels, series, height = 220, colors, perBar, selected, onSelect, fmtV = short, tipExtra }: {
    labels: string[]; series: { name: string; values: number[] }[]; height?: number; colors?: string[]; perBar?: string[];
    selected?: string | null; onSelect?: (label: string) => void; fmtV?: (n: number) => string; tipExtra?: (i: number) => React.ReactNode;
}) {
    const { tip, setTip } = useTip(); const ref = React.useRef<HTMLDivElement>(null);
    const W = Math.max(520, labels.length * (series.length > 1 ? 72 : 60) + 50), H = height, pad = { l: 46, r: 8, t: 16, b: 44 };
    const all = series.flatMap(s => s.values); const max = Math.max(1, ...all); const min = Math.min(0, ...all);
    const cs = colors || [C.teal2, C.grey];
    const bw = (W - pad.l - pad.r) / Math.max(1, labels.length); const gw = bw * 0.7 / series.length;
    const y = (v: number) => pad.t + (H - pad.t - pad.b) * (max - v) / (max - min || 1);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => min + t * (max - min));
    return <div className="ch" ref={ref} onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="ch-svg" role="img" aria-label={series.map(s => s.name).join(', ')}>
            {ticks.map((t, i) => <g key={i}><line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" /><text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="ax">{short(t)}</text></g>)}
            {labels.map((lb, i) => {
                const dim = selected && selected !== lb;
                return <g key={lb + i} className={onSelect ? 'clk' : ''} opacity={dim ? 0.35 : 1}
                    onClick={() => onSelect?.(lb)}
                    onMouseMove={e => setTip({ ...rel(e, ref.current), html: <><b>{lb}</b>{series.map((s, j) => <div key={j}><i style={{ background: perBar && series.length === 1 ? perBar[i % perBar.length] : cs[j % cs.length] }} />{s.name}: {fmtV(s.values[i])}</div>)}{tipExtra?.(i)}{onSelect && <div className="tip-h">Click to filter</div>}</> })}>
                    <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
                    {series.map((s, j) => { const v = s.values[i]; const x = pad.l + i * bw + bw * 0.15 + j * gw; const y0 = y(Math.max(0, v)), y1 = y(Math.min(0, v));
                        return <rect key={j} x={x} y={y0} width={Math.max(1, gw - 3)} height={Math.max(0, y1 - y0)} rx="3" fill={perBar && series.length === 1 ? perBar[i % perBar.length] : cs[j % cs.length]} />; })}
                    {(() => { const t = lb.replace(/ days$/, 'd').replace(/^Over (\d+)d$/, '>$1d'); const mx = Math.max(4, Math.floor(bw / 6.5)); const words = t.length > mx && t.includes(' ') ? [t.slice(0, t.lastIndexOf(' ', mx) > 0 ? t.lastIndexOf(' ', mx) : mx), t.slice((t.lastIndexOf(' ', mx) > 0 ? t.lastIndexOf(' ', mx) : mx)).trim()] : [t];
                        return words.slice(0, 2).map((w, k) => <text key={k} x={pad.l + i * bw + bw / 2} y={H - pad.b + 14 + k * 12} textAnchor="middle" className="ax">{w.length > mx ? w.slice(0, mx - 1) + '…' : w}</text>); })()}
                </g>;
            })}
        </svg>
        {series.length > 1 && <div className="lg">{series.map((s, j) => <span key={s.name}><i style={{ background: cs[j % cs.length] }} />{s.name}</span>)}</div>}
        <TipBox tip={tip} />
    </div>;
}

// Horizontal ranking bars. Click a row to select it.
export function HBars({ items, fmtV = fmt, onSelect, selected, color = C.indigo }: { items: { label: string; value: number; sub?: string; color?: string }[]; fmtV?: (n: number) => string; onSelect?: (l: string) => void; selected?: string | null; color?: string }) {
    const max = Math.max(1, ...items.map(i => Math.abs(i.value)));
    return <div className="hb">{items.map(i => <button type="button" key={i.label} className={'hbr' + (selected === i.label ? ' on' : '') + (selected && selected !== i.label ? ' dim' : '')} onClick={() => onSelect?.(i.label)} disabled={!onSelect}>
        <div className="hbl"><span>{i.label}</span><b>{fmtV(i.value)}</b></div>
        <div className="hbt"><i style={{ width: (Math.abs(i.value) / max) * 100 + '%', background: i.color || color }} /></div>
        {i.sub && <small>{i.sub}</small>}</button>)}</div>;
}

// Donut with hover and click.
export function Donut({ parts, center, centerSub, onSelect, selected, size = 150 }: { parts: { label: string; value: number; color: string }[]; center: string; centerSub?: string; onSelect?: (l: string) => void; selected?: string | null; size?: number }) {
    const [hov, setHov] = useState<string | null>(null);
    const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0);
    const R = 60, r = 40, cx = 70, cy = 70; let a0 = -Math.PI / 2;
    const arcs = parts.filter(p => p.value > 0).map(p => {
        const frac = p.value / Math.max(total, 1); const a1 = a0 + frac * Math.PI * 2 * 0.99999; const large = a1 - a0 > Math.PI ? 1 : 0;
        const pt = (a: number, rad: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
        const d = `M ${pt(a0, R)} A ${R} ${R} 0 ${large} 1 ${pt(a1, R)} L ${pt(a1, r)} A ${r} ${r} 0 ${large} 0 ${pt(a0, r)} Z`; a0 = a1; return { ...p, d, frac };
    });
    const h = arcs.find(a => a.label === hov);
    return <div className="dn">
        <svg viewBox="0 0 140 140" style={{ width: size, height: size }} role="img" aria-label="Share chart">
            {arcs.map(p => <path key={p.label} d={p.d} fill={p.color} className={onSelect ? 'clk' : ''} opacity={(selected && selected !== p.label) || (hov && hov !== p.label) ? 0.35 : 1}
                onMouseEnter={() => setHov(p.label)} onMouseLeave={() => setHov(null)} onClick={() => onSelect?.(p.label)} />)}
            <text x="70" y="68" textAnchor="middle" className="dn-c">{h ? pct(h.frac, 0) : center}</text>
            <text x="70" y="84" textAnchor="middle" className="dn-s">{h ? (h.label.length > 16 ? h.label.slice(0, 15) + '…' : h.label) : centerSub}</text>
        </svg>
        <div className="lg col">{parts.map(p => <button type="button" key={p.label} className={'lg-b' + (selected === p.label ? ' on' : '')} onClick={() => onSelect?.(p.label)} disabled={!onSelect} onMouseEnter={() => setHov(p.label)} onMouseLeave={() => setHov(null)}>
            <i style={{ background: p.color }} />{p.label}<b>{total ? pct(Math.max(0, p.value) / total, 0) : '0%'}</b><span className="mut">{short(p.value)}</span></button>)}</div>
    </div>;
}

// Waterfall: opening -> movements -> closing
export function Waterfall({ steps, height = 240 }: { steps: { label: string; value: number; total?: boolean }[]; height?: number }) {
    const { tip, setTip } = useTip(); const ref = React.useRef<HTMLDivElement>(null);
    let run = 0; const bars = steps.map(s => { if (s.total) { run = s.value; return { ...s, a: 0, b: s.value }; } const a = run; run += s.value; return { ...s, a, b: run }; });
    const max = Math.max(1, ...bars.map(b => Math.max(b.a, b.b))); const min = Math.min(0, ...bars.map(b => Math.min(b.a, b.b)));
    const W = Math.max(680, steps.length * 150), H = height, pad = { l: 50, r: 10, t: 16, b: 52 };
    const bw = (W - pad.l - pad.r) / steps.length; const y = (v: number) => pad.t + (H - pad.t - pad.b) * (max - v) / (max - min || 1);
    return <div className="ch" ref={ref} onMouseLeave={() => setTip(null)}><svg viewBox={`0 0 ${W} ${H}`} className="ch-svg" role="img" aria-label="Movement waterfall">
        {[0, 0.5, 1].map(t => { const v = min + t * (max - min); return <g key={t}><line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" /><text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="ax">{short(v)}</text></g>; })}
        {bars.map((b, i) => { const top = y(Math.max(b.a, b.b)), bot = y(Math.min(b.a, b.b)); const col = b.total ? C.indigo : b.value >= 0 ? C.red : '#10b981';
            return <g key={i} onMouseMove={e => setTip({ ...rel(e, ref.current), html: <><b>{b.label}</b><div>{b.total ? fmt(b.value) : (b.value >= 0 ? '+' : '') + fmt(b.value)}</div></> })}>
                <rect x={pad.l + i * bw + bw * 0.18} y={top} width={bw * 0.64} height={Math.max(1, bot - top)} rx="3" fill={col} />
                {i < bars.length - 1 && <line x1={pad.l + i * bw + bw * 0.82} x2={pad.l + (i + 1) * bw + bw * 0.18} y1={y(b.b)} y2={y(b.b)} stroke="#94a3b8" strokeDasharray="3 3" />}
                <text x={pad.l + i * bw + bw / 2} y={H - pad.b + 14} textAnchor="middle" className="ax">{b.label.split(' ').slice(0, 2).join(' ')}</text>
                <text x={pad.l + i * bw + bw / 2} y={H - pad.b + 26} textAnchor="middle" className="ax">{b.label.split(' ').slice(2, 4).join(' ')}</text>
            </g>; })}
    </svg><TipBox tip={tip} /></div>;
}

// Heatmap: rows x columns, colour = coverage. Click a cell to filter both.
export function Heatmap({ rows, cols, cell, onSelect }: { rows: string[]; cols: string[]; cell: (r: string, c: string) => { gross: number; ecl: number }; onSelect?: (r: string, c: string) => void }) {
    const vals = rows.flatMap(r => cols.map(c => { const x = cell(r, c); return x.gross > 0 ? x.ecl / x.gross : 0; })); const max = Math.max(0.0001, ...vals);
    const bg = (v: number) => { const t = Math.min(1, v / max); return `rgba(225, 29, 72, ${0.06 + t * 0.8})`; };
    return <div className="scroll"><table className="hm"><thead><tr><th />{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map(r => <tr key={r}><th>{r}</th>{cols.map(c => { const x = cell(r, c); const v = x.gross > 0 ? x.ecl / x.gross : 0;
            return <td key={c} style={{ background: x.gross > 0 ? bg(v) : 'transparent', color: v / max > 0.55 ? '#fff' : undefined }} className={onSelect && x.gross ? 'clk' : ''} title={`${r} / ${c}\nOwed ${fmt(x.gross)}\nExpected loss ${fmt(x.ecl)}`} onClick={() => x.gross && onSelect?.(r, c)}>
                {x.gross > 0 ? pct(v, 1) : '-'}</td>; })}</tr>)}</tbody></table></div>;
}

// 100% stacked bar, e.g. share of gross and of ECL by stage
export function Stack100({ rows, colors, onSelect }: { rows: { label: string; parts: { key: string; value: number }[] }[]; colors: Record<string, string>; onSelect?: (k: string) => void }) {
    return <div className="s100">{rows.map(r => { const t = r.parts.reduce((a, p) => a + Math.max(0, p.value), 0);
        return <div key={r.label} className="s100-r"><span className="s100-l">{r.label}</span><div className="s100-b">{r.parts.filter(p => p.value > 0).map(p =>
            <button type="button" key={p.key} style={{ width: (p.value / (t || 1)) * 100 + '%', background: colors[p.key] }} title={`${p.key}: ${fmt(p.value)} (${pct(p.value / (t || 1), 1)})`} onClick={() => onSelect?.(p.key)}>{p.value / (t || 1) > 0.08 ? pct(p.value / (t || 1), 0) : ''}</button>)}</div></div>; })}</div>;
}
