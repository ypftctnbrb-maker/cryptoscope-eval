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
