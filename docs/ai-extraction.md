# AI fact extraction (Phase 4)

A model reads a stored signal's label and excerpt and suggests candidate facts. The suggestions are shown
to people next to the rule-extracted values. **They never feed triage, references, case rules, claims or
impact calculations**; those still come only from the deterministic code in Phases 2 and 3. Turning AI on
or off does not change any calculation (this is covered by a test).

Code: `src/lib/ai/` (provider interface, mock, Ollama adapter, schema, extraction),
`src/lib/investigation/extraction.ts` (when to run, recording), `src/lib/store/*extraction*` (storage).

## Providers

| `AI_PROVIDER` | What runs | Notes |
| --- | --- | --- |
| `none` (default) | Nothing | The UI says "AI extraction is off". The rest of the app is unaffected. |
| `mock` | `MockProvider` | Deterministic regular expressions behind the provider interface. **Not a model**; labelled "mock provider (deterministic, not a model)". For development, tests and demos. |
| `ollama` | `OllamaProvider` | A local Ollama server at `OLLAMA_BASE_URL` with `OLLAMA_MODEL`. |

There is no remote provider. If the configured provider fails, the result is recorded as `unavailable`,
`timeout` or `invalid_output`. **The app never falls back to another provider**, including the mock.

Ollama setup:

```bash
ollama pull qwen2.5:3b        # any local model with JSON-schema output; qwen2.5:3b is a small default
# .env.local
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:3b
# OLLAMA_BASE_URL=http://127.0.0.1:11434   (default)
```

`OLLAMA_BASE_URL` must be a loopback address (`localhost`, `127.x.x.x` or `[::1]`) without credentials.
Anything else fails env validation at startup, so signal text cannot be sent to a remote host through this
setting. Requests use `redirect: "error"`. Local execution does not by itself make storage or access
control secure; the stored results follow the same tenant scope and RLS as other tables.

| Variable | Default | Range |
| --- | --- | --- |
| `AI_PROVIDER` | `none` | `none`, `mock`, `ollama` |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | loopback only |
| `OLLAMA_MODEL` | none | required when `AI_PROVIDER=ollama` |
| `AI_TIMEOUT_MS` | `15000` | 1000-60000, **per attempt** |
| `AI_MAX_RETRIES` | `1` | 0-2 |

The worst-case time for one signal is `AI_TIMEOUT_MS × (1 + AI_MAX_RETRIES)`, 30 seconds with the defaults.
In the ingest request this time is added to the response latency, because extraction runs after the
investigation, in the same request.

## Prompt `signal-extraction.v1`

- Input: the signal's normalized label and excerpt only, capped at 2000 characters. No business records,
  no other signals, no case data.
- The source text sits between `<<<SOURCE_TEXT` and `SOURCE_TEXT>>>`. Copies of those markers inside the
  text are removed first, so a message cannot close the block early. The system prompt says the block is
  untrusted data and its instructions must not be followed.
- Fields: `delayDays`, `quantity`, `unit`, `purchaseOrder`, `material`, `shipment`, `lot`,
  `productionOrder`. Each answer is `{ "value": ..., "quote": "..." }`, where the quote is an exact copy of
  the source text that supports the value. Unknown fields are omitted.
- Output budget: 400 tokens requested; responses over 8 KB are rejected (the Ollama envelope is capped at 32 KB).

## Validation and grounding

The model's output is untrusted. In order:

1. The response must be a JSON object containing only the known field names. Otherwise the whole attempt
   is `invalid_output` (`unparseable_json`, `not_an_object`, `unknown_keys`).
2. Each field is checked separately against a strict schema (`src/lib/ai/extraction-schema.ts`):
   `delayDays` is an integer from 1 to 365, `quantity` is from 0 to 10,000,000, `unit` must be a supported
   unit, and references must match `^[A-Za-z0-9][A-Za-z0-9/_.-]{1,63}$`. Quotes are capped at 300 characters.
3. Grounding: the quote must appear in the source text, ignoring case and whitespace, and a reference
   value must appear verbatim in the source (both `not_in_source`). The value must also appear in its quote
   (`value_not_in_quote`): references by text, units through the same unit normalizer the rules use,
   quantities as a number written in digits, and delays through the same parser as
   `extractReportedDelayDays` (so "four days" supports `4`).

A field that fails steps 2 or 3 is dropped and listed with its code under `rejected`. Its value is not stored.
If every field is dropped and none passed, the attempt still counts as `completed` with zero facts:
the model answered, and nothing it said survived.

## Retries and limits

- Each attempt has its own `AI_TIMEOUT_MS` deadline, enforced even if the provider ignores the abort signal.
- Retries happen only after a timeout or an envelope-level `invalid_output`, up to `AI_MAX_RETRIES`.
- `unavailable` (server unreachable, HTTP error, unsupported task) is never retried.
- `db:extract -- --backfill` stops at the first `unavailable` result instead of calling a down server for
  every remaining signal.

## Comparison with rules

For each field, the stored `comparison` row says whether the AI value and the rule value (from the
signal's normalized references, unit, quantity and `extractReportedDelayDays`) **agree**, **differ**, exist
for the **AI only**, or for the **rules only**. A disagreement is information for a person, not a conflict
claim, and it does not change the case.

## When it runs

- After `ingestAndInvestigate` stores and investigates a signal, for signals that are accepted, not
  duplicates, not triaged `irrelevant`, and have text. Others are `skipped` with the reason.
- `npm run db:extract -- --backfill [--limit N]` (N from 1 to 500, default 200) extracts stored signals
  that have no `completed` extraction for the **current** provider, model and prompt version, oldest
  first. Failed results are retried; completed ones are not repeated.
- `npm run ai:smoke` sends one synthetic navy-fabric message to the configured provider and prints counts
  only (status, fields kept, fields dropped, agreements, latency). It writes nothing.

The ingest response field `extraction` is `completed | invalid_output | unavailable | timeout | disabled |
skipped | failed`. `failed` means the result could not be stored. An extraction failure never fails the
ingest request; the signal and its case are already committed.

## Storage

`ai_extractions` (migration `0004_ai_extractions.sql`), one row per extraction run (covering all of its attempts), append-only (update and
delete are rejected by triggers), tenant-scoped with a composite foreign key to the signal, RLS enabled and
no privileges for `anon` or `authenticated`. Columns hold the provider, model, prompt version, status,
failure code, kept fields with quotes, rejected field codes, the comparison, character and token counts,
latency and attempts. A check constraint enforces that non-completed rows have a failure code and no
fields. The raw model response and the prompt are **not** stored.

Each row is written in the same transaction as its event (see `docs/event-schema.md`). Ids are
`<signalId>-AI<n>`.

## UI

The case workspace has an "AI-extracted candidates" section with one panel per linked signal, and the
Live Activity signal trace shows the panel for that signal. Each panel states "Suggested by a model. Not
used in calculations. Verify against the source." (for the mock: "Suggested by the deterministic mock
extractor, not a model.") and shows the value, the supporting quote, the rule
value and the comparison (icon plus text), dropped fields, provider, prompt version, latency, attempts and
tokens. It has explicit states for AI off, no extraction recorded, invalid output, unavailable and timeout.
The panel is not shown in fixture mode.

## Limitations

- Only one task (`signal-extraction.v1`) exists; no summaries, classification or recommendations.
- The live Ollama path is tested against a mocked `fetch`; whether a given local model answers well is
  not measured. Model quality must be evaluated before relying on its suggestions.
- Token counts come from Ollama's `prompt_eval_count` and `eval_count` when present; there is no cost estimate.
- Extraction in the ingest request is synchronous; there is no background queue.
