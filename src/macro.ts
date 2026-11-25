import { Factor } from './ecl';
const WB = 'https://api.worldbank.org/v2';
export type Country = { id: string; name: string };
export const FALLBACK_COUNTRIES: Country[] = [
  ['SAU', 'Saudi Arabia'], ['ARE', 'United Arab Emirates'], ['KWT', 'Kuwait'], ['QAT', 'Qatar'], ['BHR', 'Bahrain'], ['OMN', 'Oman'], ['EGY', 'Egypt, Arab Rep.'],
  ['JOR', 'Jordan'], ['IRQ', 'Iraq'], ['LBN', 'Lebanon'], ['MAR', 'Morocco'], ['TUR', 'Turkiye'], ['PAK', 'Pakistan'], ['IND', 'India'], ['GBR', 'United Kingdom'],
  ['USA', 'United States'], ['DEU', 'Germany'], ['FRA', 'France'], ['CHN', 'China'], ['SGP', 'Singapore'], ['ZAF', 'South Africa'], ['NGA', 'Nigeria'],
].map(([id, name]) => ({ id, name }));

export const INDICATORS: { name: string; code: string; label: string }[] = [
  { name: 'Real GDP growth', code: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth (annual %)' },
  { name: 'Unemployment rate', code: 'SL.UEM.TOTL.ZS', label: 'Unemployment, total (% of labour force, modelled ILO)' },
  { name: 'Inflation (CPI)', code: 'FP.CPI.TOTL.ZG', label: 'Inflation, consumer prices (annual %)' },
  { name: 'Lending interest rate', code: 'FR.INR.LEND', label: 'Lending interest rate (%)' },
];

async function once(url: string, signal?: AbortSignal) {
  const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 10000);
  const onAbort = () => ac.abort(); signal?.addEventListener('abort', onAbort);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); signal?.removeEventListener('abort', onAbort); }
}
async function getJSON(url: string, signal?: AbortSignal) {
  try { return await once(url, signal); } catch (e) { if (signal?.aborted) throw e; return once(url, signal); }
}
export async function loadCountries(signal?: AbortSignal): Promise<Country[]> {
  const j = await getJSON(`${WB}/country?format=json&per_page=400`, signal);
  const list: Country[] = (j[1] || []).filter((c: any) => c.region?.value && c.region.value !== 'Aggregates' && c.id).map((c: any) => ({ id: c.id, name: c.name }));
  if (list.length < 100) throw new Error('Unexpected country list');
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export type MacroResult = { name: string; code?: string; found: boolean; err?: boolean; usedYear?: number; base?: number; baseline?: number; shift?: number; n?: number; updated?: string; series?: { year: number; value: number }[]; mean?: number; sd?: number; median?: number; rsd?: number; baseMean?: number; shiftMean?: number; baseMedian?: number; shiftRobust?: number };
export async function loadMacro(iso3: string, year: number, robust: boolean, signal?: AbortSignal): Promise<{ results: MacroResult[]; updated: string }> {
  let updated = '';
  const results = await Promise.all(INDICATORS.map(async ind => {
    try {
      const j = await getJSON(`${WB}/country/${iso3}/indicator/${ind.code}?format=json&date=${year - 16}:${year}&per_page=60`, signal);
      updated = updated || j[0]?.lastupdated || '';
      const pts: Record<number, number> = {};
      (j[1] || []).forEach((r: any) => { if (r.value !== null && r.value !== undefined) pts[+r.date] = +r.value; });
      const years = Object.keys(pts).map(Number).filter(y => y <= year).sort((a, b) => b - a);
      if (!years.length) return { name: ind.name, found: false } as MacroResult;
      const u = years[0]; const base = pts[u];
      const hist = years.filter(y => y < u && y >= u - 10).map(y => pts[y]);
      const n = hist.length;
      const mean = n >= 3 ? hist.reduce((a, b) => a + b, 0) / n : base;
      const sd = n >= 3 ? Math.sqrt(hist.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 1;
      const med = (a: number[]) => { const x = a.slice().sort((p, q) => p - q); const k = x.length; return k ? (k % 2 ? x[(k - 1) / 2] : (x[k / 2 - 1] + x[k / 2]) / 2) : 0; };
      const median = n >= 3 ? med(hist) : base;
      const rsd = n >= 3 ? 1.4826 * med(hist.map(v => Math.abs(v - median))) : 1;
      const series = years.filter(y => y >= u - 10).sort((a, b) => a - b).map(y => ({ year: y, value: pts[y] }));
      const baseline = robust ? median : mean; const spread = robust ? rsd : sd;
      return { name: ind.name, code: ind.code, found: true, usedYear: u, base, baseline, shift: Math.max(0.75 * spread, 0.5), n, series, mean, sd, median, rsd } as MacroResult;
    } catch (e: any) { if (signal?.aborted) throw e; return { name: ind.name, found: false, err: true } as MacroResult; }
  }));
  return { results, updated };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export function applyMacro(factors: Factor[], res: MacroResult[], label: string): Factor[] {
  return factors.map(f => {
    const m = res.find(x => x.name === f.name);
    if (!m || !m.found) return f;
    const fav = f.sens < 0 ? m.shift! : -m.shift!;
    return { ...f, baseline: r2(m.baseline!), base: r2(m.base!), up: r2(m.base! + fav), down: r2(m.base! - fav), src: `World Bank, ${label}, data year ${m.usedYear}` };
  });
}
