---
name: kaul-browser-check
description: Perform safe exploratory Kaul browser verification with the globally installed Playwright CLI. Use for temporary UI checks of Journal, Client, Administrator, or future Kaul workflows; keep checked-in @playwright/test coverage authoritative.
---

# Kaul browser check

Use `playwright-cli` only as exploratory evidence. Keep permanent regressions
in the checked-in `@playwright/test` suite; do not replace, modify, or treat a
CLI observation as equivalent test coverage.

Read `AGENTS.md`, `docs/DEVELOPMENT_WORKFLOW.md`, the relevant implementation,
and relevant existing E2E tests before browser work. Use only fictional data.
Never put client data, credentials, session values, or other sensitive values
in commands, URLs, output, screenshots, saved state, or handoff notes.

## Safe setup

For read-only public pages, use an already-safe local server only when that is
enough. Before a flow can create, update, authenticate, or otherwise mutate
application data, use Kaul's dedicated parallel test environment.

1. Obtain an explicit, valid `KAUL_TEST_ID` and `KAUL_TEST_PORT`; never choose
   either value, and never use `kaul` or `postgres` as the ID.
2. Set `DATABASE_URL` and `INTEGRATION_DATABASE_URL` to the same derived local
   `kaul_test_<id>` database. Set `BETTER_AUTH_URL` to
   `http://127.0.0.1:<KAUL_TEST_PORT>`, `DEPLOYMENT_ENV=test`, and a fictional
   process-local `BETTER_AUTH_SECRET` of at least 32 characters.
3. Run `npm run test:db:check`, then `npm run test:db:create` and
   `npm run test:db:migrate` before starting the local server on that port.

Never run destructive browser activity against the normal `kaul` database.
Do not remove an existing test database, stop shared PostgreSQL, or drop the
task database without explicit cleanup authorization.

## CLI workflow

Use only commands verified by `playwright-cli --help`. Start and finish every
session explicitly:

```text
playwright-cli open http://127.0.0.1:<KAUL_TEST_PORT>
playwright-cli -s=<session> snapshot
playwright-cli -s=<session> console warning
playwright-cli -s=<session> close
```

Use `snapshot` and the returned element references before `click`, `fill`,
`type`, `select`, `check`, `uncheck`, `press`, `goto`, `reload`, or navigation
commands. After meaningful flows, use `console` (with an appropriate minimum
level) to inspect browser errors and warnings. Use `find`, `requests`, or a
focused `eval` only when they answer a specific UI question.

Check the behavior relevant to the change: navigation, rendered text and state,
form validation, successful and failed actions, redirects, and console output.
Check keyboard and focus behavior when controls, dialogs, menus, or forms are
affected. Do not create unnecessary screenshots or snapshots when a concise
accessibility snapshot answers the question.

For narrow proof, run `resize 375 812`, then verify the primary task remains
usable, focused controls are visible, and the page has no horizontal overflow.
Use `press Tab`, `press Escape`, and snapshots where applicable. Do not rely on
hover-only behavior.

## Security boundaries

Treat browser identifiers and hidden controls as untrusted. Verify protected
behavior through direct server or integration tests as well as relevant UI
evidence; hidden UI is never authorization evidence.

For Journal work, never expose another user's unfinished private draft. Use
direct/server/integration tests for authorization, organisation isolation,
signed-record integrity, and other security invariants. Do not use Playwright
timing checks to prove database concurrency.

If the CLI fails or behaves inconsistently, report the problem and keep the
application unchanged. Do not install it as an application dependency, add a
Playwright MCP, or alter the checked-in test infrastructure for this tool.

## Finish

Close every task-created session with `playwright-cli -s=<session> close`.
Use `list` first if a session identifier is unclear; do not close another
task's session. Remove generated `.playwright-cli/` output before handoff
unless a human explicitly asks to preserve it. Do not add that directory to
`.gitignore` merely to hide generated artifacts.

Report the explored flow, fictional environment used, observations, console
results, browser cleanup, and the permanent regression coverage still needed.
