# ground-truth-seo: ground rules

This repository is the single source of truth for the Ground-Truth SEO engine: the specification
in docs/, the ruleset, acquisition, evaluation, reports, the security checker, the advisory content
review and the `ground-truth-seo` command line. The website at seoscanner.app consumes it as an npm
dependency and holds no copy of the engine. Rule and spec changes happen here first; the website
picks them up by upgrading the package.

## SEO scanner: ground rules

- Specs live in docs/. PRODUCT.md defines behavior and scoring. KNOWLEDGE.md is the only
  source of SEO knowledge: rule logic, classes, reason templates, fixes and quotes. SOURCES.md
  defines citable sources.
- Do not add a check, threshold, weight or claim that is not in KNOWLEDGE.md. If something seems
  missing, propose a KNOWLEDGE.md change with a registered source and a verbatim quote first.
- Rule IDs, condition codes and source IDs are stable identifiers. Never rename or reuse them.
- Evaluation is a pure function of (snapshot, ruleset, config): no network, clock, randomness,
  locale, floating point in output, or model calls. Run the determinism tests before every merge.
- Reasons are filled templates, never generated prose. Quotes are emitted exactly as stored.
- Nothing in KNOWLEDGE.md §6 (myth guard) may ever produce a fail.
- Every rule and fail condition ships with fixtures (fixtures/rules/\*.test.ts).
- The ruleset is transcribed in src/scanner/rules/; src/scanner/rules/ruleset.test.ts checks every
  stored quote against KNOWLEDGE.md verbatim and every source ID against SOURCES.md.
- The advisory AI review (PRODUCT.md §17, src/content-review/) is the only place model calls are
  allowed. It runs after evaluation and never touches report.json or the score. Its instructions
  come only from KNOWLEDGE.md §11, transcribed in src/content-review/guidance.ts and checked by
  guidance.test.ts; change §11 first, with a registered source and a verbatim quote.
- The security checker (PRODUCT.md §20, src/security/) is not an SEO rule set and never touches the
  score. Its checks, confirmation rules and wording come only from KNOWLEDGE.md §12, transcribed in
  src/security/knowledge.ts and checked by knowledge.test.ts. It must never emit, store or log a
  matched secret (§12.2); fixtures/security.test.ts plants secrets and fails if one reaches a result.

## Package rules

- Golden reports (PRODUCT.md §6) live in fixtures/golden/. A golden report.json changes only when
  the ruleset or the report format changes on purpose; regenerate it with
  `ground-truth-seo evaluate` and review the diff. CI also runs them under other time zones and
  locales and on more than one operating system.
- The package version (package.json) is independent of RULESET_VERSION and SCANNER_VERSION. A
  ruleset change bumps RULESET_VERSION in src/scanner/rules/index.ts as KNOWLEDGE.md §9 says;
  reports carry the ruleset version, never the package version.
- The command line reads plain environment variables only (CRUX_API_KEY, AI_GATEWAY_API_KEY,
  AI_REVIEW_MODEL, AI_REVIEW_DISABLED). It loads no .env file. Keys never enter a snapshot, a
  report, a review file or anything printed; src/cli/main.ts redacts them as a last line of
  defense.
- No runtime dependency on Next.js, a database, tsx or any hosting platform. Code that needs a
  framework (server-only markers, routes, database writes) belongs in the consuming application.
- Relative imports carry a `.js` extension (NodeNext ESM). `src/index.ts` and
  `ground-truth-seo/scanner/rules` are the supported API; deeper paths mirror src/ and are exported
  for the website and advanced users, but may change between minor versions below 1.0.
- Before a pull request: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
