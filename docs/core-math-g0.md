# G0 core math and timestamp audit

## Provenance

The site name `core_math` resolves for this audit to the pure trade-history arithmetic in `assets/instrument-trades.mjs`. No standalone file called core_math was found in the inspected main, develop or candidate trees. The candidate tree is [Draft #93](https://github.com/ypftctnbrb-maker/CRYPTOSCOPE/pull/93) at `f5f6dba4130c87c1c30bab72719cc2fbb222e6f0`. The file was last changed at `60c1c93ecc9410d9d7f100fb53048916bdd7ef35` ([Draft #91](https://github.com/ypftctnbrb-maker/CRYPTOSCOPE/pull/91)). Its SHA-256 is `531d7b4ded7f3d4204a1249112ec46b7cb2eca845a29673e5780fd0c1436bc0b`.

```sh
git -C /path/to/CRYPTOSCOPE show f5f6dba4130c87c1c30bab72719cc2fbb222e6f0:assets/instrument-trades.mjs | sha256sum
```

The CVD routine consumes trade event times, signs and IDs. It sorts the supplied tape and resets across detected candle gaps. It assumes the caller has already restricted inputs to information available at the decision time. Event timestamps alone cannot prove the trade was known then. A candle's opening time also cannot stand in for finalization or publication time. An archival REST receipt proves when the research client retrieved the current snapshot. It leaves original publication time and later revisions unknown. OI and funding observations need separate availability clocks. An unavailable metric remains null.

## Executed validation

`node test/offline.test.mjs` runs a bounded offline walk-forward on synthetic fixtures only. The first closed publication freezes each outcome. The decision must precede the target bar's opening time. Missing slots are skipped. Training outcomes must have published before a one-bar embargo and closed before the signal bar. The historical training mean and zero-return baseline share the same market, target and observed return. The future mutation and delayed revision fixtures leave earlier outputs invariant. Timestamp and mixed-venue fixtures fail closed. CVD, OI and funding are null throughout this slice.

A single HTTPS GET to the official OKX `BTC-USDT` 5m history endpoint returned HTTP 200 and code 0, 12 rows, 11 marked closed. The 9-field schema contains opening time and confirm status. The original publication time, revision trail and point-in-time CVD, OI and funding were unavailable. **Real point-in-time evaluation is blocked.** The market values were excluded. Public API access alone also leaves reuse terms to be verified for a persistent evaluation corpus. This is coverage evidence for transport and schema only. [History candles API](https://www.okx.com/docs-v5/en/#order-book-trading-market-data-get-candlesticks-history) · [Historical downloads](https://www.okx.com/historical-data) · [Terms](https://www.okx.com/help/terms-of-service)

The earlier PR runner returned Bybit 403 on all four requests. Treat that venue as unavailable on that runner. Permitted alternatives include a separately authorized point-in-time capture from an approved venue and a licensed, timestamped dataset. A different venue starts a new paired cohort with its own matching outcomes. No geographic bypass or cross-venue substitution. [Runner logs](https://github.com/ypftctnbrb-maker/cryptoscope-eval/actions/runs/45910586062)

## Gates before accumulation

Freeze a canonical fixed-schema snapshot of venue, market, source IDs, event and receipt timestamps, closed status, data coverage, core hash, decision and outcome configuration. Hash before any prediction and store the immutable bytes and an independent timestamp receipt. Before push, verify repo, branch, allowlist, budget, pinned core SHA and digest, snapshot hash and external receipt, and reject plaintext keys. Acceptance tests change one byte, substitute the core SHA, remove or replay a receipt, inject an unauthorized path or branch, or omit a required timestamp. Each must fail before writing or pushing an evaluation record. A valid independently anchored fixture must pass. No actual anchor, push guard, model or accumulation was activated.

Use the paired loss differences for a HAC or moving-block bootstrap estimate of long-run variance, with the block length chosen from observed dependence and sensitivity tested. Prespecify error rate, power, minimum relevant effect and primary loss. Estimate elapsed duration from effective sample size and usable pair arrivals after missingness and embargo. Seven days covers G0 only. Synthetic pairs do not supply variance, power, or duration estimates for real markets. [v1.1 requirements](evaluation-v1.1.md)
