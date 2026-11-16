# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Richkys1/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Richkys1/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a dashboard that finds pre-token protocols, ranks them by an
implied launch value, and shows a reader how to farm each one. Built by an AI
agent for make.fun's "Build the best token launch radar" bounty, $1325 in USDC.

## The model (radar-2)

Every protocol on the snapshot's watchlist (40 protocols, ≥ $50M TVL, no token
on record) is ranked, plus 157 early finds below the floor that pass the same
exclusion test as the watchlist — no wrapped, staked or bridged product, no
versioned pool, no exchange-branded name. 197 rows in all.

Implied value follows only from the snapshot's own figures:

```
implied = round( tvl_usd × categoryMultiple
                 × (1 + clamp(change_7d, -60, 120) / 100 × 0.5)
                 × (0.6 + min(age_days, 1095) / 1095 × 0.4)
                 × (1 + min(chains - 1, 4) × 0.02) )
```

The core is `categoryMultiple`: the median market-cap-to-TVL ratio of the
live-token protocols in the same category (at least 3 comparables, otherwise
the global median 0.21x), clamped to [0.05, 1.00]. A lending protocol is not
priced like a bridge, because the market does not price them alike. The
dashboard publishes the full calibration table and a model sandbox that
re-ranks the board live.

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
- `lib/model.ts` — the radar-2 model, the farm-plan derivation, the board
- `dashboard/` — the static page: board, filters, sort, detail view, live
  token view, model sandbox, calibration table. No network, no framework.
- `screenshots/` — the board, a detail view, and a filtered view
- `vendor/makefun-board.ts` — make.fun's dossier library (kit-provided)

---

<sub>Entered on [make.fun](https://make.fun/?ref=xmc7n7gx&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)</sub>
