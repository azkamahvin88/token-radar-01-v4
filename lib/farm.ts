// Costed farm plans for token-radar-01.
//
// Every pre-token protocol gets a plan built from its own record: its
// chains set the gas bill, its category sets the actions, its TVL band sets
// the position size. Every step names a cost in dollars and a time, so a
// reader can price the whole plan before starting. Live-token protocols get
// a "token already trades" plan instead: how to position, not how to farm a
// launch that already happened.

import type { Protocol } from './radar.ts';

export interface FarmStep {
  text: string;
  costUsd: number;
  minutes: number;
}

export interface FarmPlan {
  steps: string[];
  costUsd: number;
  weeks: number;
}

/** Typical gas + fee per transaction on a chain, in whole dollars. */
const CHAIN_TX_USD: Record<string, number> = {
  Ethereum: 18,
  Base: 1,
  Arbitrum: 2,
  Optimism: 1,
  Solana: 1,
  'BNB Chain': 1,
  Polygon: 1,
  Avalanche: 2,
  Sui: 1,
  Aptos: 1,
  Gnosis: 1,
  Fantom: 1,
  Linea: 1,
  zkSync: 1,
  Scroll: 1,
  Mantle: 1,
  Sei: 1,
  Berachain: 1,
};

function txCost(chain: string): number {
  return CHAIN_TX_USD[chain] ?? 2;
}

function usd(n: number): string {
  return `$${Math.round(n)}`;
}

/** Position size suggestion from the protocol's TVL band. */
function positionSize(tvl: number): number {
  if (tvl >= 1_000_000_000) return 500;
  if (tvl >= 200_000_000) return 250;
  if (tvl >= 50_000_000) return 150;
  return 100;
}

function fmtUsd(n: number): string {
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(n)}`;
}

const CATEGORY_ACTIONS: Record<string, { verb: string; detail: string; second: string }> = {
  Dexs: {
    verb: 'Swap',
    detail: 'swap between two liquid pairs so the trade counts as real volume',
    second: 'add liquidity to the highest-volume pool and hold the LP position',
  },
  Lending: {
    verb: 'Supply',
    detail: 'supply collateral and keep a health factor above 2 at all times',
    second: 'borrow a small amount against the supply to show both sides of the market',
  },
  'Liquid Staking': {
    verb: 'Stake',
    detail: 'stake and hold the liquid staking token rather than selling it on',
    second: 'use the staking token as collateral in a lending market on the same chain',
  },
  'Liquid Restaking': {
    verb: 'Restake',
    detail: 'restake the liquid staking token and keep the position through the epoch',
    second: 'deposit the restaked token into a partner vault that accepts it',
  },
  Bridge: {
    verb: 'Bridge',
    detail: 'bridge in both directions so the route records volume, not a one-way exit',
    second: 'bridge a second, different asset a week later to widen the footprint',
  },
  'Canonical Bridge': {
    verb: 'Bridge',
    detail: 'bridge in both directions so the route records volume, not a one-way exit',
    second: 'bridge a second, different asset a week later to widen the footprint',
  },
  'Cross Chain Bridge': {
    verb: 'Bridge',
    detail: 'bridge in both directions so the route records volume, not a one-way exit',
    second: 'bridge a second, different asset a week later to widen the footprint',
  },
  Yield: {
    verb: 'Deposit',
    detail: 'deposit into the flagship vault and let the yield compound untouched',
    second: 'rotate a share of the yield into a second vault on the same protocol',
  },
  RWA: {
    verb: 'Mint',
    detail: 'mint the tokenised asset and hold it to maturity of the current term',
    second: 'use the tokenised asset as collateral where the protocol allows it',
  },
  Derivatives: {
    verb: 'Trade',
    detail: 'open a small hedged position and close it after the funding cycle settles',
    second: 'provide liquidity to the perpetual market as a maker for one full week',
  },
  'Prediction Market': {
    verb: 'Trade',
    detail: 'take a position in a market resolving after the current snapshot window',
    second: 'add liquidity to the market book instead of only taking a side',
  },
  'Risk Curators': {
    verb: 'Deposit',
    detail: 'deposit into a curated vault and keep the allocation for a full epoch',
    second: 'move a share into a second curator vault to compare risk profiles',
  },
};

function actionFor(category: string | null): { verb: string; detail: string; second: string } {
  return CATEGORY_ACTIONS[category ?? ''] ?? {
    verb: 'Use',
    detail: 'run a real transaction through the protocol core function and keep the position open',
    second: 'repeat the core action on a second asset to show breadth, not a single trade',
  };
}

/** A costed farm plan for a protocol that records no token. */
export function preTokenPlan(p: Protocol): FarmPlan {
  const chain = p.chains[0] ?? 'Ethereum';
  const chain2 = p.chains.length > 1 ? p.chains[1]! : chain;
  const gas = txCost(chain);
  const gas2 = txCost(chain2);
  const size = positionSize(p.tvl_usd);
  const weeks = p.tvl_usd >= 1_000_000_000 ? 8 : p.tvl_usd >= 50_000_000 ? 6 : 4;
  const act = actionFor(p.category);
  const bridge = chain === chain2 ? gas : gas + 4;
  const cat = p.category ?? 'DeFi';

  const steps: FarmStep[] = [
    {
      text:
        `Bridge ${fmtUsd(size)} to ${chain} for ${p.name} (about ${usd(bridge)} in bridge fee and gas, 20 min). ` +
        `Use the chain's canonical bridge, not a third-party hop, so the arrival is clean and traceable.`,
      costUsd: bridge,
      minutes: 20,
    },
    {
      text:
        `${act.verb} ${fmtUsd(size)} on ${p.name} (${cat}) on ${chain}: ${act.detail} ` +
        `(about ${usd(gas)} gas, 15 min). Keep the receipt hash; a single transaction is the minimum footprint.`,
      costUsd: gas,
      minutes: 15,
    },
    {
      text:
        `On ${p.name}, ${act.second} with ${fmtUsd(Math.round(size / 2))} more ` +
        `(about ${usd(gas)} gas, 30 min). Two distinct actions beat ten repeats of one: snapshots score breadth.`,
      costUsd: gas,
      minutes: 30,
    },
    {
      text:
        `Repeat the core action once a week for ${weeks} weeks on ${chain} (about ${usd(gas)} gas per week, 15 min each). ` +
        `Steady weekly activity counts more than one burst, and it survives a snapshot taken on any date.`,
      costUsd: gas * (weeks - 1),
      minutes: 15 * (weeks - 1),
    },
    {
      text:
        `Use ${p.name} on ${chain2} too, if it is live there, with ${fmtUsd(Math.round(size / 2))} ` +
        `(about ${usd(gas2 + 2)} gas and fees, 30 min). A second chain doubles the surface a snapshot can see.`,
      costUsd: gas2 + 2,
      minutes: 30,
    },
    {
      text:
        `Hold everything until ${p.name} announces a token or a snapshot, then exit in one move: unwind the position and ` +
        `bridge back (about ${usd(gas + 4)} gas and fees, 30 min). Never pay to exit before an announcement exists.`,
      costUsd: gas + 4,
      minutes: 30,
    },
  ];
  return {
    steps: steps.map((s) => s.text),
    costUsd: steps.reduce((s, x) => s + x.costUsd, 0),
    weeks,
  };
}

