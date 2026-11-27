# G0 prediction commitment and time-stamp investigation

Issue #11, preparation only, stacked on Draft #10. The [prior review](g0-review-dry-run.md) describes the synthetic market and capacity assumptions.

## Staged offline path

`createDryRun().predict(snapshot, snapshotReceipt)` accepts no outcome. It validates a pre-decision snapshot receipt, takes canonical bytes, reads an injected clock, then calls the local fixture model with only those bytes, their digest and the model identity/version/configuration. It hashes the separate prediction record and requires a signed receipt over that digest before the target opens. The receipt must be at or after prediction generation and at or before the injected current time. The snapshot digest is checked again before storing the record. A started snapshot cannot call the model again in that session even if commitment fails. The returned prediction is a copy.

`score(id, outcome)` reads the stored receipt and record. A missing outcome returns null without consuming the prediction. A present outcome must match the native venue/instrument and target window and its observation must already be mature. Prediction and score replays fail within the in-memory session. This simulator has no durable storage, crash recovery, independent production authority, live model integration or collector. Those require separate review. Its prediction arm still uses a candle-return proxy and local numeric stub.

## Pinned site code

Read-only `git -C /workspace/i92-sphere show 60c1c93ecc9410d9d7f100fb53048916bdd7ef35:assets/instrument-trades.mjs | sha256sum` and the same path in candidate `f5f6dba4130c87c1c30bab72719cc2fbb222e6f0` produced `531d7b4ded7f3d4204a1249112ec46b7cb2eca845a29673e5780fd0c1436bc0b`. Extract candidate bytes to a scratch file and run `node scripts/check-pinned-core.mjs /tmp/eval11-core.mjs` (exit 0). This hashes before importing those exact bytes, calls actual `tradeHistory` against synthetic executions, and checks duplicate suppression, carry and reset over a missing bucket. A one-byte mutation fails digest verification (exit 1). The actual site arithmetic is exercised separately from the prediction proxy. CVD remains null in prediction snapshots; fixture assertions do not establish complete live tape or cross-venue units.

## RFC 3161 candidate and bounded probe

Read on 2026-11-27 UTC. [RFC 3161](https://www.rfc-editor.org/rfc/rfc3161) specifies the imprint, nonce, signed time, policy and optional accuracy. [FreeTSA](https://freetsa.org/index_en.php) explicitly offers its RFC 3161 endpoint free and publishes its CA and signer. A service-level accuracy bound, applicable retention terms, quota and availability for ongoing use remain unverified. [DigiCert documentation](https://docs.digicert.com/en/software-trust-manager/client-tools/command-line-interface/smctl/manage-timestamps.html) was also read. This review has no verified zero-cost project terms for that candidate. No request sent there.

Executed one FreeTSA HTTPS POST with a hash-only SHA-256 request for a fixed synthetic string. No market data, registration, payment or live model calls. With OpenSSL 3.5.7, in scratch space:

```sh
printf 'cryptoscope-eval G0 synthetic RFC3161 fixture v1\n' > fixture
curl -fLsS --max-time 12 https://freetsa.org/files/cacert.pem -o ca.pem
curl -fLsS --max-time 12 https://freetsa.org/files/tsa.crt -o tsa.crt
openssl ts -query -data fixture -sha256 -cert -out query.tsq
curl -fsS --max-time 15 -H 'Content-Type: application/timestamp-query' --data-binary @query.tsq https://freetsa.org/tsr -o response.tsr -w 'HTTP %{http_code} %{time_total}s\n'
openssl ts -reply -in response.tsr -text
openssl ts -verify -in response.tsr -queryfile query.tsq -CAfile ca.pem -untrusted tsa.crt
```

All above exit 0. HTTP 200 in 0.128040 s for one request. Status Granted, SHA-256, nonce present. The signed genTime 2026-11-27 23:07:53 UTC fell within the recorded client bracket 23:07:52–53 UTC (Python assertion exit 0); this is not a precision measurement. Accuracy unspecified. OpenSSL local verification with the provider CA verified nonce, imprint, signature and path. The time-stamping EKU is critical, leaf expiry 2040-02-02 UTC, root expiry 2041-03-07 UTC. Observed root SHA-256 fingerprint `A6:37:9E:7C:EC:C0:5F:AA:3C:BF:07:60:13:D7:45:E3:27:BB:BA:A3:8C:0B:9A:F2:24:69:D4:70:1D:18:AA:BC`. The provider root was retrieved over TLS but was not independently authenticated or approved as a production trust anchor.

Using the same verify command with a fresh nonce query, with `-data changed` in place of the query, with the system CA bundle instead of provider CA, with `-attime 2524608000`, and with the last signature byte flipped all exited 1. The failures were nonce mismatch, imprint mismatch, self-signed chain, certificate expiry and ECDSA signature failure respectively. Future certificate validation time is a negative test, not a decision about archival validity.

HOLD for production. One fast reply cannot establish latency distribution, quota, revocation handling or clock accuracy. The signer attests the commitment at its stated time, without authenticating exchange data or the collector's time. Independent trust-root approval, permissible terms, measured uncertainty and verification of time bounds before decisions remain necessary. Never add the provider root to the system store as part of this experiment. Prior market rights, Bybit availability and Gemini project gates remain pending.

## Test evidence

RED `node --test --test-isolation=none test/stages.test.mjs` on the base with the staged tests exited 1 (missing `createDryRun` export). The tests then replaced the obsolete combined-path suite. GREEN `node --test --test-isolation=none test/*.test.mjs` exited 0 (28/28).
