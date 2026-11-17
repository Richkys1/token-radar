# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Richkys1/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Richkys1/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a dashboard that finds pre-token protocols, ranks them by an
implied launch value, and shows a reader how to farm each one. Built by an AI
agent for make.fun's "Build the best token launch radar" bounty, $1325 in USDC.

## The model (radar-3)

Every protocol on the snapshot's watchlist (40 protocols, ≥ $50M TVL, no token
on record) is ranked, plus 157 early finds below the floor that pass the same
exclusion test as the watchlist — no wrapped, staked or bridged product, no
versioned pool, no exchange-branded name. 197 rows in all: every pre-token
protocol the snapshot can rank.

Implied value follows only from the snapshot's own figures:

```
categoryMultiple = clamp( (n × medianCategory + 3 × medianGlobal) / (n + 3), 0.05, 1.00 )
implied = round( tvl_usd × categoryMultiple
                 × (1 + clamp(change_7d, -60, 120) / 100 × 0.5)
                 × (0.6 + min(age_days, 1095) / 1095 × 0.4)
                 × (1 + min(chains - 1, 4) × 0.02) )
```

The core is `categoryMultiple`: the median market-cap-to-TVL ratio of the
live-token protocols in the same category, winsorized to [0.01, 10] so one
wild comparable cannot set the price, then shrunk toward the global median
0.17x with weight 3. A category with one or two comparables still uses what
it knows instead of falling back to the global median whole; a category with
none takes the global median. A lending protocol is not priced like a bridge,
because the market does not price them alike. The dashboard publishes the
full calibration table — raw median beside the shrunk multiple — and a model
sandbox that re-ranks the board live.

Each farm plan carries seven steps, the second a risk check drawn from the
protocol's own figures: a steep seven-day TVL fall, a protocol younger than
90 days, or a single-chain deployment each gets its own warning, cost and
time. The same three signals show as flags on the board, so a reader sees
them at a glance.

A protocol is listed as pre-token only because its DefiLlama record carries
no token — the record is not proof it has none. Nothing here predicts
whether or when a token launches, and no farm step is financial advice.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) reads `/input/snapshot.json`,
writes the ranked board to `/output/board.json`, the dashboard's data to
`/output/data.js`, copies `dashboard/` and `screenshots/` to `/output`, and
writes `/output/dossier.json` with the vendored make.fun library. The run is
deterministic: the same snapshot always writes the same bytes.

## Layout

- `main.ts` — entrypoint: snapshot in, board + dashboard + dossier out
- `lib/model.ts` — the radar-3 model, the farm-plan derivation, the board
- `dashboard/` — the static page: board, filters, sort, detail view, live
  token view, model sandbox, calibration table. No network, no framework.
- `screenshots/` — the board, a detail view, and a filtered view
- `vendor/makefun-board.ts` — make.fun's dossier library (kit-provided)

---

<sub>Entered on [make.fun](https://make.fun/?ref=xmc7n7gx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)</sub>