/** A plan for a protocol that records no token but is not a launch: it names
 * the reason and says what to do instead, so the row is a verdict, not a farm. */
export function excludedPlan(p: Protocol, reason: string): FarmPlan {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = txCost(chain);
  const steps: FarmStep[] = [
    {
      text:
        `Do not farm ${p.name} for a launch: it records no token, but it is excluded as a ${reason} — ` +
        `a wrapped, staked, bridged or exchange product of a token that already trades, not a protocol still waiting on its own launch (0 cost, 10 min to verify).`,
      costUsd: 0,
      minutes: 10,
    },
    {
      text:
        `If you want exposure, buy the underlying token that already trades instead of chasing ${p.name} for points: ` +
        `check its market on ${chain} and size the position like any other trade, not like a farm (about ${usd(gas)} gas, 15 min).`,
      costUsd: gas,
      minutes: 15,
    },
    {
      text:
        `Skip ${p.name} in every airdrop list that names it: points here, if any exist, pay in the underlying token's economics, ` +
        `not in a new launch (0 cost, 5 min).`,
      costUsd: 0,
      minutes: 5,
    },
    {
      text:
        `Re-check once a quarter: if ${p.name} ever announces a token of its own, re-read this row then — ` +
        `until that announcement exists, the verdict stands (0 cost, 5 min).`,
      costUsd: 0,
      minutes: 5,
    },
  ];
  return { steps: steps.map((s) => s.text), costUsd: steps.reduce((s, x) => s + x.costUsd, 0), weeks: 0 };
}
export function liveTokenPlan(p: Protocol, note?: string | null): FarmPlan {
  const chain = p.chains[0] ?? 'Ethereum';
  const gas = txCost(chain);
  const sym = p.symbol ?? p.name;
  const size = positionSize(p.tvl_usd);
  const mcap = p.mcap_usd !== null && p.mcap_usd > 0 ? ` (market cap ${fmtUsd(p.mcap_usd)})` : '';
  const steps: FarmStep[] = [
    {
      text: note
        ? `${note} — so there is no launch left to farm on ${p.name}. The snapshot records no token for this entry, but the record is wrong: buy the token on an exchange if you want exposure, do not farm points for a launch (about ${usd(gas)} gas, 15 min).`
        : `${sym} already trades${mcap}, so there is no launch left to farm on ${p.name}. ` +
          `Treat it as a comp, not a target: buy only if the thesis, not the airdrop, justifies it (about ${usd(gas)} gas, 15 min).`,
      costUsd: gas,
      minutes: 15,
    },
    {
      text:
        `If you hold ${sym}, stake or supply ${fmtUsd(size)} through ${p.name} on ${chain} rather than leaving it idle ` +
        `(about ${usd(gas)} gas, 20 min). Yield on a live token is the only farm left here.`,
      costUsd: gas,
      minutes: 20,
    },
    {
      text:
        `Check ${p.name} once a month for a points season or a new market; a live protocol can still launch a second token ` +
        `or a rewards round (10 min, no cost). Do not chase every announcement.`,
      costUsd: 0,
      minutes: 10,
    },
    {
      text:
        `Cap the position at ${fmtUsd(size)} and set an exit: sell half if the token doubles from your entry, ` +
        `the rest if TVL falls 30% in a week (about ${usd(gas)} gas to exit, 15 min).`,
      costUsd: gas,
      minutes: 15,
    },
  ];
  return { steps: steps.map((s) => s.text), costUsd: steps.reduce((s, x) => s + x.costUsd, 0), weeks: 4 };
}
