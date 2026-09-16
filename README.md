# Orbit

A focused, multi-tenant project management application inspired by Linear and Jira. Built with Next.js App Router, TypeScript, PostgreSQL, SCSS modules, TanStack Query, Zustand, and Zod.

![Orbit workspace](docs/workspace.png)

## Run locally

Requires Node.js 22+ and PostgreSQL 17+. No third-party accounts are required.

```sh
npm ci
cp .env.example .env
# Create an empty PostgreSQL database and set DATABASE_URL in .env.
# APP_ORIGIN must exactly match the browser origin.
npm run db:migrate
SEED_PASSWORD='choose-a-strong-demo-password' npm run db:seed
npm run dev
```

Open http://localhost:3000. The optional seed creates `bella@orbit.local` (owner), `anna@orbit.local` and `victor@orbit.local` (members), and `james@orbit.local` (viewer). Each uses the supplied seed password. Seed refuses to overwrite an existing seeded account. You can instead register and create an empty workspace.

For PostgreSQL with Docker:

```sh
docker compose up -d
npm run db:migrate
```

For a production build:

```sh
npm run build -- --webpack
npm start
```

Run behind HTTPS: production cookies are Secure. Supply `DATABASE_URL` and the canonical HTTPS `APP_ORIGIN`. Use a long-running Node service with SSE support; configure proxies to disable response buffering for event streams. The webpack build is verified; the default Turbopack build is also available via `npm run build`.

## Product capabilities

- Registration, login/logout, expiring opaque sessions, scrypt password hashing.
- Multiple workspaces, settings, invitation links, member roles and removal.
- Projects, archive/settings, project membership and activity.
- Issues with title, description, status, priority, assignee, reporter, labels and due dates.
- Paginated list and Kanban views, pointer/keyboard drag support, optimistic moves and rollback.
- Comments, email mentions (`@anna@example.com`), private attachments and watchers.
- Workspace SSE updates, unread notification counts, inbox and mark-as-read.
- Persistent, transactional audit history with before/after field values.
- Shareable URL filters and Cmd/Ctrl+K command palette with keyboard navigation.
- Dark/light workspace themes, loading/empty/error states and responsive layout.

Search example:

```text
login status:in-progress priority:high assignee:"Anna Chen" label:frontend due:<2026-10-01
```

Press Enter to apply search. Unknown filter names and invalid values return validation errors. Full text uses PostgreSQL English stemming. Board columns fetch independently, so a large backlog does not hide work in other statuses. Drag only changes status, not within-column ordering. Open an issue to change status or assignee with the command palette.

## Architecture

See [the architecture decision record](docs/architecture.md) for the design written before implementation and subsequent decisions.

```text
src/app/          Server pages and HTTP route adapters
src/server/       Authentication, access policy, transactions and domain services
src/lib/          Shared validation, permissions, search and HTTP contract
src/components/   Interactive views, dialogs, SCSS modules and query hooks
db/               Versioned PostgreSQL schema
scripts/          Migration, sample data, screenshot and scale checks
tests/            Unit tests and real HTTP/database integration tests
e2e/              Playwright critical user journey
docs/             Architecture and actual application screenshot
```

Server Components authenticate the protected entry page; route handlers authenticate and authorize every request independently. Client components are used for interactive workspace views. Domain services own business rules, SQL and transaction boundaries. `server-only` prevents importing persistence and authentication into client bundles. Explicit SQL keeps tenancy, locks and query plans visible.

### Data model

[The migration](db/001_initial.sql) is the authoritative schema. Users join workspaces through unique `(workspace_id, user_id)` memberships. Projects and issues belong to workspaces. Composite foreign keys prevent assigning an issue to another tenant’s project or member. Projects also have an explicit membership table; project membership is organizational, not a private-project access boundary.

Issues have workspace-allocated numbers, version counters, reporters, optional assignees, text-array labels, and related comments, attachments and watchers. Audit data intentionally survives issue deletion. Sessions and invitations store token digests. Notifications belong to workspace members; removal cascades their notifications and watcher relationships. Role/status/priority checks and unique constraints enforce valid stored values.

Indexes cover workspace keyset pagination, status/project views, assignees, due dates, GIN full text/labels, session expiry, unread notifications, activity and event cursors. SQL parameters handle all user values. No string-interpolated filter values reach queries.

### Authentication and authorization

Random 256-bit bearer tokens are stored in HttpOnly, SameSite=Lax cookies and SHA-256-digested in PostgreSQL. Production cookies require HTTPS. Sessions expire after seven days; logout deletes the server session. Passwords use salted scrypt and constant-time hash comparison. Login does equivalent password work for unknown users. Account-based rate limits live in PostgreSQL.

