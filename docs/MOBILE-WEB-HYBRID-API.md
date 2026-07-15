# Mobile and Web Hybrid API Decision

Date: 2026-07-15

## Decision

DMIS uses a hybrid API:

- REST remains authoritative for commands, uploads, callbacks, authentication, and other
  workflow transitions.
- GraphQL is additive and is used for permission-scoped composite reads plus native foreground
  invalidation where a typed mobile contract avoids several REST round trips or bespoke streaming.
- Both transports call the same application services and database. GraphQL must not duplicate
  authorization, jurisdiction rules, or domain writes in resolver-specific SQL.

Starting the entire platform again as GraphQL would not improve command safety, file transfer,
offline conflict handling, or operational integrations enough to justify replacing the mature REST
surface. The hybrid keeps those stable contracts while giving bandwidth-constrained clients typed,
screen-shaped reads.

### Best-fit boundary

| Need | Transport | Reason |
|---|---|---|
| Composite, client-shaped, permission-scoped screen read | GraphQL query | Avoids several REST round trips while preserving one bounded schema and shared service rules |
| Create/update/approve/dispatch/finance/stock command | REST | Clear HTTP/idempotency semantics, stable workflow endpoints, audit behavior and explicit conflicts |
| File or media transfer | REST multipart or a future resumable-upload contract | Binary streaming, retry, quarantine and size controls do not become safer inside GraphQL |
| Offline/reconnect recovery | REST cursor pages | Deterministic paging, retention expiry and transactional local checkpointing |
| Foreground web invalidation | Authenticated REST/SSE | One-way, content-free wake-up works with the existing bearer-authenticated Angular client |
| Foreground native invalidation | GraphQL subscription (`graphql-transport-ws`) | Native clients reuse the typed transport while foregrounded; the message is still only a cursor wake-up |
| Background native wake-up | APNs/FCM | Mobile operating systems suspend streams; push wakes the client, which then runs REST cursor recovery |
| Webhook/provider callback | REST | Provider-native signatures, response codes and retry contracts |

GraphQL is not the source of truth and REST is not automatically preferred for every read. The
choice is made per interaction; both paths reuse the same authorization, jurisdiction and
application-service layer.

## Implemented first slice

`POST /api/graphql` exposes the read-only `mobileHome` query. It combines:

- the authenticated viewer and granted authorities;
- the existing jurisdiction-scoped incident page; and
- the existing current-user notification cursor feed.

There are no GraphQL mutations or direct repository calls in this slice. The only subscription is
the content-free `mobileSync(afterSequence)` foreground wake-up described below; it is not a second
source of domain data.

The endpoint is bearer-authenticated and the resolver plus service both require
`incidents.view`. The mobile service also requires a positive numeric JWT subject before
calling notification code so a user request cannot enter the scheduled-job system-actor fallback.

## Implemented command-safety slice

`POST /api/v1/mobile/incidents` is the first typed mobile REST command. It accepts file-free JSON,
requires `incidents.create`, passes through the same jurisdiction and workflow service as the web
incident form, and always creates a `Reported` / `draft` incident with source `Mobile App Report`.
The client cannot use this adapter to self-approve, close an incident, or spoof another reporting
channel. `reported_at`, and optional `occurred_at` / `ended_at`, use RFC 3339 timestamps with an
explicit `Z` or numeric offset so an offline queue is unambiguous across device time zones.

Every mobile incident command requires `Idempotency-Key`. The accepted value is 16–128 ASCII
characters from letters, digits, dot, colon, underscore, and hyphen; both the IETF draft's quoted
Structured Field form and the commonly deployed unquoted form are accepted. The key is scoped to:

- the authenticated numeric user;
- the server-defined operation (`incident.create`); and
- a SHA-256 fingerprint of the logical request.

The IETF Idempotency-Key document is an expired Internet-Draft (draft-07), not a published RFC. The
server behavior documented here is therefore the product contract; native clients must not infer
additional standard semantics from an archived draft.

