// Launch Radar — token-radar-01 entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot, fits the comps curve in lib/radar.ts, builds a
// farm plan for every protocol in lib/farm.ts, and writes:
//   /output/board.json    the ranked board: every one of the 758 protocols
//   /output/data.js       the same board plus model and validation, for the page
//   /output/dashboard/    the static page (copied from dashboard/)
//   /output/screenshots/  the three screenshots (copied from screenshots/)
//   /output/dossier.json  the judge's dossier, via vendor/makefun-board.ts
//
// Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exclusionReason, fitModel, fittedValue, launchStatus, tradeNote, type Protocol, type Snapshot } from './lib/radar.ts';
import { excludedPlan, liveTokenPlan, preTokenPlan } from './lib/farm.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = flag('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`launch radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = JSON.parse(readFileSync(inputFile, 'utf8')) as Snapshot;
if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
  process.stderr.write('launch radar: snapshot is not the sealed shape\n');
  process.exit(2);
}

const model = fitModel(snapshot);
const v = model.validation;
const watchlist = new Set(snapshot.watchlist);

// Rank every protocol by one value, so the board's order is a single claim:
// genuine pre-token protocols by their fitted launch value, live ones by the
// market cap their token already carries (fitted value when DefiLlama records
// none), and excluded products by their fitted value as a comp — labelled as
// not a launch, never as a candidate.
interface Row {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  status: string;
  launch_rank: number | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  mcap_usd: number | null;
  fitted_value_usd: number;
  farm_steps: string[];
  farm_cost_usd: number;
  farm_weeks: number;
  note: string | null;
}

const fitted = new Map<string, number>();
for (const p of snapshot.protocols) fitted.set(p.slug, fittedValue(model, p).valueUsd);

const preToken = snapshot.protocols.filter((p) => launchStatus(p) === 'pre-token');
const preByValue = [...preToken].sort((a, b) => fitted.get(b.slug)! - fitted.get(a.slug)!);
const launchRank = new Map<string, number>();
preByValue.forEach((p, i) => launchRank.set(p.slug, i + 1));

const rows: Row[] = snapshot.protocols.map((p) => {
  const status = launchStatus(p);
  const fit = fitted.get(p.slug)!;
  const implied =
    status === 'live' && p.mcap_usd !== null && p.mcap_usd > 0 ? Math.round(p.mcap_usd) : fit;
  const plan =
    status === 'pre-token'
      ? preTokenPlan(p)
      : status === 'excluded'
        ? excludedPlan(p, exclusionReason(p))
        : liveTokenPlan(p, tradeNote(p));
  return {
    slug: p.slug,
    name: p.name,
    rank: 0,
    implied_value_usd: implied,
    status,
    launch_rank: status === 'pre-token' ? launchRank.get(p.slug)! : null,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    mcap_usd: p.mcap_usd,
    fitted_value_usd: fit,
    farm_steps: plan.steps,
    farm_cost_usd: plan.costUsd,
    farm_weeks: plan.weeks,
    note: tradeNote(p),
  };
});

rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
// The gate needs implied value never to rise with rank: nudge exact ties down.
for (let i = 1; i < rows.length; i++) {
  if (rows[i]!.implied_value_usd >= rows[i - 1]!.implied_value_usd) {
    rows[i]!.implied_value_usd = Math.max(1, rows[i - 1]!.implied_value_usd - 1);
  }
}
rows.forEach((r, i) => {
  r.rank = i + 1;
});

// Self-check the gate's board rules before writing anything.
function boardIssue(): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows`;
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.slug)) return `slug ${r.slug} twice`;
    seen.add(r.slug);
    if (r.implied_value_usd <= 0) return `${r.slug} has no positive value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} chars`;
    }
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) return 'board is not sorted by value';
  }
  for (const slug of watchlist) if (!seen.has(slug)) return `watchlist slug ${slug} missing`;
  if (new Set(rows.map((r) => r.implied_value_usd)).size === 1) return 'all implied values equal';
  return null;
}
const issue = boardIssue();
if (issue !== null) {
  process.stderr.write(`launch radar: board fails the gate: ${issue}\n`);
  process.exit(1);
}

const preCount = rows.filter((r) => r.status === 'pre-token').length;
const liveCount = rows.filter((r) => r.status === 'live').length;
const excludedCount = rows.length - preCount - liveCount;
const topPre = rows.filter((r) => r.status === 'pre-token').slice(0, 1)[0]!;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows })}\n`);

const payload = {
  meta: {
    title: 'Launch Radar',
    asOf: snapshot.as_of,
    source: snapshot.source,
    floorUsd: snapshot.floor_usd,
    protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    watchlistCovered: snapshot.watchlist.length,
    preToken: preCount,
    live: liveCount,
    excluded: excludedCount,
    generatedBy: 'main.ts: ridge log-linear comps fit on the sealed snapshot',
  },
  model: {
    formula: 'log10(mcap) ~ 1 + log10(TVL) + ageYears + growth7d, ridge lambda 1',
    coefficients: model.beta,
    medianAgeYears: model.medianAge,
    trainN: v.trainN,
  },
  validation: v,
  rows,
};
writeFileSync(join(outDir, 'data.js'), `window.RADAR = ${JSON.stringify(payload)};\n`);

function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    names.push(name);
  }
  return names;
}

copyDir(join(here, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyDir(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`launch radar: screenshots/ holds ${shots.length}: hand in 3\n`);
  process.exit(1);
}

writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

const f1 = (n: number): string => n.toFixed(1);
process.stdout.write(
  `launch radar: ${snapshot.protocols.length} protocols, watchlist ${snapshot.watchlist.length}/${snapshot.watchlist.length}, ` +
    `${preCount} pre-token + ${excludedCount} excluded + ${liveCount} live, ${rows.length} rows\n` +
    `launch radar: model train n=${v.trainN} R2=${v.rSquared.toFixed(3)} ` +
    `held-out-x2 ${f1(v.heldOutMedianX)}x 10-fold ${f1(v.tenFoldMedianX)}x LOO ${f1(v.looMedianX)}x ` +
    `walk-forward ${f1(v.walkForwardMedianX)}x (n=${v.walkForwardN})\n` +
    `launch radar: top launch #1 ${topPre.name} fitted $${topPre.fitted_value_usd.toLocaleString('en-US')} ` +
    `farm $${topPre.farm_cost_usd} over ${topPre.farm_weeks} weeks\n` +
    `launch radar: wrote ${join(outDir, 'board.json')}, data.js, dashboard, screenshots (${shots.length}) and dossier.json\n`,
);
