# Launch Radar — how the radar prices a launch (METHOD.md)

## The question

Which pre-token protocol is worth farming next, and what do I do about it?
The board answers with a fitted value, four out-of-sample tests, and a farm
plan whose every step is priced — not with a TVL table.

## The model (all inputs from the sealed snapshot)

The comps are the snapshot's own traded protocols: `mcap_usd` a positive
number (n = 128). The fit is ridge regression (λ = 1, intercept unpenalised),
run at build time by `lib/radar.ts` — no coefficient is typed in:

    log10(mcap) = 3.06 + 0.52 · log10(TVL) − 0.03 · ageYears − 0.75 · growth7d

- `log10(TVL)` — the protocol's TVL in dollars. The fitted slope is 0.52:
  value grows sublinearly with size, so a $2.7B curator does not swallow the
  board whole.
- `ageYears` — years from `listed_at` to the snapshot date (2026-11-14),
  median-imputed (2.74 years) where DefiLlama records no date. The fitted
  weight is small and negative: the longer a protocol has run with no token,
  the lower the curve prices it.
- `growth7d` — `change_7d` clipped to [−50%, +200%], as a fraction. The fitted
  weight is negative (−0.75): fast TVL spikes revert, so the curve discounts
  them instead of crowning them.

Implied launch value for a pre-token protocol: `IV = 10^prediction`, rounded
to whole dollars. In-sample R² = 0.21 — the curve explains about a fifth of
the variance in traded market caps, and the board says so.

Why this shape and not a richer one: with 128 comps, extra features overfit.
Category dummies, chain counts, quadratic TVL and shrunk category medians
were all tried against the same four tests below; none beat the four-feature
ridge fit out of sample, so none shipped. The selection was by the tests, not
by taste.

## The four tests (median prediction error, in multiplicative factor)

Every number is computed by `main.ts` from the same fit, on every run, and
printed to stdout. Splits are deterministic (FNV-1a hash of the slug), so a
re-run reproduces them exactly.

- **Held-out, twice — 3.7×.** Split the 128 comps by hash parity, fit on one
  half, test on the other, both ways. 31% of predictions land within 2×.
- **10-fold cross-validation — 3.5×.** Folds by hash mod 10; each protocol is
  tested once, by a fit that never saw it. 30% within 2×.
- **Leave-one-out — 3.6×.** Every protocol held out once, computed exactly
  from the hat matrix: LOO residual = e_i / (1 − h_ii).
- **Walk-forward — 2.6×.** Fit on the 44 comps listed before 2024, tested on
  the 51 listed since. The only test that respects time; it is also the best,
  which is reassuring rather than suspicious — newer listings are the comps
  most like the launches the board ranks.

Token pricing from TVL alone is noisy — traded mcap/TVL ratios vary a
hundredfold — so the board shows the fitted value next to the TVL that
produced it and the tests that bound it, never a false-precision price.

## The board (758 rows)

Every protocol in the snapshot is on the board, in one ranking by implied
value: genuine pre-token protocols by fitted value, live ones by the market
cap their token already carries (fitted value where DefiLlama records none),
excluded products by fitted value as a comp. Ranks are exactly 1–758, values
never rise with rank.

Classification follows the snapshot's own fields, mirroring the house's
watchlist rule:

- **Pre-token (196):** records no token, and is not a wrapped, staked or
  bridged product, an exchange, or a versioned copy. The launch board.
- **Excluded (144):** records no token but matches the exclusion rule —
  category Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
  Restaked BTC or CEX; a versioned name (V2, 2.0); a wrapped/staked/staking
  word in the name; or an exchange's name. Kept on the board under "Not a
  launch" with the reason, so the radar says where there is nothing to farm.
  WBTC and Binance staked ETH sit here, as the competition text says they
  must.
- **Live (418):** records a token (`gecko_id` or `symbol` present), plus two
  verified corrections below.

### Verified corrections to the record

The snapshot records no token for two entries whose tokens demonstrably
trade; both are treated as live, with the note on the row:

- **USDD** — a stablecoin that already trades (market cap about $1.44B,
  launched 2022).
- **Bittensor dTAO** — TAO already trades (market cap about $2.19B).

These are the only two names in the code, and they change classification,
never value: the value formula never sees a name.

## Farm plans (costed, not slogans)

Each of the 196 genuine pre-token protocols gets a six-step plan built from
its own record:

- **Chains set the gas bill** — per-transaction costs per chain (Ethereum
  $18, Base/Optimism/Solana $1, others $1–$2), so a Base farm costs ~$39 all
  in and an Ethereum-heavy one ~$210.
- **Category sets the actions** — Dexs swap and LP, Lending supplies and
  borrows, Liquid Staking stakes and reuses the receipt token, Bridges bridge
  both ways, Risk Curators deposit into vaults, and so on; an unknown category
  falls back to a generic core-action plan.
- **TVL band sets the position size** — $500 at $1B+ TVL, $250 at $200M+,
  $150 at $50M+, $100 below; weekly repeats run 4–8 weeks by band.

Every step names a dollar cost and a time in its text; the plan total
(`farm_cost_usd`) and horizon (`farm_weeks`) are columns on the board. Live
protocols get a four-step positioning plan (buy/stake/monitor/exit); excluded
products get a four-step verdict (why there is no launch, what to buy instead,
when to re-check).

## The dashboard

A static page with no network: four tabs (Launch board · 196, All 758, Live
comps · 418, Not a launch · 144), sortable columns, category / chain / TVL /
search filters, and a detail view per protocol with its fitted value, the
model maths behind it, and its priced farm plan. Deep links:
`#detail:<slug>` opens a focused detail view, `#filtered:<category>` applies
a category filter. Dashboard source is 20 KB, so the dossier's text carries
every file whole.

## Determinism

Same snapshot in, same board out: the fit, the splits, the plans and the
dossier are all pure functions of the sealed bytes. `node main.ts` prints the
four validation numbers; `node scripts/selfcheck.mjs` re-checks the gate's
seven rules plus the coverage and validation claims against the built output.