The idempotency claim, incident insert, workflow-history insert, and stored response commit in the
same PostgreSQL transaction. A lost-response retry with the same key and payload receives the first
response and resource id; the same key with different content is rejected. The default receipt
window is 90 days and must be configured to be at least as long as the longest supported client
offline queue. Cleanup removes a bounded, lock-skipping batch each hour so multi-node cleanup cannot
turn into one unbounded delete transaction.

Receipts retain only the request digest, small JSON response, actor/operation/key, timestamps, and
replay counters—not the submitted incident fields or attachment bytes. The existing web multipart
incident form now sends a generated key as well; its fingerprint includes canonical form fields,
list order, original filename, media type, size, and every uploaded byte. The legacy web header is
temporarily optional for backward compatibility. The typed mobile JSON route intentionally accepts
no attachments; mobile evidence upload needs a separately designed retry-safe upload contract.
The existing authenticated web path now uses server-generated filenames, byte signatures, per-file
and combined size limits, and transaction rollback cleanup. Those controls reject obvious active
content and fake extensions, but they are not antivirus/CDR or a media-sandbox service.

## Implemented notification catch-up slice

`GET /api/v1/notifications/changes?after_sequence=<cursor>&limit=<1..100>` returns newly inserted
notifications for the authenticated numeric user in stable per-user sequence order. The response
includes `after_sequence`, `next_after_sequence`, `latest_sequence`, `has_more`, and `server_time`.
A client must first commit the page to its local source of truth and only then persist
`next_after_sequence`; when `has_more` is
true it immediately requests the next page.

V212 assigns the sequence while holding a per-user head-row lock until transaction commit. This is
deliberate: PostgreSQL sequence/identity ids are allocated before commit, so an ordinary id cursor can
skip a lower-id transaction that commits late. Foreign users' rows are filtered before paging. A
negative cursor is rejected, a cursor ahead of that user's committed server head returns `409`,
and the page size is clamped to 100. When deleted notices leave sequence gaps, an exhausted page
advances to the captured head rather than polling the same empty gap forever. Real PostgreSQL tests
cover cross-user gaps, multi-page continuation, deleted gaps, restored-server cursors, and a delayed
first transaction racing a second insert.

This endpoint is a notification-delivery catch-up stream, not general state replication. It does not
emit mark-read/unread changes, dismissals, incident updates, deletes, or tombstones. Those need a
permission-scoped domain event/delta contract before a native client can claim complete offline sync.

## Implemented incident convergence and foreground wake-up slice

The `mobileHome` GraphQL snapshot returns `syncCursor` and `syncScopeKey` before reading the scoped
incident page. The entire composite read runs at PostgreSQL `REPEATABLE READ`, so an incident that
commits after that cursor is not silently mixed into the snapshot. The client then catches up through:

`GET /api/v1/sync/changes?after_sequence=<cursor>&scope_key=<snapshot-key>&limit=<1..100>`

V211 writes an incident change row from a database trigger in the same transaction as every insert,
update, or delete, including writers outside the new mobile adapter. Cursor allocation locks one
global head row until commit; this intentionally serializes incident mutations so a later cursor
cannot commit before an earlier cursor and be skipped. A jurisdiction move emits an old-scope
`deleted` tombstone followed by a new-scope `updated` event. Change rows carry ids and metadata only,
never the incident payload: clients delete a tombstoned local row or refetch an authorized current row.

The scope key is a SHA-256 digest of the numeric actor, current jurisdiction, and sorted JWT
authorities. A missing key is rejected; a different actor, changed jurisdiction/permissions, or a
cursor ahead of the server returns `409` and requires the client to discard its incident read cache
and take a new GraphQL snapshot. Events are retained for 90 days by default. Cleanup is bounded and
lock-skipping; a cursor older than the committed prune watermark returns `410`, never an incomplete
suffix presented as success.

