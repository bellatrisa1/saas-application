# Full project check — 2026-09-16

## Scope and result

Reviewed the server authentication/authorization paths, PostgreSQL schema and transactions, route dispatch, realtime ordering, optimistic cache changes, issue forms, dialog keyboard behavior, mobile navigation, and documentation. Ran the checks below against the current local application and PostgreSQL 17. Existing user edits were preserved.

The implemented portfolio application passes its automated functional checks. This is not a penetration test, exhaustive browser/accessibility audit, or certification for a public production launch.

| Check                                     | Result                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| TypeScript strict typecheck               | Pass                                                        |
| ESLint                                    | Pass                                                        |
| Prettier check                            | Pass                                                        |
| Unit tests                                | 7 passed                                                    |
| HTTP/PostgreSQL integration tests         | 5 passed across 2 files                                     |
| Playwright Chromium                       | 2 scenarios passed                                          |
| Fresh database migration                  | Pass                                                        |
| Migration rerun against the same database | Pass; idempotent                                            |
| 10,000-issue / 1,000-member scale fixture | Status index used; 51 rows fetched in about 0.05 ms locally |
| Production webpack build                  | Pass                                                        |
| Turbopack production build                | Environment failure: SCSS worker local-port binding denied  |
| npm production dependency audit           | 0 known vulnerabilities reported                            |
| Git whitespace check                      | Pass                                                        |

Unit tests intentionally skip integration suites unless RUN_INTEGRATION=1. Integration tests were explicitly run separately; their skipped status in `npm test` is not missing verification. The scale fixture rolls back its data; the migration check created and removed its own disposable database. HTTP/browser tests leave uniquely named test accounts and workspaces for inspection.

## Defects fixed during this check

1. **Realtime ordering:** casting event IDs to text and sorting the alias caused lexicographic order (10 before 9). The shared event query now orders by the underlying bigint column. A real PostgreSQL regression test crosses a digit boundary.
2. **API dispatch:** unsupported methods and misspelled child paths could fall through to issue mutations. Handlers now validate resource shape and allowed methods before dispatch. Regression tests prove those requests do not mutate data.
3. **Upload errors:** malformed multipart input produced an internal error. It now returns a specific 400 response; private download authorization and viewer upload restrictions are tested.
4. **Assignee retention:** filtering available members could remove the selected option and silently clear assignment. Selection is controlled and retained outside the current search results.
5. **Nested dialogs:** both an issue editor and an overlaid command palette handled Escape/Tab. Only the top dialog handles those keys; the palette focuses its input.
6. **Optimistic cache scope:** board changes updated unrelated cached filter views. Snapshots and updates now target the current project/search view. Realtime refetches defer while an optimistic issue mutation is pending.
7. **Mobile navigation:** the fixed sidebar covered the only close control. A mobile-only close button now permits closing and reopening navigation, covered at 390px viewport width.
8. **Build command:** the default command now uses webpack, which completes in this environment. Turbopack remains explicitly available with `npm run build:turbo`.

## Behavior verified

- Registration, cookie session login/logout, session expiration and CSRF rejection.
- Workspace/project creation; invitations, single-use acceptance and role restrictions.
- Tenant isolation, protected attachments and server permission enforcement.
- Issue creation/assignment, optimistic drag-and-drop, failed-mutation rollback.
- Concurrent version conflicts without silent overwrite or loss of an unsaved form draft.
- Partial updates preserve descriptions, priorities, labels, assignees and date-only values.
- Issue cursor pagination without overlap; empty cursors accepted on first pages.
- Transactional audit records, assignment/comment notifications and mark-as-read.
- Issue updates visible in a second browser context without refreshing.
- Shareable filters, keyboard commands, nested-dialog focus and mobile sidebar controls.

## Remaining boundaries

- Email delivery, email verification, password reset, MFA and ownership transfer remain unimplemented, as documented in the README.
- Attachments need object storage/quarantine/scanning and workspace quotas before public uploads at scale.
- Production deployment still needs HTTPS, trusted-edge abuse controls, secret management, database least privilege, backups/restore drills, retention jobs and monitoring.
- SSE uses polling and broad workspace invalidation. The scale query benchmark does not test 1,000 simultaneous connections or establish production latency guarantees.
- Tests run on Chromium. Safari/Firefox, screen-reader behavior, complete WCAG conformance and a full load test are not established.
- The dependency audit covers production packages and known published advisories, not custom-code security.
- No exhaustive feature claim: project/workspace selector caps, no private projects, no custom workflows, no within-column manual ordering, and bounded issue page retention are documented trade-offs.

## Reproduce

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
# Start the app against a disposable PostgreSQL test database first:
npm run test:integration
npm run test:e2e
npm run test:scale
npm run build
npm audit --omit=dev
```