| Capability                                 | Owner | Admin | Member | Viewer |
| ------------------------------------------ | ----- | ----- | ------ | ------ |
| Read workspace content                     | Yes   | Yes   | Yes    | Yes    |
| Create/edit/delete issues, comment, upload | Yes   | Yes   | Yes    | No     |
| Manage projects/settings/members           | Yes   | Yes   | No     | No     |
| Invite/manage admins                       | Yes   | No    | No     | No     |
| Remove/demote owner                        | No    | No    | No     | No     |

Every mutation checks permissions on the server. Membership locks prevent revocation racing authorized writes. Owners cannot be removed or demoted; an explicit transfer workflow is a future extension. Invitations are email-bound, expire after seven days, and are consumed once. API errors distinguish 401, 403, 404, 409 and 422. Unsafe routes validate Origin to prevent CSRF, including authentication routes.

### State and realtime

TanStack Query owns all server data. Zustand owns only command menu visibility and theme. URL parameters own workspace, project, section, search, view and selected issue. Drafts stay in component state.

Optimistic board mutations cancel matching queries, snapshot pages, move the card, restore snapshots on failure, and invalidate on settlement. SQL version checks return 409 on stale edits. The durable event row is committed with the mutation and audit record; an advisory lock orders event allocation through commit. SSE polls every 1.5 seconds, checks session and membership each time, sends heartbeats, and closes after four minutes for a fresh connection. Reconnection invalidates workspace data. No process-local event bus is required, so multiple Node instances observe the same changes.

### Performance

Issue queries fetch 51 rows to return 50 plus a continuation cursor. Lists and each lane retain up to five pages, bounding the rendered issue set instead of rendering 10,000 rows. Member lookup is server searched and bounded; management, comments, notifications and audit feeds paginate. Queries join display data rather than issuing per-row requests. Database pooling is capped at ten connections per Node process. SQL statements time out after ten seconds. Dialog and command bundles load lazily. Authenticated responses use private/no-store caching.

SSE currently invalidates workspace queries broadly (events are coalesced for 100 ms). This is a correctness-first trade-off; large concurrent deployments should use resource-targeted invalidation and a dedicated PostgreSQL LISTEN/NOTIFY or broker fanout process. A 10,000-row dataset does not establish a production concurrency guarantee. Benchmark under your expected connections, data distribution and infrastructure.

## Tests

```sh
npm run typecheck
npm run lint
npm test
# With application running against a disposable development/test database:
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

Unit tests exercise permission boundaries, filter parsing, input validation, password verification and token generation. Integration tests exercise actual HTTP and PostgreSQL, including CSRF, tenant isolation, concurrent edits, audit atomicity, single-use invitations and logout revocation. Playwright exercises registration/login, workspace/project creation, invitations, issue assignment, dragging, viewer restrictions, realtime across independent browser contexts, comments/notifications, URL search, keyboard commands and optimistic rollback.

Integration tests are intentionally skipped by ordinary `npm test`; use the explicit integration command. Browser tests require a running server and use unique accounts. They leave their data in the test database for inspection. Never run them against production. Traces/screenshots are retained on failure.

## Security and deployment trade-offs

This is a working portfolio implementation, not a claim of independently audited production security.

- Invitation delivery is a private copyable link; configure an email provider for production. Email verification, password recovery, MFA and owner transfer are not implemented.
- Attachments are bounded to 5 MB and 20 files per issue, stored in PostgreSQL and downloaded with forced attachment disposition and `nosniff`. Add object storage, quarantine/virus scanning and workspace storage quotas for public deployments.
- Provision a least-privilege runtime database role. Migrations need a separate owner role. Tenancy is enforced by services/composite constraints, not PostgreSQL RLS.
- Add trusted-edge IP rate limiting, account abuse controls and observability. The built-in per-account limiter alone does not prevent distributed registration abuse.
- No HTML/Markdown execution in descriptions or comments; React renders text safely. TLS, CSP rollout and HSTS belong in the deployment configuration and require testing with Next.js script handling.
- Project/workspace selectors are capped at 200/100. Label catalog/renaming, custom workflows, issue ordering and offline editing are intentional omissions.
- Sessions have absolute rather than rolling expiry. Schedule cleanup for expired sessions/invites/rate-limit rows, and define event/audit retention and backups with restore drills.
- SSE favors portability over high fanout efficiency; benchmark before deploying many simultaneous connections. Attachments increase database backup size.

These trade-offs are concrete interview topics: transaction isolation, composite tenant constraints, optimistic concurrency, cache ownership, cursor pagination, and reliable event delivery.