The client applies each page and persists `next_after_sequence` in one local database transaction,
then immediately requests another page while `has_more=true`. Foreign-jurisdiction events are
filtered before delivery, but a drained page advances to the global high-water mark so a scoped
client cannot become stuck behind foreign changes. Real PostgreSQL regressions prove that rollback
does not advance the committed cursor or leave an event, and that foreign gaps neither leak ids nor
prevent catch-up.

Authorized web sessions also use:

`GET /api/v1/sync/stream?after_sequence=<last-wakeup>`

This REST Server-Sent Events path sends only a committed global cursor as a best-effort wake-up.
The Angular incident registry then reloads through the existing scoped REST
read; reconnect correctness comes from the durable delta endpoint, not the stream. Each node polls
the shared committed head only while it has connected viewers, sends 15-second heartbeats, forces a
10-minute reconnect to re-check the bearer, caps connections per node and per actor, and rejects a
cursor ahead of a restored server. If a database restore moves the head backwards, the relay closes
old-lineage streams so reconnect receives 409 and resets safely instead of suppressing new wake-ups
behind the former high cursor. Nginx and Caddy disable buffering/compression for this path.

The Angular client uses streaming `fetch`, not the browser `EventSource` constructor, because the
current application must attach an `Authorization: Bearer` header. Cursors remain decimal strings
and comparisons use `BigInt`, avoiding JavaScript safe-integer truncation. Malformed or duplicate
frames never advance the local wake-up cursor.

Foreground native GraphQL clients may instead connect to `wss://<host>/api/graphql` using the
`graphql-transport-ws` protocol and subscribe to:

```graphql
subscription MobileSync($after: ID!) {
  mobileSync(afterSequence: $after) {
    sequence
    occurredAt
  }
}
```

It uses the same bounded relay, connection quotas, committed cursor, restore detection, and
10-minute maximum subscription lifetime as SSE. The WebSocket upgrade must carry a valid bearer token;
credentials are deliberately not accepted through `connection_init`. Every operation
rechecks JWT expiry and the logout denylist, enforces a per-actor operation budget, and refuses a
socket older than the 10-minute authentication window until a fresh upgrade. An active subscription
also completes at JWT expiry and polls the logout denylist every 5 seconds by default, so revoked
sessions do not wait for a new operation. The denylist is currently node-local; a shared store is a
mandatory multi-node release gate. The servlet container bounds text frames to 64 KiB and
unexpected binary frames to 1 KiB. Subscription unit tests do not replace a real TLS/proxy/native
`graphql-transport-ws` handshake test, which remains a release gate.

The required native foreground/offline state machine is:

1. render the scoped local database immediately;
2. when no valid snapshot exists, run `mobileHome`, atomically replace the scoped incident cache,
   and save `syncCursor` plus `syncScopeKey`;
3. drain `/v1/sync/changes` until `has_more=false`, committing row effects and
   `next_after_sequence` in the same local transaction;
4. open `mobileSync` from the persisted cursor and drain REST pages after every wake-up;
5. after disconnect, resume, timeout, or push wake, reconnect with backoff and drain before
   subscribing again;
6. on 409 or 410, discard that scoped cache and bootstrap a fresh GraphQL snapshot; and
7. never persist a wake-up cursor as the durable checkpoint before its REST delta pages commit.

When the operating system suspends the app, APNs/FCM must carry only an opaque wake-up/reference.
Background work then runs the same cursor drain subject to OS scheduling limits. Neither a WebSocket
frame nor a push payload is the data source or proof of delivery.

These first live channels are incident-only. They are not complete mobile background push, a general event bus, or
a promise that every module refreshes instantly. The global cursor also reveals aggregate incident
activity timing and approximate volume to users already authorized for incident reads, even though it
does not expose row payloads. International launch therefore requires an explicit security decision:
accept that bounded metadata disclosure or replace the signal with jurisdiction-scoped opaque wake-ups
and re-run the proxy/load/reconnect suite. Do not describe the present stream as metadata-free.

