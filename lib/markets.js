import { fetchWithTimeout } from './http.js';

// The "AI economy" watchlist. Edit freely — any Yahoo Finance symbol works.
export const WATCHLIST = [
  { symbol: 'NVDA', name: 'Nvidia' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'AVGO', name: 'Broadcom' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'TSM', name: 'TSMC' },
  { symbol: 'ORCL', name: 'Oracle' },
  { symbol: 'PLTR', name: 'Palantir' },
  { symbol: 'TSLA', name: 'Tesla' },
];

export const INDEXES = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^IXIC', name: 'Nasdaq' },
  { symbol: '^SOX', name: 'Chip Index' },
];

let memo = { at: 0, data: null };
const MEMO_MS = 60 * 1000;

export async function getMarkets() {
  if (memo.data && Date.now() - memo.at < MEMO_MS) return memo.data;
  const all = [...INDEXES, ...WATCHLIST];
  let quotes = null;
  let provider = null;
  const errors = [];

  for (const [name, fn] of [
    ['yahoo-spark', yahooSpark],
    ['yahoo-chart', yahooChart],
    ['finnhub', finnhub],
  ]) {
    try {
      quotes = await fn(all);
      if (quotes && Object.keys(quotes).length >= Math.ceil(all.length / 2)) {
        provider = name;
        break;
      }
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }

  const rows = (list) =>
    list.map((q) => ({ ...q, ...(quotes?.[q.symbol] || { price: null, change: null, changePct: null, spark: [] }) }));
  const stocks = rows(WATCHLIST);
  const withPct = stocks.filter((s) => Number.isFinite(s.changePct));
  const aiIndex = withPct.length
    ? { name: 'TS AI Index', changePct: round(withPct.reduce((a, s) => a + s.changePct, 0) / withPct.length, 2), members: withPct.length }
    : null;

  const data = {
    generatedAt: new Date().toISOString(),
    provider,
    ok: !!provider,
    errors: provider ? undefined : errors,
    indexes: rows(INDEXES),
    stocks,
    aiIndex,
  };
  if (provider) memo = { at: Date.now(), data };
  return data;
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function downsample(arr, n = 32) {
  const clean = arr.filter((v) => Number.isFinite(v));
  if (clean.length <= n) return clean.map((v) => round(v, 2));
  const out = [];
  for (let i = 0; i < n; i++) out.push(round(clean[Math.floor((i * (clean.length - 1)) / (n - 1))], 2));
  return out;
}

function quoteFrom(price, prev, spark) {
  if (!Number.isFinite(price)) return null;
  const change = Number.isFinite(prev) ? price - prev : null;
  return {
    price: round(price, 2),
    change: change == null ? null : round(change, 2),
    changePct: change == null || !prev ? null : round((change / prev) * 100, 2),
    spark: downsample(spark),
  };
}

const YH = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' };

async function yahooSpark(list) {
  const symbols = list.map((s) => s.symbol).join(',');
  const out = {};
  for (const host of ['query1', 'query2']) {
    const res = await fetchWithTimeout(
      `https://${host}.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols)}&range=1d&interval=15m`,
      { timeout: 6000, headers: YH },
    );
    if (!res.ok) continue;
    const j = await res.json();
    // Two response shapes exist in the wild: { spark: { result: [...] } } and { SYMBOL: {...} }
    const results = j?.spark?.result
      ? j.spark.result.map((r) => ({ symbol: r.symbol, ...(r.response?.[0] || {}) }))
      : Object.entries(j || {}).map(([symbol, v]) => ({ symbol, ...v }));
    for (const r of results) {
      const closes = r.indicators?.quote?.[0]?.close || r.close || [];
      const meta = r.meta || {};
      const price = meta.regularMarketPrice ?? [...closes].reverse().find(Number.isFinite);
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? r.chartPreviousClose ?? r.previousClose;
      const q = quoteFrom(price, prev, closes);
      if (q) out[r.symbol] = q;
    }
    if (Object.keys(out).length) return out;
  }
  throw new Error('no data');
}

async function yahooChart(list) {
  const out = {};
  await Promise.all(
    list.map(async ({ symbol }) => {
      try {
        const res = await fetchWithTimeout(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=15m`,
          { timeout: 6000, headers: YH },
        );
        if (!res.ok) return;
        const r = (await res.json())?.chart?.result?.[0];
        if (!r) return;
        const closes = r.indicators?.quote?.[0]?.close || [];
        const q = quoteFrom(r.meta?.regularMarketPrice, r.meta?.chartPreviousClose ?? r.meta?.previousClose, closes);
        if (q) out[symbol] = q;
      } catch {
        /* skip */
      }
    }),
  );
  if (!Object.keys(out).length) throw new Error('no data');
  return out;
}

// Optional: free Finnhub key (finnhub.io) as a backup source. Indexes aren't on the free plan.
async function finnhub(list) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error('FINNHUB_API_KEY not set');
  const out = {};
  await Promise.all(
    list
      .filter((s) => !s.symbol.startsWith('^'))
      .map(async ({ symbol }) => {
        try {
          const res = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${key}`, { timeout: 5000 });
          if (!res.ok) return;
          const j = await res.json();
          const q = quoteFrom(j.c, j.pc, [j.pc, j.o, j.l, j.h, j.c].filter(Boolean));
          if (q && j.c) out[symbol] = q;
        } catch {
          /* skip */
        }
      }),
  );
  if (!Object.keys(out).length) throw new Error('no data');
  return out;
}
