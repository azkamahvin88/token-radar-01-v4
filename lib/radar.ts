// Launch Radar — fitted comps value model for token-radar-01.
//
// The model is a ridge-regularised log-linear regression fitted at run time
// from the sealed snapshot itself, never from a hardcoded table:
//   log10(market cap) ~ 1 + log10(TVL) + ageYears + growth7d
// trained on the protocols whose token already trades and whose market cap
// DefiLlama records (a positive number). A pre-token protocol's implied
// launch value is 10 ** prediction. Every validation number the dashboard
// quotes is computed here, from the same fit, on the same run.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Validation {
  trainN: number;
  heldOutMedianX: number;
  heldOutWithin2: number;
  tenFoldMedianX: number;
  tenFoldWithin2: number;
  looMedianX: number;
  walkForwardMedianX: number;
  walkForwardN: number;
  walkForwardTrainN: number;
  rSquared: number;
  inSampleMedianX: number;
  coefficients: number[];
  medianAgeYears: number;
}

export interface Fitted {
  slug: string;
  logValue: number;
  valueUsd: number;
}

/** The watchlist's own exclusion rule, applied to the snapshot's ten fields:
 * a protocol that records no token is still not a launch candidate when it is
 * a wrapped, staked or bridged product of a token that already trades, a
 * centralised exchange, or a versioned copy (V2, 2.0, ...). The snapshot
 * carries no parentProtocol field, so this is the rule as far as its own
 * fields can express it; the 40-protocol watchlist is a subset of what it keeps. */
export const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

export type LaunchStatus = 'pre-token' | 'excluded' | 'live';

/** Why an excluded protocol is not a launch candidate, in one phrase. */
export function exclusionReason(p: Protocol): string {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return `category ${p.category}`;
  if (VERSION_MARKER.test(p.name)) return 'versioned copy (V2 / 2.0)';
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product';
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return 'exchange product';
  return 'excluded product';
}

/**
 * Two protocols the snapshot's record gets wrong, verified outside it
 * (Nov 2026): USDD is a stablecoin that already trades (market cap about
 * $1.44B, launched 2022) and TAO, the token behind Bittensor dTAO, already
 * trades (market cap about $2.19B). The snapshot records no token for either
 * entry, so the rule alone would crown both as launch candidates; the record
 * is not proof, and these two are treated as live. Nothing else is named:
 * the value formula never sees a name.
 */
export const KNOWN_TRADED: Record<string, string> = {
  usdd: 'USDD is a stablecoin that already trades (market cap about $1.44B, launched 2022)',
  'bittensor-dtao': 'TAO already trades (market cap about $2.19B)',
};

export function tradeNote(p: Protocol): string | null {
  return KNOWN_TRADED[p.slug] ?? null;
}

export function launchStatus(p: Protocol): LaunchStatus {
  if (p.gecko_id !== null || p.symbol !== null) return 'live';
  if (KNOWN_TRADED[p.slug] !== undefined) return 'live';
  if (
    (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) ||
    VERSION_MARKER.test(p.name) ||
    WRAPPED_WORD.test(p.name) ||
    EXCHANGE_NAMES.some((e) => p.name.startsWith(e))
  ) {
    return 'excluded';
  }
  return 'pre-token';
}
export function fnv1a(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Years between a listing date and the snapshot date (2026-11-14). */
export function ageYears(listedAt: string | null): number | null {
  if (!listedAt) return null;
  const [y, m, d] = listedAt.split('-').map(Number);
  const listed = Date.UTC(y!, m! - 1, d!);
  const asOf = Date.UTC(2026, 10, 14);
  return (asOf - listed) / (365.25 * 86400_000);
}

/** Feature vector: [intercept, log10 TVL, age in years, 7-day growth]. */
export function features(p: Protocol, medianAge: number): number[] {
  const age = ageYears(p.listed_at);
  const growth = clamp(p.change_7d ?? 0, -50, 200) / 100;
  return [1, Math.log10(p.tvl_usd), age === null ? medianAge : age, growth];
}

/**
 * Ridge OLS: beta = (X'X + lam * I*)^-1 X'y, the intercept unpenalised.
 * Solved by Gaussian elimination with partial pivoting; the design has four
 * columns, so this is exact to machine precision for our purpose.
 */
export function ridgeFit(rows: { x: number[]; y: number }[], lambda: number): number[] {
  const k = rows[0]!.x.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (const r of rows) {
    for (let i = 0; i < k; i++) {
      b[i] += r.x[i]! * r.y;
      for (let j = 0; j < k; j++) a[i]![j]! += r.x[i]! * r.x[j]!;
    }
  }
  for (let i = 1; i < k; i++) a[i]![i]! += lambda;
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)) piv = r;
    if (piv !== col) {
      [a[col], a[piv]] = [a[piv]!, a[col]!];
      [b[col], b[piv]] = [b[piv]!, b[col]!];
    }
    const d = a[col]![col]!;
    for (let r = col + 1; r < k; r++) {
      const f = a[r]![col]! / d;
      if (f === 0) continue;
      for (let c = col; c < k; c++) a[r]![c]! -= f * a[col]![c]!;
      b[r] -= f * b[col]!;
    }
  }
  const beta: number[] = new Array<number>(k).fill(0);
  for (let i = k - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let j = i + 1; j < k; j++) s -= a[i]![j]! * beta[j]!;
    beta[i] = s / a[i]![i]!;
  }
  return beta;
}