## Resource and disclosure controls

- Maximum query depth: 8
- Maximum query complexity: 100, with a fixed cost for each `mobileHome` selection
- Request timeout: 20 seconds (the composing transaction is limited to 15 seconds)
- Request body: 64 KiB maximum, including chunked requests
- Per-instance rate limit: 300 GraphQL requests per client address per 60 seconds
- WebSocket text/binary frame buffers: 64 KiB / 1 KiB; 300 operations per authenticated actor per
  60 seconds, with JWT expiry/revocation and a 10-minute maximum authentication window rechecked
- The local rate-limit key table rejects previously unseen addresses at 50,000 active windows
  rather than allowing an address spray to grow heap without a bound
- GraphiQL and schema printing: disabled
- Introspection: disabled by default and opt-in only for controlled code generation
- Expected security errors: stable generic `UNAUTHORIZED` or `FORBIDDEN` classifications
- Unexpected failures: not converted into empty or successful-looking data
- Shared SSE/GraphQL-subscription relay defaults: 5,000 connections per node, 5 per actor,
  10-minute forced reconnect, 15-second SSE heartbeat, and 500 ms committed-head polling only on
  nodes with connected viewers

Production with more than one application instance must apply the same rate limit at a trusted,
shared ingress. The in-process limiter is defense in depth, not a distributed quota.

The production SPA edge also enforces a Content Security Policy. Executable scripts are limited to
the same origin; the only remote image origins are the governed map/earth-observation providers;
the only remote frame origins are the existing YouTube privacy embed and SAT24 view. Angular's
component styling currently requires `style-src 'unsafe-inline'`, but scripts do not receive that
exception.

The backend packages OpenAPI JSON for controlled contract generation but does not package Swagger
UI browser assets. The 2026-07-15 dependency gate upgraded newly disclosed vulnerable transitive
lines (Tomcat, pgJDBC, Jackson, Log4j, Commons Lang, and PDFBox), then rebuilt and retested the whole
application. OWASP Dependency-Check reported zero findings across the 81 release dependencies and
`npm audit` reported zero findings for the web dependency tree. These scans must be repeated for
every release; they do not replace an SBOM/container scan of the final immutable images.

## Session boundary

The existing web client persists its 30-minute access token in `localStorage`. The enforced CSP and
removal of known HTML-injection sinks reduce exposure, but they do not make browser storage immune
to every future same-origin script flaw or compromised vendored asset. Before international public
launch, security sign-off must explicitly choose and prove the web session design (for example, a
short-lived in-memory access token with a rotated `HttpOnly`, `Secure`, `SameSite` refresh/session
cookie plus CSRF controls). Do not silently switch the current bearer contract to cookies while
CSRF is disabled.

A native mobile client must keep bearer/refresh credentials in the operating system keychain or
hardware-backed secure storage, never ordinary preferences, SQLite, logs, crash reports, or source
control. Web and native clients may share application services and API contracts without sharing an
unsafe credential-storage mechanism.

## Implemented device-registration slice

`PUT /api/v1/mobile/devices/current` and `DELETE /api/v1/mobile/devices/current` register and revoke
the authenticated caller's installation. The body accepts:

- `installation_id` (required, durable client-generated id);
- `platform` (`android` | `ios` | `web`);
- optional `app_version`;
- optional `push_provider` (`none` | `fcm` | `apns`, default `none`); and
- optional `push_token` (required when the provider is not `none`).

Rows live in `platform.mobile_device_installations` (V213). Ownership is always the JWT numeric
subject — clients cannot register a device for another user. Responses never echo the full push
token (`push_token_present` only). Revocation clears the token and marks `revoked_at`. A live push
token may belong to only one non-revoked installation so a reinstall cannot silently fan out to two
accounts. Each user is capped at 20 live installations; registration locks that user's row while it
counts and upserts, preventing concurrent requests from racing past the cap. Both request validation
and the V213 database constraint require a 16–4096 character token for FCM/APNs.

