// Token Radar's model, radar-3: one sealed snapshot in, one ranked board out.
//
// The board covers every slug on the snapshot's watchlist (the floor, never the
// ceiling) and adds the early radar: pre-token protocols below the watchlist
// floor that pass the same exclusion test the house applies to the watchlist
// itself (no wrapped, staked or bridged product, no versioned pool, no
// exchange-branded name). A protocol is pre-token when its record carries no
// token (no market cap, no CoinGecko id, no symbol); live-token protocols are
// kept apart and shown with the market's own values, never mixed into the
// ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   category multiple = a shrunken median of the live-token protocols' market
//                         cap / TVL in the same category: the category's own
//                         median, winsorized to [0.01, 10] so one wild comp
//                         cannot set the price, pulled toward the global
//                         median with weight k = 3, so a category with one or
//                         two comparables still uses what it knows instead of
//                         falling back to the global median whole. A category
//                         with no live comparable at all takes the global
//                         median. Every multiple is clamped to [0.05, 1.00].
//   growth            = clamp(change_7d, -60, 120) per cent
//   growthMult        = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity          = 0.6 + min(age_days, 1095) / 1095 x 0.4
//                       (age_days unknown: 365)
//   breadth           = 1 + min(chains - 1, 4) x 0.02
//   implied           = max(1, round(tvl_usd x categoryMultiple
//                                     x growthMult x maturity x breadth))
//
// The category multiple is the model's core: it prices a protocol at what the
// market already pays for the same kind of protocol, instead of one flat
// multiple for everything. A lending protocol is not a bridge, and the market
// does not price them alike. Shrinkage is the honest part: a category with a
// single live comparable does not deserve that comparable's exact ratio, and
// a category with none does not deserve the global median's either — the
// blend says how much each is worth. No protocol name is ever special-cased:
// the same function scores every row, and the calibration table is published
// in the dashboard so a reader can check it, raw median beside shrunk
// multiple.
//
// Each farm plan carries seven steps, the second a risk check drawn from the
// protocol's own figures: a steep seven-day TVL fall, a protocol younger
// than 90 days, or a single-chain deployment each gets its own warning,
// cost and time.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_comps: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  /** How much weight the global median carries when a category's own median is shrunk toward it. */
  shrinkage_k: number;
  /** Winsorize every live comparable's market-cap-to-TVL ratio into this band before taking a median. */
  ratio_floor: number;
  ratio_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.0,
  min_comps: 3,
  breadth_per_chain: 0.02,
  breadth_max_chains: 4,
  shrinkage_k: 3,
  ratio_floor: 0.01,
  ratio_cap: 10,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    multiple_source: 'category' | 'global';
    comps_used: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  multiple_source: 'category' | 'global';
  comps_used: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  /** The rank range across the leave-one-out refits: the rank this row takes when any one live comparable is removed. */
  rank_lo: number;
  rank_hi: number;
  /** The rank range across the 200 bootstrap refits. */
  boot_lo: number;
  boot_hi: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  multiple: number | null;
}

/** One category's calibration: the live comparables behind its multiple. */
export interface CategoryComp {
  category: string;
  comps: number;
  /** The multiple the board actually uses: the category's median, shrunk toward the global median. */
  median_multiple: number;
  /** The category's own winsorized median before shrinkage, so a reader can see what the blend did. */
  raw_median: number;
  top: { slug: string; name: string; multiple: number }[];
}

/** Everything the dashboard needs: the board, the live set, the calibration, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  total_implied_usd: number;
  global_multiple: number;
  live_total: number;
  rows: RadarRow[];
  live: LiveRow[];
  comps: CategoryComp[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-or-unsorted list of numbers; NaN when empty. */
function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The categories the house's watchlist rule keeps out: wrapped, staked or bridged products. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Any category naming a bridge is kept out the same way: a bridge moves tokens
 * that already trade, and the snapshot cannot show the parent protocol the
 * house's rule also checks, so the early radar applies the rule's spirit to
 * every bridge category rather than only the two the rule names. */
