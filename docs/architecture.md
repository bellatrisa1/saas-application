# Architecture decision record

## System

A modular monolith runs Next.js App Router on the Node runtime and PostgreSQL 17. Route handlers validate transport input with Zod, authenticate opaque cookie sessions, and call domain services. Services enforce workspace roles and scope every resource lookup to its workspace. SQL transactions atomically commit mutations, audit entries, notifications and durable realtime events. No database credentials or password hashes cross the server boundary.

## Relational model

Users have many sessions and workspace memberships. Memberships join users to workspaces with Owner/Admin/Member/Viewer roles. Workspaces contain projects, invitations and issues. Project memberships join workspace members to projects. Issues belong to one workspace and project, reference reporter and optional assignee, and have comments, attachments, watchers and bounded text-array labels. Audit records retain actor and before/after payloads. Notifications belong to individual users. Events form a durable per-workspace change feed.

UUID primary keys avoid guessable identities; authorization never relies on unguessability. Composite foreign keys prevent cross-workspace project and assignee references. Membership uniqueness is (workspace_id,user_id); issue numbers are allocated atomically per workspace. Emails are normalized and unique. Sessions and invitations store SHA-256 token digests, never raw bearer tokens. CHECK constraints restrict roles, statuses and priorities. Deleting issues cascades dependent content; audit entries survive issue deletion. Owner removal/demotion is disallowed; transfer is a separate future workflow.

Indexes cover session token lookup and expiration, workspace memberships, workspace/status/created_at/id issue pagination, project issues, assignees, due dates, comments by issue, unread notifications, activity and event cursors. PostgreSQL full text search indexes title/description. User-facing pagination is bounded; no endpoint returns all workspace issues or members.

## Authentication and authorization

Passwords use Node scrypt with random salts and constant-time comparison. Random 256-bit session tokens live in HttpOnly, SameSite=Lax cookies, Secure in production, with absolute seven-day expiration. Logout revokes the database session. Protected server pages redirect to login; APIs return typed 401/403/404/409/422 errors. Unsafe requests require exact same-origin Origin validation, including login. Database-backed rate limiting protects login/register. Workspace roles: Viewer reads; Member edits issues/comments; Admin manages projects/invitations/members/settings; Owner additionally controls admins. Resource authorization is enforced within transactions with membership locks so removal cannot race a mutation. Invitations are expiring, email-bound, single-use tokens; users must authenticate before acceptance.

## Rendering and state

Server components handle session gates and initial shell rendering. Client islands implement query-backed views, drag and drop, dialogs and keyboard controls. TanStack Query owns issues, projects, members, comments, notifications and activity. Optimistic changes cancel requests, snapshot cache, restore on failure and revalidate on settlement. Zustand only owns palette/theme UI preferences. URL query parameters own workspace/project/view/search and issue selection; browser history remains useful. Form drafts stay local.

## Realtime

SSE reads committed PostgreSQL event rows using a monotonic cursor. Each poll rechecks session/membership. Reconnect invalidates cached workspace data; event payloads only announce changed resource types, and clients refetch authorized data. A bounded stream lifetime and heartbeats support proxies. Persistent events work across app instances without process-local pubsub. Polling per connection is a deliberate portfolio-scale trade-off; a production deployment with many simultaneous users should use a shared LISTEN/NOTIFY fanout worker or managed broker, retaining the durable log for recovery.

## Performance and operations

Keyset pagination bounds issue/activity/member queries and stable sort avoids offset drift. Render only a bounded page, not 10,000 rows. Each board lane is independently paginated to avoid starvation. Batch relationship reads avoid N+1. Tenant data is private/no-store; React Query deduplicates browser requests. SSE invalidates relevant keys. Mutation version checks prevent silent lost updates. Connection pooling is mandatory; cap request body and upload size. Uploads are private, authenticated downloads stored as bounded PostgreSQL bytea values (5 MB each, 20 per issue); migrate to quarantined object storage and malware scanning for public production uploads. Production needs HTTPS, backups, migrations, secret management, structured logs, monitoring and periodic expired-session/event cleanup. Load testing is required before promising concurrency targets.

## Folder boundaries

`src/app`: routes, layouts and HTTP adapters. `src/server`: SQL, auth and domain services (server-only). `src/lib`: pure schemas, permissions, search parser and client HTTP contract. `src/components`: focused interactive UI with SCSS modules. `tests`: business-unit and database integration tests. `e2e`: Playwright user journeys. `scripts`: migrations and repeatable seed. `docs`: design and operating decisions. No generic repository or dependency-injection framework; explicit SQL makes transaction/tenant boundaries reviewable.

## Validation sequence

Foundation and pure logic; authentication; workspace/project services; issue/collaboration/realtime services; client UI; end-to-end verification. Run typecheck, lint and available tests after each subsystem, fix failures before continuing. Integration tests use a dedicated database; browser tests run against real HTTP and PostgreSQL. Never substitute mocked persistence for claims of database correctness.

## Implemented trade-offs

Labels are denormalized text arrays with a GIN index; label renaming and a workspace label catalog would justify normalization. Project membership records team ownership, not project privacy: all workspace members can read all projects. Lists retain at most five pages (250 issues per view/lane), bounding DOM cost without a virtualization dependency; earlier pages can be restored by resetting the view. Projects and workspace switchers currently cap at 200 and 100 respectively. SSE is near realtime (1.5-second polling), and reconnect uses full invalidation instead of replay. Comment and activity feeds fetch 50 at a time. Invitation delivery is a copyable link; email delivery, email verification, password reset, MFA and owner transfer remain deployment/product follow-ups.
