# Gemini live qualification — G0 gate

Issue #15. Independent of market capture and TSA. Base Draft #14 `cee8b2e32a79a201d176cafaff387277fa7f3508`.

**Live BLOCKED.** Google lists the exact model `gemini-2.5-flash-lite` and free Standard input/output. Public product pricing is not project evidence. In this worker there was no `GEMINI_API_KEY` or verified AI Studio/Cloud project evidence. Project availability, active free quota and the absence of linked billing remain unknown. Zero Gemini HTTP requests, including token counting and model discovery. No billing changes. [Pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite) · [Model](https://ai.google.dev/gemini-api/docs/models) · [Quotas](https://ai.google.dev/gemini-api/docs/rate-limits) · [Billing](https://ai.google.dev/gemini-api/docs/billing) · [Structured output](https://ai.google.dev/gemini-api/docs/structured-output)

## Owner evidence needed

From AI Studio and Google Cloud Billing, confirm the model is active on the Free tier for the exact project, the key belongs to that project, and no billing account is linked. Provide dated, redacted evidence showing that project and the remaining RPM/TPM/RPD. Use a dedicated project without competing requests during the probe. Make an already-authorized key available as `GEMINI_API_KEY` through the approved runtime secret mechanism. Never send a key in chat, a GitHub comment, or the evidence file. The CLI checks this manual attestation but cannot independently authenticate project state from the JSON. If any claim cannot be verified, leave the live probe on hold.

## Bounded command

Prepare a private evidence JSON file outside the repo with these fields. Use the actual verified values and UTC evidence time (fresh within 15 minutes).

```json
{
  "model": "gemini-2.5-flash-lite",
  "tier": "free",
  "billingLinked": false,
  "project": "<verified project identifier>",
  "credentialProject": "<same verified project identifier>",
  "observedAt": "<verified UTC time>",
  "rpmRemaining": 10,
  "tpmRemaining": 20480,
  "rpdRemaining": 10
}
```

The numbers above are **required local minimum headroom**, not Google quota estimates. Run once with that evidence and secret already present:

```sh
node scripts/gemini-g0.mjs /path/to/verified-project-evidence.json
```

A sibling `.attempted` marker is exclusively created before the first call. Preserve it on errors or interruption. Use one evidence file for the authorized attempt. The probe makes at most 10 POST attempts, no retries or redirects, and stops on the first HTTP, schema, usage or transport failure. It sends identical synthetic CVD/OI/funding/null values, disables thinking and tools, and caps generated tokens at 128. A local 2,048-prompt-token allowance covers the small fixed prompt/schema conservatively. Actual token usage is checked on every response. Report JSON includes UTC, HTTP status, latency/quantiles, declared model, token usage, enum direction and reason code, and unchanged metrics only. A provider alias/version mismatch stops the run pending review.

10/10 valid and zero altered/invented metrics are live acceptance thresholds. Direction/reason agreement and observed latency characterize this request in that setting. They do not establish forecast quality. Optional scaling bound for a dedicated project is min(RPM, floor(TPM / 2048)) per minute and min(RPD, 1440 × minute bound) per day before headroom and failures. Real project inputs are absent, so realized throughput is unknown. The ten-call cap is independent of this arithmetic.

## Executed vs read

- RED `node --test test/gemini-g0.test.mjs` exited 1 because the module did not exist.
- GREEN `node --test --test-isolation=none test/gemini-g0.test.mjs` exited 0, four tests with injected transports. Mocked 10/10 schema preservation, agreement, quota gate, rejection cases and no retries. No real performance evidence.
- `node scripts/gemini-g0.mjs /tmp/i15-unverified.json` with missing project evidence/key exited 1 before transport.