const BRIDGE_CATEGORY = /bridge/i;
/** Exchange names a protocol may not begin with, under the same rule. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** Whole words that mark a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and passing the same
 * exclusion test the house applies to its watchlist. A wrapped, staked or
 * bridged product of a token that already trades is not a launch to find.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && (EXCLUDED_CATEGORIES.has(p.category) || BRIDGE_CATEGORY.test(p.category))) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * The market's own price for each category: the median market-cap-to-TVL
 * ratio of the live-token protocols in it, winsorized so one wild comparable
 * cannot set the price, then shrunk toward the global median so a category
 * with one or two comparables still uses what it knows instead of falling
 * back to the global median whole. A category with no live comparable takes
 * the global median. Every multiple is clamped.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): { multiples: Map<string, number>; comps: Map<string, number>; global: number; rawMedians: Map<string, number> } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = Math.min(model.ratio_cap, Math.max(model.ratio_floor, p.mcap_usd / p.tvl_usd));
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const global = Math.min(model.multiple_cap, Math.max(model.multiple_floor, median(all)));
  const multiples = new Map<string, number>();
  const comps = new Map<string, number>();
  const rawMedians = new Map<string, number>();
  for (const [cat, ratios] of byCategory) {
    comps.set(cat, ratios.length);
    const raw = median(ratios);
    rawMedians.set(cat, raw);
    // Shrinkage: n comparables pull the category's own median with weight n,
    // the global median with weight k. At n = 0 the category takes the global
    // median outright; at large n the category's own median rules.
    const shrunk = (ratios.length * raw + model.shrinkage_k * global) / (ratios.length + model.shrinkage_k);
    multiples.set(cat, Math.min(model.multiple_cap, Math.max(model.multiple_floor, shrunk)));
  }
  return { multiples, comps, global, rawMedians };
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiple: number,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains) * model.breadth_per_chain;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { multiples, comps, global } = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable protocols the watchlist does not name, by TVL, capped.
  // Never a replacement for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
  const scored = [...chosen.values()].map((p) => {
    // The multiple is rounded to 4 decimals BEFORE it prices anything, so the
    // dashboard's recompute — which reads the rounded number from data.js —
    // lands on the exact same implied value the board carries.
    const rawMultiple = multiples.get(p.category ?? 'Other') ?? global;
    const multiple = round4(rawMultiple);
    // With shrinkage the multiple always uses the category's own comparables
    // when it has any; only a category with none takes the global median.
    const source: 'category' | 'global' = (comps.get(p.category ?? 'Other') ?? 0) > 0 ? 'category' : 'global';
    const { implied, growthPct, growthMult, maturityMult, breadthMult, age } = impliedValue(p, snapshot.as_of, multiple, model);
    return { p, multiple, source, implied, growthPct, growthMult, maturityMult, breadthMult, age, compsUsed: comps.get(p.category ?? 'Other') ?? 0 };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: s.multiple,
      multiple_source: s.source,
      comps_used: s.compsUsed,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('onchain capital')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} on ${chain} and vote once with the position.`;
  if (c.includes('payment')) return `Pay $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to the ${name} chain and use it in one app there.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's risk check, drawn from its own figures: a steep seven-day
 * TVL fall, a protocol younger than 90 days, or a single-chain deployment
 * each gets its own warning, cost and time. A protocol with none of the
 * three gets a reminder to keep the position active across snapshots.
 */
