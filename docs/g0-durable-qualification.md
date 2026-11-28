# G0 durable rehearsal and TSA qualification

Issue #13. Preparation only, based on Draft #12 at `54d631bb2ba86d59c25ada9a6b76fa4f73be7a0d`. v1.1 remains **CHANGES REQUESTED** until independent review.

## Bounded local ledger

The rehearsal uses an explicit SQLite database and FULL synchronous commits. Before any model callback, one atomic insert reserves a decision key derived from venue, native instrument, target and protocol. Snapshot digest is separately unique. A second connection or restart cannot replace that reservation with another snapshot for the same target. A failure after dispatch leaves the reservation stranded by design. There is no automated retry or recovery of an uncertain model result.

After the signed snapshot and prediction checks, the record can be inserted only once. Scoring revalidates both receipts and hashes, the outcome's clocks and native venue, then atomically saves the canonical outcome and digest only if the previously read prediction is unchanged and the outcome slot remains unused. Missing outcomes can be retried because they leave the slot empty. Returning the successful score simulates a push. No external push is performed. Durability here depends on SQLite and the local filesystem honoring sync. This prototype does not provide a tamper-proof disk, distributed replay protection, or a recovery/delivery guarantee after the scoring transaction.

The full-path fixture loads the exact site `tradeHistory` bytes only after checking the pinned SHA-256. The signed snapshot binds a complete **synthetic** trade tape, with bounded native quantities and event/observation times. The versioned mapping takes the sign of the closed synthetic candle delta times one basis point. The prediction includes a digest of the mapping descriptor and core pin. Without a complete tape the baseline and its paired loss are null. The prediction's CVD field remains null and fixture success says nothing about real tape completeness or unit comparability. Other ledger tests use an explicit test double. The site repo was read-only.

## RFC 3161 candidate only

Re-read [FreeTSA's official description](https://freetsa.org/index_en.php), [RFC 3161](https://www.rfc-editor.org/rfc/rfc3161) and the [previous recorded probe](g0-prediction-rfc3161.md). FreeTSA describes a public free endpoint and publishes a CA and signer. No independently authenticated root or approval, binding quota/availability commitment, or conservative time-accuracy guarantee for our use was established. The previously obtained response omitted accuracy. The one observed HTTP time is not a latency distribution. Production remains **HOLD**.

The offline candidate verifier consumes raw DER query and response. It pins exactly one candidate CA certificate by SHA-256 fingerprint and uses a scratch trust directory. OpenSSL validates time-stamping EKU, path, signer, nonce and imprint, including against the caller's expected digest. The fixture rejects tampered signature, changed nonce/imprint and unexpected root. Missing or unparseable accuracy fails closed. A conservative uncertainty interval, including a millisecond for parsing precision, must fit entirely within the authorized window. The window test is local and synthetic. There was no full positive response with stated accuracy in this run. The dry-run still uses separate fixture Ed25519 receipts. Neither the candidate CA nor the TSA integration is enabled for real capture.

Re-read official [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [billing](https://ai.google.dev/gemini-api/docs/billing) and [quota](https://ai.google.dev/gemini-api/docs/rate-limits) material retained from the previous gate. Project-specific free eligibility, quotas and disabled billing are still unverified. Gemini requests: zero. Exchange capture/processing rights and the prior Bybit 403 remain open. No new Actions runner evidence, timestamp requests, exchange requests or collection.

## Executed

- RED `node --test --test-isolation=none test/dry-run.test.mjs` exited 1 with the added two-connection test on Draft #12. The competing callback ran under the old in-memory scheme.
- GREEN `G0_TEST_CORE_BYTES=/tmp/eval11-core.mjs G0_TEST_TSA_DIR=/tmp/i11-tsa node --test --test-isolation=none test/*.test.mjs` exited 0, 33/33. Core input was extracted from `f5f6dba4130c87c1c30bab72719cc2fbb222e6f0:assets/instrument-trades.mjs`; its hash is checked at load. TSA scratch inputs are the previously retained synthetic request, reply, candidate certs and negative fixtures from #11. The optional tests skip explicitly if local fixture paths are absent.
- The file-backed tests cover two independent connections competing for the same target, simulated callback crash, reopen, persisted score replay, and receipt corruption before simulated push. Separate timing tests cover the late decision and uncertainty overlap.
