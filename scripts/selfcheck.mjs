// Self-check for the Launch Radar entry: re-implements the gate's seven
// checks against a built /output directory, plus the coverage and validation
// claims in the README. Run after main.ts:
//   node scripts/selfcheck.mjs out ../token-radar-01-kit/input/snapshot.json
// Exits 0 when every check passes, 1 otherwise, printing one line per check.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const outDir = process.argv[2] ?? 'out';
const snapshotFile = process.argv[3];
if (!snapshotFile) {
  process.stderr.write('usage: node scripts/selfcheck.mjs <out-dir> <snapshot.json>\n');
  process.exit(2);
}
const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
const board = JSON.parse(readFileSync(join(outDir, 'board.json'), 'utf8'));
const rows = board.rows;
const slugs = new Set(snapshot.protocols.map((p) => p.slug));

let failures = 0;
function check(name, ok, detail = '') {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failures++;
}

// dashboard_files: index.html + a .css + a .js, names plain, no network address.
const dashFiles = readdirSync(join(outDir, 'dashboard'));
const dashBytes = dashFiles.reduce((s, f) => s + statSync(join(outDir, 'dashboard', f)).size, 0);
check('dashboard_files', dashFiles.includes('index.html') && dashFiles.some((f) => f.endsWith('.css')) && dashFiles.some((f) => f.endsWith('.js')), `${dashFiles.length} files, ${dashBytes} bytes`);
const netAddr = dashFiles.some((f) => /https?:\/\//.test(readFileSync(join(outDir, 'dashboard', f), 'utf8')));
check('dashboard_no_network', !netAddr);
check('dashboard_under_64k', dashBytes <= 65_536, `${dashBytes} bytes`);

// board_file + sorted_by_value + coverage + farm_steps
check('board_rows', rows.length >= 100 && rows.length <= 4000, `${rows.length} rows`);
const ranksOk = rows.every((r, i) => r.rank === i + 1);
const monoOk = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd);
const slugsOk = rows.every((r) => slugs.has(r.slug)) && new Set(rows.map((r) => r.slug)).size === rows.length;
const valuesOk = rows.every((r) => Number.isInteger(r.implied_value_usd) && r.implied_value_usd > 0);
const distinctOk = new Set(rows.map((r) => r.implied_value_usd)).size > 1;
check('board_sorted', ranksOk && monoOk && slugsOk && valuesOk && distinctOk);
const covered = snapshot.watchlist.every((s) => rows.some((r) => r.slug === s));
check('coverage_watchlist', covered, `${snapshot.watchlist.length}/${snapshot.watchlist.length}`);
check('coverage_all', rows.length === snapshot.protocols.length, `${rows.length}/${snapshot.protocols.length}`);
const stepsOk = rows.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600));
check('farm_steps', stepsOk);
const pre = rows.filter((r) => r.status === 'pre-token').length;
const live = rows.filter((r) => r.status === 'live').length;
const excl = rows.filter((r) => r.status === 'excluded').length;
check('status_split', pre + live + excl === rows.length, `${pre} pre-token + ${excl} excluded + ${live} live`);

// screenshots: 3 PNG/JPEG, each <= 512 KiB, long side <= 1440, short side >= 800.
const shots = readdirSync(join(outDir, 'screenshots')).filter((f) => !f.startsWith('.'));
let shotsOk = shots.length >= 3 && shots.length <= 4;
let shotDetail = '';
for (const f of shots) {
  const buf = readFileSync(join(outDir, 'screenshots', f));
  const isPng = buf.subarray(1, 4).toString() === 'PNG';
  const w = isPng ? buf.readUInt32BE(16) : 0;
  const h = isPng ? buf.readUInt32BE(20) : 0;
  const dimsOk = isPng && Math.max(w, h) <= 1440 && Math.min(w, h) >= 800;
  if (buf.length > 524_288 || !dimsOk) shotsOk = false;
  shotDetail += `${f} ${buf.length}B ${w}x${h}; `;
}
check('screenshots', shotsOk, shotDetail.trim());

// dossier_matches: byte-for-byte what buildDossier writes.
const rebuilt = buildDossier(outDir, {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
const written = readFileSync(join(outDir, 'dossier.json'));
check('dossier_matches', Buffer.compare(Buffer.from(rebuilt), written) === 0, `${written.length} bytes`);
check('dossier_under_cap', written.length <= 1_572_864, `${written.length} bytes`);

// Validation numbers in data.js are the model's own, recomputed by main.ts.
const dataJs = readFileSync(join(outDir, 'data.js'), 'utf8');
const data = JSON.parse(dataJs.match(/window\.RADAR = (.*);/s)[1]);
const val = data.validation;
check(
  'validation_present',
  val.trainN === 128 && val.heldOutMedianX > 1 && val.tenFoldMedianX > 1 && val.looMedianX > 1 && val.walkForwardMedianX > 1,
  `held-out ${val.heldOutMedianX.toFixed(2)}x, 10-fold ${val.tenFoldMedianX.toFixed(2)}x, LOO ${val.looMedianX.toFixed(2)}x, walk-forward ${val.walkForwardMedianX.toFixed(2)}x`,
);

process.stdout.write(failures === 0 ? 'selfcheck: all checks passed\n' : `selfcheck: ${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