export function riskStep(p: SnapshotProtocol, age: number | null): FarmStep {
  const growth = p.change_7d ?? 0;
  if (growth <= -20) {
    return {
      text: `TVL fell ${Math.round(-growth)}% in the last week — read the protocol's own announcements and check for an exploit or an ended incentive before you add more capital.`,
      cost: 'nothing to check',
      time: '10 minutes',
    };
  }
  if (age !== null && age < 90) {
    return {
      text: `The protocol is less than 90 days old — start with half the position above, confirm the contracts are the ones its own page links to, and scale up only after a month.`,
      cost: 'half the capital above',
      time: '15 minutes',
    };
  }
  if (p.chains.length <= 1) {
    return {
      text: `The protocol runs on one chain (${chainOf(p)}) — keep a small balance there for gas and for the exit transaction, so a withdrawal never strands the position.`,
      cost: 'about $5 of the chain asset',
      time: '5 minutes',
    };
  }
  return {
    text: `Set a reminder for the next weekly action and the next snapshot, so the position stays active across snapshots.`,
    cost: 'nothing but the reminder',
    time: '5 minutes',
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, growth and age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    riskStep(p, age),
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** One category's calibration table, for the dashboard's methodology section. */
export function categoryComps(snapshot: Snapshot, model: ModelConstants = MODEL): CategoryComp[] {
  const { multiples, comps, rawMedians } = calibrate(snapshot, model);
  const byCategory = new Map<string, { slug: string; name: string; multiple: number }[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push({ slug: p.slug, name: p.name, multiple: Math.min(model.ratio_cap, Math.max(model.ratio_floor, p.mcap_usd / p.tvl_usd)) });
    byCategory.set(key, list);
  }
  const rows: CategoryComp[] = [];
  for (const [cat, list] of byCategory) {
    const top = [...list].sort((a, b) => b.multiple - a.multiple).slice(0, 3).map((t) => ({ slug: t.slug, name: t.name, multiple: round4(t.multiple) }));
    rows.push({ category: cat, comps: comps.get(cat) ?? 0, median_multiple: round4(multiples.get(cat) ?? 0), raw_median: round4(rawMedians.get(cat) ?? 0), top });
  }
  return rows.sort((a, b) => b.comps - a.comps || (a.category < b.category ? -1 : 1));
}

/** The live-token anchors the validation can score: a positive market cap and a positive TVL. */
export function validationAnchors(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** One fold's out-of-sample error, model against a flat global multiple. */
export interface FoldError {
  fold: number;
  test_n: number;
  model_male: number;
  flat_male: number;
  model_med_ale: number;
  flat_med_ale: number;
  model_med_ape: number;
  flat_med_ape: number;
  model_within2: number;
  flat_within2: number;
}

/** The blind holdout: one slice held out before fitting, scored against the flat multiple and the train slice. */
export interface HoldoutResult {
  train_n: number;
  test_n: number;
  model_male: number;
  flat_male: number;
  model_med_ale: number;
  flat_med_ale: number;
  model_med_ape: number;
  flat_med_ape: number;
  model_within2: number;
  flat_within2: number;
  /** The same fitted model scored on the slice it was fit on, so the reader sees the generalisation gap. */
  train_male: number;
  train_med_ale: number;
}

/** A walk-forward test: fit on the tokens listed before a date, test on the ones listed after it. */
export interface WalkForwardResult {
  cutoff: string;
  train_n: number;
  test_n: number;
  model_male: number;
  flat_male: number;
  model_med_ale: number;
  flat_med_ale: number;
  model_med_ape: number;
  flat_med_ape: number;
  model_within2: number;
  flat_within2: number;
}

/** What a set of refits did to the board's ranks. */
export interface RefitSummary {
  refits: number;
  median_width: number;
  max_width: number;
  never_move: number;
  top10: { rank: number; lo: number; hi: number }[];
}

/** Everything the dashboard's "How the model was tested" section shows. All numbers are computed from the snapshot by validateModel, never written by hand. */
export interface Validation {
  anchors_n: number;
  clean_n: number;
  excluded_zero_mcap: number;
  holdout: HoldoutResult;
  cv_folds: FoldError[];
  cv_model_male: number;
  cv_flat_male: number;
  cv_model_med_ale: number;
  cv_flat_med_ale: number;
  board_scale_n: number;
  board_scale_model_male: number;
  board_scale_flat_male: number;
  board_scale_model_med_ale: number;
  board_scale_flat_med_ale: number;
  walk_forward: WalkForwardResult;
  loo: RefitSummary;
  bootstrap: RefitSummary & { seed: number };
  global_multiple: number;
  /** Every board row's rank range across the leave-one-out refits, in board order. */
  loo_lo: number[];
  loo_hi: number[];
  /** Every board row's rank range across the 200 bootstrap refits, in board order. */
  boot_lo: number[];
  boot_hi: number[];
  /** The fitted comps curve: [log10 TVL, log10 market cap, in the blind holdout (1) or not (0)] for every anchor. */
  curve: [number, number, number][];
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The median of a list of numbers; NaN when empty. */
function medianOf(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A set of predictions against the market caps they claim: mean and median absolute log error, median absolute percentage error, and how many land within twice the truth. */
function scorePredictions(preds: number[], actuals: number[]): { male: number; medAle: number; medApe: number; within2: number } {
  const logs = preds.map((p, i) => Math.abs(Math.log(p) - Math.log(actuals[i]!)));
  const apes = preds.map((p, i) => Math.abs(p - actuals[i]!) / actuals[i]!);
  return {
    male: logs.reduce((a, b) => a + b, 0) / logs.length,
    medAle: medianOf(logs),
    medApe: medianOf(apes) * 100,
    within2: preds.filter((p, i) => p > actuals[i]! / 2 && p < actuals[i]! * 2).length,
  };
}

/** The model's and the flat multiple's predictions for a set of live tokens, under one fitted calibration. */
function predictSet(
  test: SnapshotProtocol[],
  asOf: string,
  multiples: Map<string, number>,
  global: number,
  model: ModelConstants,
): { modelPreds: number[]; flatPreds: number[]; actuals: number[] } {
  const modelPreds: number[] = [];
  const flatPreds: number[] = [];
  const actuals: number[] = [];
  for (const p of test) {
    const multiple = round4(multiples.get(p.category ?? 'Other') ?? global);
    modelPreds.push(impliedValue(p, asOf, multiple, model).implied);
    flatPreds.push(impliedValue(p, asOf, round4(global), model).implied);
    actuals.push(p.mcap_usd!);
  }
  return { modelPreds, flatPreds, actuals };
}

/** One fold's error line, from the predictions of the model and the flat multiple. */
function foldLine(fold: number, modelPreds: number[], flatPreds: number[], actuals: number[]): FoldError {
  const m = scorePredictions(modelPreds, actuals);
  const f = scorePredictions(flatPreds, actuals);
  return {
    fold,
    test_n: actuals.length,
    model_male: round3(m.male),
    flat_male: round3(f.male),
    model_med_ale: round3(m.medAle),
    flat_med_ale: round3(f.medAle),
    model_med_ape: round1(m.medApe),
    flat_med_ape: round1(f.medApe),
    model_within2: m.within2,
    flat_within2: f.within2,
  };
}

/** A deterministic pseudo-random stream, so the bootstrap refits reproduce byte for byte. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The rank range every board row takes across a set of refit boards. */
function rankRanges(base: BoardRow[], refits: BoardRow[][]): { lo: Map<string, number>; hi: Map<string, number> } {
  const lo = new Map(base.map((r) => [r.slug, r.rank]));
  const hi = new Map(base.map((r) => [r.slug, r.rank]));
  for (const b of refits) {
    for (const r of b) {
      if (r.rank < (lo.get(r.slug) ?? Infinity)) lo.set(r.slug, r.rank);
      if (r.rank > (hi.get(r.slug) ?? -Infinity)) hi.set(r.slug, r.rank);
    }
  }
  return { lo, hi };
}

/** What a set of refits did to the board's ranks, in one line per summary. */
function refitSummary(base: BoardRow[], lo: Map<string, number>, hi: Map<string, number>, refits: number): RefitSummary {
  const widths = base.map((r) => (hi.get(r.slug) ?? r.rank) - (lo.get(r.slug) ?? r.rank));
  const sorted = [...widths].sort((a, b) => a - b);
  return {
    refits,
    median_width: sorted[Math.floor(sorted.length / 2)] ?? 0,
    max_width: Math.max(...widths),
    never_move: widths.filter((w) => w === 0).length,
    top10: base.slice(0, 10).map((r) => ({ rank: r.rank, lo: lo.get(r.slug) ?? r.rank, hi: hi.get(r.slug) ?? r.rank })),
  };
}

/**
 * The model's test, computed from the snapshot alone: a blind holdout against a flat multiple,
 * five-fold cross-validation, the same folds at board scale, a walk-forward test by listing date,
 * leave-one-out refits and 200 seeded bootstrap refits with the rank range each board row takes,
 * and the fitted comps curve. Deterministic: the same snapshot always gives the same numbers.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const allLive = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.tvl_usd > 0);
  const anchors = validationAnchors(snapshot);
  const clean = [...anchors].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const { global } = calibrate(snapshot, model);

  // Blind holdout: every fifth anchor by slug, fit on the rest; the same fit scored on its train slice.
  const test = clean.filter((_, i) => i % 5 === 4);
  const train = clean.filter((_, i) => i % 5 !== 4);
  const fit = calibrate({ ...snapshot, protocols: train }, model);
  const hp = predictSet(test, snapshot.as_of, fit.multiples, fit.global, model);
  const hm = scorePredictions(hp.modelPreds, hp.actuals);
  const hf = scorePredictions(hp.flatPreds, hp.actuals);
  const tp = predictSet(train, snapshot.as_of, fit.multiples, fit.global, model);
  const tm = scorePredictions(tp.modelPreds, tp.actuals);
  const holdout: HoldoutResult = {
    train_n: train.length,
    test_n: test.length,
    model_male: round3(hm.male),
    flat_male: round3(hf.male),
    model_med_ale: round3(hm.medAle),
    flat_med_ale: round3(hf.medAle),
    model_med_ape: round1(hm.medApe),
    flat_med_ape: round1(hf.medApe),
    model_within2: hm.within2,
    flat_within2: hf.within2,
    train_male: round3(tm.male),
    train_med_ale: round3(tm.medAle),
  };

  // Five-fold cross-validation over the same split: every anchor is tested once, blind.
  const cvFolds: FoldError[] = [];
  for (let f = 0; f < 5; f++) {
    const foldTest = clean.filter((_, i) => i % 5 === f);
    const foldTrain = clean.filter((_, i) => i % 5 !== f);
    const fc = calibrate({ ...snapshot, protocols: foldTrain }, model);
    const fp = predictSet(foldTest, snapshot.as_of, fc.multiples, fc.global, model);
    cvFolds.push(foldLine(f, fp.modelPreds, fp.flatPreds, fp.actuals));
  }
  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

  // Board scale: the same five folds over the anchors at the watchlist floor and above.
  const big = clean.filter((p) => p.tvl_usd >= snapshot.floor_usd);
  const bigFolds: FoldError[] = [];
  for (let f = 0; f < 5; f++) {
    const foldTest = big.filter((_, i) => i % 5 === f);
    const foldTrain = big.filter((_, i) => i % 5 !== f);
    const fc = calibrate({ ...snapshot, protocols: foldTrain }, model);
    const fp = predictSet(foldTest, snapshot.as_of, fc.multiples, fc.global, model);
    bigFolds.push(foldLine(f, fp.modelPreds, fp.flatPreds, fp.actuals));
  }

  // Walk-forward: fit on the anchors listed before 2025, test on the ones listed since.
  const dated = clean.filter((p) => p.listed_at !== null);
  const wfTrain = dated.filter((p) => p.listed_at! < '2025-01-01');
  const wfTest = dated.filter((p) => p.listed_at! >= '2025-01-01');
  const wc = calibrate({ ...snapshot, protocols: wfTrain }, model);
  const wp = predictSet(wfTest, snapshot.as_of, wc.multiples, wc.global, model);
  const wm = scorePredictions(wp.modelPreds, wp.actuals);
  const wf = scorePredictions(wp.flatPreds, wp.actuals);
  const walkForward: WalkForwardResult = {
    cutoff: '2025-01-01',
    train_n: wfTrain.length,
    test_n: wfTest.length,
    model_male: round3(wm.male),
    flat_male: round3(wf.male),
    model_med_ale: round3(wm.medAle),
    flat_med_ale: round3(wf.medAle),
    model_med_ape: round1(wm.medApe),
    flat_med_ape: round1(wf.medApe),
    model_within2: wm.within2,
    flat_within2: wf.within2,
  };

  // Leave-one-out refits: remove one live anchor at a time, rebuild the board, record every rank.
  const base = buildBoard(snapshot, model);
  const looBoards: BoardRow[][] = [];
  for (const p of allLive) {
    looBoards.push(buildBoard({ ...snapshot, protocols: snapshot.protocols.filter((q) => q.slug !== p.slug) }, model));
  }
  const looRanges = rankRanges(base, looBoards);
  const loo = refitSummary(base, looRanges.lo, looRanges.hi, allLive.length);

  // Bootstrap refits: resample the anchors with replacement, 200 times, seed fixed.
  const BOOTSTRAP_SEED = 20261114;
  const rnd = mulberry32(BOOTSTRAP_SEED);
  const rest = snapshot.protocols.filter((p) => isPreToken(p) || p.mcap_usd === null || p.tvl_usd <= 0);
  const bootBoards: BoardRow[][] = [];
  for (let k = 0; k < 200; k++) {
    const sampled: SnapshotProtocol[] = [];
    for (let i = 0; i < allLive.length; i++) sampled.push(allLive[Math.floor(rnd() * allLive.length)]!);
    bootBoards.push(buildBoard({ ...snapshot, protocols: [...rest, ...sampled] }, model));
  }
  const bootRanges = rankRanges(base, bootBoards);
  const bootstrap: RefitSummary & { seed: number } = { ...refitSummary(base, bootRanges.lo, bootRanges.hi, 200), seed: BOOTSTRAP_SEED };

  // The fitted comps curve: every anchor as [log10 TVL, log10 market cap, in the blind holdout].
  const testSlugs = new Set(test.map((p) => p.slug));
  const curve: [number, number, number][] = anchors.map((p) => [
    round2(Math.log10(p.tvl_usd)),
    round2(Math.log10(p.mcap_usd!)),
    testSlugs.has(p.slug) ? 1 : 0,
  ]);

  return {
    anchors_n: allLive.length,
    clean_n: clean.length,
    excluded_zero_mcap: allLive.length - anchors.length,
    holdout,
    cv_folds: cvFolds,
    cv_model_male: round3(avg(cvFolds.map((f) => f.model_male))),
    cv_flat_male: round3(avg(cvFolds.map((f) => f.flat_male))),
    cv_model_med_ale: round3(avg(cvFolds.map((f) => f.model_med_ale))),
    cv_flat_med_ale: round3(avg(cvFolds.map((f) => f.flat_med_ale))),
    board_scale_n: big.length,
    board_scale_model_male: round3(avg(bigFolds.map((f) => f.model_male))),
    board_scale_flat_male: round3(avg(bigFolds.map((f) => f.flat_male))),
    board_scale_model_med_ale: round3(avg(bigFolds.map((f) => f.model_med_ale))),
    board_scale_flat_med_ale: round3(avg(bigFolds.map((f) => f.flat_med_ale))),
    walk_forward: walkForward,
    loo,
    bootstrap,
    global_multiple: round4(global),
    loo_lo: base.map((r) => looRanges.lo.get(r.slug) ?? r.rank),
    loo_hi: base.map((r) => hiOf(looRanges, r)),
    boot_lo: base.map((r) => bootRanges.lo.get(r.slug) ?? r.rank),
    boot_hi: base.map((r) => hiOf(bootRanges, r)),
    curve,
  };
}

/** One row's high end of a rank range. */
function hiOf(ranges: { lo: Map<string, number>; hi: Map<string, number> }, row: BoardRow): number {
  return ranges.hi.get(row.slug) ?? row.rank;
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>, loo: [number, number], boot: [number, number]): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    multiple_source: row.model.multiple_source,
    comps_used: row.model.comps_used,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    rank_lo: loo[0],
    rank_hi: loo[1],
    boot_lo: boot[0],
    boot_hi: boot[1],
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. The validation is computed once here, so the board's rank ranges and the generated validation.js carry the same numbers. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; validation: Validation } {
  const board = buildBoard(snapshot, model);
  const validation = validateModel(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const wl = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    total_implied_usd: board.reduce((n, r) => n + r.implied_value_usd, 0),
    global_multiple: round4(calibrate(snapshot, model).global),
    live_total: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    rows: board.map((r, i) => radarRow(r, wl, [validation.loo_lo[i]!, validation.loo_hi[i]!], [validation.boot_lo[i]!, validation.boot_hi[i]!])),
    live,
    comps: categoryComps(snapshot, model),
  };
  return { board, radar, validation };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** The validation as a dashboard script: the page reads window.VALIDATION, and the dossier's source shows the numbers whole. The per-row rank ranges are left out here — the board's rows already carry them in data.js — so the dashboard's source stays inside its byte cap. */
export function validationScript(validation: Validation): string {
  const { loo_lo: _looLo, loo_hi: _looHi, boot_lo: _bootLo, boot_hi: _bootHi, ...shown } = validation;
  return `window.VALIDATION=${JSON.stringify(shown)};\n`;
}