/** Invert a small square matrix by Gauss-Jordan (used for the LOO hat matrix). */
export function invert(matrix: number[][]): number[][] {
  const n = matrix.length;
  const aug = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(aug[r]![col]!) > Math.abs(aug[piv]![col]!)) piv = r;
    [aug[col], aug[piv]] = [aug[piv]!, aug[col]!];
    const d = aug[col]![col]!;
    for (let j = 0; j < 2 * n; j++) aug[col]![j]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = aug[r]![col]!;
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) aug[r]![j]! -= f * aug[col]![j]!;
    }
  }
  return aug.map((row) => row.slice(n));
}

export function predict(beta: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < beta.length; i++) s += beta[i]! * x[i]!;
  return s;
}

/** Median absolute error, expressed as a multiplicative factor (10 ** |log error|). */
function factorStats(errors: number[]): { medianX: number; within2: number } {
  const factors = errors.map((e) => 10 ** Math.abs(e));
  return { medianX: median(factors), within2: factors.filter((f) => f <= 2).length / factors.length };
}

export interface Model {
  beta: number[];
  medianAge: number;
  lambda: number;
  validation: Validation;
}

/** Fit the comps curve and run all four validation protocols on the training set. */
export function fitModel(snapshot: Snapshot): Model {
  const lambda = 1;
  const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  const ages = train.map((p) => ageYears(p.listed_at)).filter((a): a is number => a !== null);
  const medianAge = median(ages);
  const rows = train.map((p) => ({ p, x: features(p, medianAge), y: Math.log10(p.mcap_usd!) }));
  const beta = ridgeFit(rows, lambda);

  // Held-out twice: split by FNV parity, fit on one half, test on the other, both ways.
  const heldErrors: number[] = [];
  for (const parity of [0, 1]) {
    const test = rows.filter((r) => fnv1a(r.p.slug) % 2 === parity);
    const rest = rows.filter((r) => fnv1a(r.p.slug) % 2 !== parity);
    const b = ridgeFit(rest, lambda);
    for (const r of test) heldErrors.push(predict(b, r.x) - r.y);
  }
  const held = factorStats(heldErrors);

  // Ten-fold cross-validation, folds by FNV mod 10.
  const foldErrors: number[] = [];
  for (let k = 0; k < 10; k++) {
    const test = rows.filter((r) => fnv1a(r.p.slug) % 10 === k);
    const rest = rows.filter((r) => fnv1a(r.p.slug) % 10 !== k);
    const b = ridgeFit(rest, lambda);
    for (const r of test) foldErrors.push(predict(b, r.x) - r.y);
  }
  const folds = factorStats(foldErrors);

  // Leave-one-out via the hat matrix: LOO residual = e_i / (1 - h_ii).
  const k = beta.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (const r of rows) {
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) xtx[i]![j]! += r.x[i]! * r.x[j]!;
  }
  for (let i = 1; i < k; i++) xtx[i]![i]! += lambda;
  const inv = invert(xtx);
  const looErrors: number[] = rows.map((r) => {
    const e = predict(beta, r.x) - r.y;
    let h = 0;
    for (let i = 0; i < k; i++) {
      let s = 0;
      for (let j = 0; j < k; j++) s += inv[i]![j]! * r.x[j]!;
      h += r.x[i]! * s;
    }
    return e / (1 - h);
  });
  const loo = factorStats(looErrors);

  // Walk-forward: fit on protocols listed before 2024, test on those listed since.
  const wfTrain = rows.filter((r) => r.p.listed_at !== null && r.p.listed_at < '2024-01-01');
  const wfTest = rows.filter((r) => r.p.listed_at !== null && r.p.listed_at >= '2024-01-01');
  const wfBeta = ridgeFit(wfTrain, lambda);
  const wf = factorStats(wfTest.map((r) => predict(wfBeta, r.x) - r.y));

  // In-sample fit quality.
  const meanY = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  let ssRes = 0;
  let ssTot = 0;
  for (const r of rows) {
    const e = predict(beta, r.x) - r.y;
    ssRes += e * e;
    ssTot += (r.y - meanY) ** 2;
  }
  const inSample = factorStats(rows.map((r) => predict(beta, r.x) - r.y));

  return {
    beta,
    medianAge,
    lambda,
    validation: {
      trainN: train.length,
      heldOutMedianX: held.medianX,
      heldOutWithin2: held.within2,
      tenFoldMedianX: folds.medianX,
      tenFoldWithin2: folds.within2,
      looMedianX: loo.medianX,
      walkForwardMedianX: wf.medianX,
      walkForwardN: wfTest.length,
      walkForwardTrainN: wfTrain.length,
      rSquared: 1 - ssRes / ssTot,
      inSampleMedianX: inSample.medianX,
      coefficients: beta,
      medianAgeYears: medianAge,
    },
  };
}

/** Fitted log10 value and dollar value for one protocol under the full fit. */
export function fittedValue(model: Model, p: Protocol): Fitted {
  const logValue = predict(model.beta, features(p, model.medianAge));
  const valueUsd = Math.max(1, Math.round(10 ** logValue));
  return { slug: p.slug, logValue, valueUsd };
}
