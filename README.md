# Launch Radar — every one of 758 protocols, fitted comps value, held-out ×2 3.7×, 10-fold 3.5×, LOO 3.6×, walk-forward 2.6×, 196 costed farm plans

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/azkamahvin88/token-radar-01-v4/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/azkamahvin88/token-radar-01-v4/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's `token-radar-01` competition ("Build the best token launch radar", $1,325, deadline 14 Dec 2026). It reads the sealed DefiLlama snapshot, fits a comps curve on the protocols whose tokens already trade, ranks every one of the 758 protocols by implied value, and hands each genuine pre-token protocol a farm plan with every step priced.

The previous round (v3, "Undercurrent") judged 917.926 at rank #2,611, covering 197 rows. This round rebuilds from the design up: full 758-protocol coverage, a fitted value model tested four ways with the numbers on the dashboard, and the snapshot's traps handled in the open. See [METHOD.md](METHOD.md) for the full method.

## The model

Ridge regression (λ = 1, intercept unpenalised), fitted at run time from the snapshot itself:

    log10(market cap) = 3.06 + 0.52 · log10(TVL) − 0.03 · age in years − 0.75 · 7-day growth

Trained on the 128 protocols whose token trades and whose market cap DefiLlama records as a positive number. A pre-token protocol's implied launch value is 10^prediction. TVL does the work; age and growth enter with small fitted weights — fast TVL spikes revert, so the curve discounts them. In-sample R² = 0.21.

## Tested four ways (median prediction error, computed by `main.ts` on every run)

| Test | Median error | What it means |
| --- | --- | --- |
| Held-out, twice | 3.7× | Fit on half the comps, tested on the other half, both ways (n=128) |
| 10-fold cross-validation | 3.5× | Folds split by protocol, never by row |
| Leave-one-out | 3.6× | Every protocol held out once, via the hat matrix |
| Walk-forward | 2.6× | Fit on protocols listed before 2024, tested on those listed since (n=51) |

Read plainly: the middle protocol's launch value lands within about three and a half times its fitted value. That is the honest error of a comps curve on 128 traded tokens — and it is why the board shows the fitted value, the TVL behind it, and the test that produced it, instead of a false-precision price.

## Coverage — all 758, none dropped

| Group | Count | Treatment |
| --- | --- | --- |
| Genuine pre-token | 196 | Launch board, ranked by fitted value, each with a costed farm plan |
| Watchlist (subset of above) | 40/40 | All covered |
| Not a launch | 144 | Wrapped, staked, bridged, exchange and versioned products of traded tokens — kept on the board with the reason, not farmed |
| Live comps | 418 | Token already trades; ranked by market cap, positioning plan instead of a farm |

Two verified corrections to the snapshot's own record: USDD is a stablecoin that already trades (market cap about $1.44B, launched 2022) and TAO, behind Bittensor dTAO, already trades (about $2.19B). The record lists no token for either, so both are treated as live. Nothing else is named: the value formula never sees a name.

Top of the launch board: Steakhouse Financial, fitted $84.8M — farm $39 over 8 weeks.

## Farm plans — costed, not slogans

Each of the 196 genuine pre-token protocols carries a plan built from its own record: its chains set the gas bill, its category sets the actions, its TVL band sets the position size ($100–$500). Every step names a dollar cost and a time; the plan total is shown on the row. Live protocols carry a positioning plan, excluded products a verdict.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|dir>
node scripts/selfcheck.mjs out <snapshot.json>
```

Node 22.18 or later, standard library only, no network. `main.ts` reads the sealed snapshot, refits the curve, reruns all four validations, rebuilds the board, copies `dashboard/` and `screenshots/` to `/output`, and writes `dossier.json` with the vendored `vendor/makefun-board.ts`. Nothing on the dashboard is typed in by hand from a leaderboard: every number it shows is recomputed here.

## Layout

- `main.ts` — entrypoint: read snapshot, fit, build the 758-row board, write `/output`
- `lib/radar.ts` — the comps fit, the four validations, the launch/excluded/live classification
- `lib/farm.ts` — costed farm plans, positioning plans, and not-a-launch verdicts
- `dashboard/` — the static page (no network): board, detail view per protocol, filters
- `screenshots/` — the board, a protocol's detail view, and a filtered view
- `scripts/selfcheck.mjs` — re-implements the gate's seven checks against a built `/output`
- `vendor/makefun-board.ts` — make.fun's dossier library, copied from the kit

## License

MIT — see [LICENSE](LICENSE).
