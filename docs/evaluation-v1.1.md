# Evaluation v1.1 — requirements draft

## G0 — seven days of preflight, when authorized

Freeze the core commit SHA, dependencies, candidate definitions, outcome venue and instrument, horizon, and the evaluation configuration before any model calls. Record the code revision of this separate repository. G0 checks logging, delivery, missingness and timestamp integrity. Seven days defines this preflight window. Duration of the scored evaluation remains open. This preparation task runs only the bounded public HTTP probe. The scored experiment and model implementation remain on hold.

Write the complete pre-model input, including source IDs, units, observed timestamps, retrieval timestamps, outcome contract, and input coverage, to a read-only content-addressed snapshot. Serialize canonically and hash with SHA-256. Store an independently timestamped digest using an approved zero-cost anchor before accumulating evaluation records. Verify anchor receipts during ingestion. Anchor provider and immutability mechanism require approval before G0. Preserve amendments as new records linked to the original digest.

Before every push, use a fail-closed guard for repository and branch, tracked paths, secret detection, referenced input/core digests, anchor receipts for evaluation records, and configuration budget. The future guard must reject mismatches before writing or pushing records. This preparation PR does not introduce evaluation records.

## Paired comparison and walk-forward

Compare baseline and candidate on exactly the same frozen inputs and matched outcome observations. Outcomes use the same venue, instrument, unit, horizon and endpoint for both arms. Freeze the inclusion policy before opening results. Report coverage and dropped pairs by venue and reason. For missing data retain null and the failure reason.

Order cohorts chronologically. At each fold fit only on input snapshots whose outcomes have matured before the training cutoff. Purge training examples with outcome windows crossing the cutoff, add an embargo for overlapping feature horizons, and lock all tuning inside the training period. Select and lock the primary paired metric and decision threshold before scoring held-out folds. Record timestamps with UTC offsets and provenance.

Estimate the scored duration after measuring paired losses and their dependence under approved conditions. For paired differences, estimate long-run variance with a prespecified HAC estimator or moving-block bootstrap by time, grouping shared venue/time shocks. Choose a minimum detectable difference, confidence level and target power in advance. An initial approximation is n ≈ (z_(1−α/2) + z_(power))² × long-run variance / difference². Translate n into elapsed time using measured valid pair arrivals and missingness. Confirm the estimate with block resampling and report uncertainty. Sample size and dates remain unestimated until variance, dependence and effective pair throughput are observed.

## Provider gate

Check Gemini free quota, rate limits, response schema and repeated-response stability in a separate approved gate. Disable billing and fail closed when free quota or eligibility cannot be verified. Record availability and quota evidence independently of exchange data. No model calls occur in this preparation.

## Gate table — 2026-11-26 UTC

| Gate | Status | Evidence or exit criterion |
|---|---|---|
| G0 transport and contracts | Preparation | Run the 21-request probe, review restrictions and schemas per venue, and preserve the runner artifact. |
| Core pin | HOLD | Record the exact approved market core SHA and digest in the guard. Draft #2 HEAD is the preparation base, not approval of an evaluation core. |
| Snapshot, guard and external anchor | HOLD | Verify that unauthorized branches and altered snapshots fail before push. Verify an independent timestamp receipt before accumulation. |
| Seven-day G0 | HOLD | Start only after the preceding gates are authorized and operating. Record completeness, leakage tests, and the exact outcome venue for both arms. |
| Gemini eligibility and stability | HOLD | Verify the exact project and model's free quota and billing state in AI Studio. Stability is a separate test and has not been measured. |
| Scored evaluation | HOLD | Freeze folds and outcome horizon, exercise purge/embargo fixtures, and size from paired variance, time dependence and valid pair throughput. |

Gemini documentation reviewed 2026-11-26 UTC. Google lists free Standard text input/output for `gemini-2.5-flash-lite`; model and feature eligibility vary, and some models have no free quota. Active RPM, TPM and RPD are project/model-specific. Record the actual limits from AI Studio before authorizing any call. No project quota evidence was available in this preparation. Use a project without linked billing, verify its free-tier eligibility and quota, lock the exact model, stop at local caps or 429, and fail closed on uncertain tier or model availability. No model calls were made. [Pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite) · [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Billing](https://ai.google.dev/gemini-api/docs/billing)

## Offline leakage audit

See [the pinned core and G0 coverage audit](core-math-g0.md). Point-in-time historical evaluation remains blocked on publication and revision evidence.
