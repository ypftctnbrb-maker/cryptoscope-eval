# cryptoscope-eval
CRYPTOSCOPE AI ENGINE - Research and Evaluation

## G0 preparation

Issue #1 introduces a single bounded public HTTP probe. It makes one request per listed endpoint, with an 8-second request deadline, no retries and no credential inputs. The report contains UTC, HTTP status, end-to-end latency, selected rate-limit headers, schema shapes and constrained metric observations. Geography is unknown unless independently established. HTTP 403/451 is recorded as restricted and 429 as rate-limited. Venue-specific application errors are distinct from transport errors.

```sh
node --test --test-reporter=tap test/probe.test.mjs
node scripts/market-probe.mjs > market-probe.json
```

On GitHub, the workflow is manually dispatched. GitHub requires a workflow_dispatch workflow on the default branch before it can be dispatched. The workflow stores the JSON as a seven-day artifact.

The sampled Bybit linear and Hyperliquid BTC OI are in base units. OKX exposes both base-coin and contract fields. Bitfinex derivative status and MEXC holdVol are reported in native units. Convert only with a verified base-denominated contract size. Funding rates retain the venue sign, with the interval shown only when present or calculable from explicit funding timestamps. Exchange observation time is independent of probe receipt time. Trade side follows the aggressor convention: Bybit/OKX use the side field, Bitfinex signed amount, Hyperliquid B/A, MEXC futures T and MEXC spot the inverse of the buyer-maker flag. Missing values remain null.

[Draft evaluation requirements](docs/evaluation-v1.1.md)

## G0 follow-up

The stacked PR triggers the bounded probe only for same-repository `codex/issue-3` changes targeting `codex/issue-1`. It caps public HTTP requests at 21, with an eight-second deadline each. Hyperliquid spot resolves the pair from current `spotMeta` and skips trades if the result is ambiguous. OKX and MEXC preserve native sizes and convert trade quantity and OI to BTC only when exact linear contract metadata supports the conversion. Bitfinex requires the documented 24-slot derivative status layout and reports its documented 8-hour funding period. The sign is preserved. A missing timestamp or funding interval remains null.

Official exchange documentation reviewed 2026-11-26 UTC. OKX `sz` and `oi` are contract quantities for swaps, `oiCcy` is currency-denominated, and the sampled linear market has `ctValCcy=BTC`, `ctMult=1`. Non-unit or missing multipliers are outside the verified conversion. MEXC deal `v` and `holdVol` use contracts, `contractSize` gives base per contract for this confirmed linear market. Bitfinex `CURRENT_FUNDING` is position 12, `OPEN_INTEREST` position 18, and `MTS` position 1 (zero-based). Hyperliquid info uses the spot metadata index, with the named first pair as a special case. [OKX](https://www.okx.com/docs-v5/en/) · [MEXC](https://www.mexc.com/api-docs/futures/market-endpoints) · [Bitfinex](https://docs.bitfinex.com/reference/rest-public-derivatives-status) · [Hyperliquid](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
