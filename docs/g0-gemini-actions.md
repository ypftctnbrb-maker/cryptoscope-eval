# Manual Gemini Actions review — Issue #17

Live state: **BLOCKED**. Owner reports that repository Actions secret `GEMINI_API_KEY` exists and that AI Studio shows Free tier and “Set up billing”. The GitHub installation's read-only metadata request `gh api repos/ypftctnbrb-maker/cryptoscope-eval/actions/secrets` exited 1 with HTTP 403, “Resource not accessible by integration”. A 403 does not establish whether the secret exists. No key value was requested or read.

Project access to exactly `gemini-2.5-flash-lite` and remaining RPM, TPM and RPD are still unverified. Public Standard pricing cannot confirm this project's access or quota. [Pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite) · [Project limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [Billing](https://ai.google.dev/gemini-api/docs/billing)

GitHub reports default branch `main`. The Actions API lists the earlier market probe, but `gh api 'repos/ypftctnbrb-maker/cryptoscope-eval/git/trees/main?recursive=1'` returned no workflow paths. GitHub requires the manual workflow file on the default branch before it can dispatch. [GitHub manual dispatch requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## Review package and smallest owner action

1. Confirm exact model presence and remaining quota for the project shown in AI Studio, verify that billing is unlinked, and confirm the already configured secret is tied to this project. The existing #15 harness needs at least 10 remaining RPM, 20,480 remaining TPM and 10 remaining RPD. Record verified UTC evidence within 15 minutes of the probe. Confirm included Actions runner capacity before dispatch. Never send the raw key.
2. Review [the dormant workflow template](gemini-g0.workflow.yml), the exact `scripts/gemini-g0.mjs` from Draft #16 and the associated fixture test. When authorizing execution, place the reviewed template at `.github/workflows/gemini-g0.yml` alongside the reviewed harness and test on default `main`. The template under `docs/` is inert. The worker did not change working workflows, settings, secrets or the default branch.
3. Use Actions → Bounded Gemini G0 qualification → Run workflow, select `main`, and enter the verified inputs. Dispatch once. The job pins the event SHA, verifies the harness SHA-256 after running secret-free tests and exposes the existing secret to the one probe step only. The job gates on the exact repo, manual event, main, first run attempt and explicit attestation. Contents permission is read-only. It runs at most ten identical synthetic requests, halts on first failure, and emits only sanitized output. There is no schedule, PR trigger, secret-bearing artifact upload or auto-retry. Concurrent jobs are serialized, which is not a global quota across separate manual dispatches.

The workflow validates an operator's manual attestation. It cannot independently verify Google project metadata or the project's billing status from an API key.

## Evidence

- Reviewed Draft #16 HEAD `d206ae593d040b30cb2009477c3da4797af9767f`. `git show HEAD:scripts/gemini-g0.mjs | sha256sum` → 0, hash `db244090b892ec214779b7adf415ac4fa3c96bdceb04943fa6186c2d18ce4ff1`.
- RED `test -f docs/gemini-g0.workflow.yml` → 1. GREEN Python PyYAML BaseLoader parse and structural assertions → 0 (manual-only trigger, read-only permissions, main/first-attempt guard, exact checkout SHA, one secret scope, no expression interpolation into shell and harness hash).
- `G0_TEST_CORE_BYTES=/tmp/eval11-core.mjs G0_TEST_TSA_DIR=/tmp/i11-tsa node --test --test-isolation=none test/*.test.mjs` → 0, 37/37. Gemini traffic in these tests used mock transport.
- Live requests: **0**. No Actions run was dispatched, so a run URL, real token counts, schema acceptance, agreement and latency are unavailable.