This is addressing metadata for a future FCM/APNs wake-up sender. It does **not** send push
messages, does not replace the REST cursor, and does not store domain incident content. Provider
tokens remain sensitive credentials: before a sender is enabled, production must prove strict DB
access, encryption/backup handling, log and telemetry redaction, provider revocation cleanup, and
abuse-rate limits on registration.

## What mobile-to-web visibility means

A successful mobile REST incident command commits to the same database used by the web application.
The committed V211 change advances both the web SSE and native GraphQL wake-up. The Angular incident
registry reloads, while a foreground native client drains its scoped REST delta, so authorized clients
can converge without waiting for their former polling interval. If either stream is interrupted, the
snapshot cursor plus scoped REST delta recovers without data loss.

This guarantee currently covers the incident slice only. The safe next stage is:

1. extend the implemented incident-create pattern to each deliberately supported mobile command;
2. add optimistic versions and explicit conflict responses for updates;
3. extend the V211-style permission-scoped delta/tombstone contract deliberately to other domains,
   without turning the incident head into a global bottleneck;
4. add a transactional outbox/broker for external delivery, replay, retry and dead-letter handling;
5. wire a real FCM/APNs sender against `platform.mobile_device_installations` (content-free wake-ups
   only) and add background/resume reconciliation; and
6. make every client reconcile from its server cursor after every reconnect instead of trusting push as
   the data source.

Push is a wake-up signal. The database plus cursor sync remain the source of truth.

## Go-live boundary

The incident-create command has database-backed sequential, concurrent-retry, payload-mismatch,
missing-key, unauthorized-role, timezone, and active-content upload regressions. The incident cursor
also has real PostgreSQL paging, retention, scope-change, jurisdiction-move tombstone, rollback,
foreign-gap and delayed-transaction ordering tests; the notification cursor covers restore and
deleted-gap recovery; the shared SSE/GraphQL relay has cursor/capacity/lifecycle tests; WebSocket
operations cover rate, expiry, revocation, and frame-bound configuration; and the browser suite
covers 64-bit cursor precision and malformed frames. This is still not evidence
that a native mobile application, general offline mutation queue, mobile push delivery, optimistic
conflict resolution, or cross-domain live refresh is complete. The global incident-head write lock and
SSE/GraphQL WebSocket connection defaults need staging load/soak evidence at the intended district/region/national
concurrency before production sizing. Four V213 device database tests exist but are part of the
pending Docker-backed final gate; multi-persona authorization, proxy reconnect tests (including a real
WebSocket upgrade through the deployed edge), and live provider validation
remain release gates. Production acceptance of incident media also
needs a malware scanning/quarantine decision and proof; signature checks alone are not a complete
hostile-file control.

## Research basis

- Spring GraphQL transport documentation: <https://docs.spring.io/spring-graphql/reference/transports.html>
- Spring Boot GraphQL WebSocket transport configuration:
  <https://docs.spring.io/spring-boot/reference/web/spring-graphql.html>
- Spring WebSocket server buffer configuration:
  <https://docs.spring.io/spring-framework/reference/web/websocket/server.html>
- Spring MVC asynchronous requests and `SseEmitter`:
  <https://docs.spring.io/spring-framework/reference/6.2/web/webmvc/mvc-ann-async.html>
- HTML `EventSource` standard: <https://html.spec.whatwg.org/multipage/server-sent-events.html>
- Android offline-first data guidance:
  <https://developer.android.com/topic/architecture/data-layer/offline-first>
- Android FCM receive behavior:
  <https://firebase.google.com/docs/cloud-messaging/android/receive-messages>
- Apple background notification behavior:
  <https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app>
- IETF Idempotency-Key Internet-Draft status and draft text:
  <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>
- OWASP File Upload Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html>
- Caddy reverse-proxy streaming behavior:
  <https://caddyserver.com/docs/caddyfile/directives/reverse_proxy>
