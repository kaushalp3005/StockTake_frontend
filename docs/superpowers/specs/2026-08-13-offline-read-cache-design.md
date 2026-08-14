# Offline Read Cache — Design

**Date:** 2026-08-13
**Status:** Awaiting review
**Scope:** `StockTake_frontend` only. No backend changes.

## Goal

When the network drops, managers reviewing stock entries keep seeing the data
they were working with instead of an error screen. Writes are refused while
offline rather than queued.

## Decisions taken before design

| Question | Decision |
|---|---|
| Offline capability | Read cache only. Writes are **blocked**, not queued. |
| Conflict policy | Server always wins. Cache is never authoritative. |
| Storage | IndexedDB. |
| Backend | Allowed, but **not needed** — see below. |
| App shell | Service worker included (approach B). |

Two of these need justifying because they overturn the original request.

**No write queue.** The original ask was to queue offline edits and replay them
on reconnect. Blocking writes instead removes the entire class of failure where
a replayed edit silently overwrites a colleague's count — for a stock take, a
wrong number that nobody notices is worse than a refused edit.

**No backend changes.** Idempotency keys and row versions only earn their place
when replaying queued writes. With no queue, nothing on the server needs to
change. The permission to modify the backend is deliberately left unused.

## Out of scope

- Offline writes, write queue, background sync, conflict resolution UI.
- Caching the Add Item categorial data (Add Item is a write; disabled offline).
- Any change to `Stocktake_backend`.

## Architecture

Five pieces. The first three deliver a working feature on their own; the
service worker is what makes it survive a page reload.

| Piece | File | Role |
|---|---|---|
| Cache store | `utils/offlineCache.ts` (new) | IndexedDB wrapper: `get`, `set`, `evict`, `clear` |
| Read-through | `utils/api.ts` (edit) | Allowlisted GETs write to cache; serve cache on transport failure |
| Online status | `hooks/useOnlineStatus.ts` (new) | `navigator.onLine` + `online`/`offline` events |
| Offline UI | `components/AppTopbar.tsx` (edit), pages | Global banner + per-page staleness line + write gating |
| App shell | `vite.config.ts` (edit) | `vite-plugin-pwa` precache so the app boots offline |

### Cache store

One IndexedDB database `stocktake-offline`, one object store `apiCache`,
keyed by the request path including its query string:

```
"/stocktake-entries/grouped?warehouse=W202&floorName=LOWER+BASEMENT&startDate=…"
```

Record shape:

```ts
{ key: string, data: unknown, cachedAt: number, lastReadAt: number }
```

Query params are already built through `URLSearchParams` in insertion order at
every call site, so the same logical request produces a byte-identical key. No
normalisation layer is needed; if a call site is ever reordered the worst case
is a cache miss, not a wrong hit.

Hand-rolled wrapper, roughly 60 lines, no new dependency. `idb` is not worth a
dependency for one store with four operations.

### Read-through in `api.ts`

Only these three endpoints are cached — they back the review, floors, and item
pages:

- `/stocktake-entries/available-dates`
- `/stocktake-entries` (`getEntries`, any query)
- `/stocktake-entries/grouped` (`getGroupedEntries`)

Strategy is **network-first, cache-fallback**, which is the direct expression
of "server wins":

1. Attempt the request as today.
2. On success — write `{data, cachedAt: now}` to the cache, return fresh data.
3. On failure — **only if `APIError.status === 0`** (see below), read the
   cache. Hit → return the cached data. Miss → rethrow.

The status-0 check is the load-bearing detail. `apiFetch` already wraps a
`fetch()` rejection as `new APIError(0, …)` at `utils/api.ts:64`, while every
HTTP response error carries its real status at `:103`. So a dead network is
distinguishable from a 500 without touching the fetch logic.

**A cached read must never mask a server error.** A 500 from a broken query,
or a 401 from an expired token, has to reach the user. Serving stale entries in
those cases would hide an outage behind data that looks current.

Staleness is surfaced by attaching two fields to the returned object:

```ts
{ ...data, __fromCache: true, __cachedAt: 1755100000000 }
```

Every current call site reads named properties (`response?.dates`,
`response.entries`, `data.groups`), so extra fields are inert. Pages that want
the staleness line read `__cachedAt`; pages that don't are unaffected.

### Online status and write gating

`useOnlineStatus()` returns `navigator.onLine` and subscribes to the `online` /
`offline` events. Note the known limitation: `navigator.onLine` reports link
state, not reachability — a connected-but-dead network reads as online. The
cache fallback covers that case regardless, since it triggers on the actual
request failing; write gating is the only thing that trusts the flag, and there
the failure mode is an attempted write that errors normally.

Controls disabled while offline, all in `pages/ManagerReview.tsx`:

| Control | Handler |
|---|---|
| Save Floor | `handleSaveFloorReview` → `floorReviewAPI.saveFloorReview` |
| Add Item | `stocktakeEntriesAPI.submitEntries` |
| Long-press quantity edit | `stocktakeEntriesAPI.updateEntry` |
| Delete entry | `stocktakeEntriesAPI.deleteEntry` |
| Verify tick | `stocktakeEntriesAPI.updateEntry` |
| Reassign | `stocktakeEntriesAPI.updateEntry` |
| Change item | `stocktakeEntriesAPI.updateEntry` |
| Download / Export | `stocktakeEntriesAPI.exportEntries` |

Disabled state carries a title of "Offline — reconnect to make changes" rather
than silently doing nothing.

### Eviction and storage budget

Unbounded growth is a real risk: one record per warehouse × floor × date range
visited. Eviction runs on write:

- **Age** — records with `cachedAt` older than 7 days are deleted.
- **Count** — beyond 50 records, the least recently read are deleted first.

`lastReadAt` is updated on every cache hit so LRU reflects use, not just write
order.

### Security: clearing on logout

Cached stock data persists in IndexedDB after logout. On a shared warehouse
machine the next person to sign in could otherwise read the previous user's
cached counts, and a cached read could even serve data their role shouldn't
see. `clear()` must be called wherever the session is torn down.

There are **two** such sites today, and they disagree:

| Site | Clears |
|---|---|
| `pages/Dashboard.tsx:336` | `token` and `user` |
| `pages/Index.tsx:41` | `token` only — leaves `user` behind |

Adding a third thing to forget at two inconsistent call sites is how this bug
gets shipped. So implementation extracts a single `logout()` helper that clears
`token`, `user`, and the offline cache, and both sites call it. That also fixes
the pre-existing `user`-leak at `Index.tsx:41` as a side effect — a small,
in-scope repair of code the change touches, not unrelated refactoring.

This applies to the service worker's precache too: it holds only application
assets, never API responses, so it needs no clearing — which is one reason for
the next decision.

### Service worker

`vite-plugin-pwa` with:

- **`registerType: 'prompt'`** — never auto-update. Swapping the JS bundle
  under a manager mid-review is unacceptable; the user gets a "New version
  available — reload" prompt and chooses when.
- **Precache**: built JS, CSS, HTML, icons.
- **`navigateFallback: 'index.html'`** so client-side routes (`/review/floor`)
  resolve offline.
- **`/api/*` is `NetworkOnly`** — explicitly *not* cached by the service
  worker. The IndexedDB layer is the single source of truth for API data;
  letting the SW cache responses too would create two caches with different
  lifetimes and eviction rules, and a bug where one serves data the other has
  already evicted.

Documented risk: a stale service worker serving old JS against a changed API.
The prompt-to-update policy bounds it — the user is told a new version exists —
but a manager who declines indefinitely runs old code. Acceptable given the API
is additive today; worth revisiting if a breaking API change ships.

## Failure modes considered

| Scenario | Behaviour |
|---|---|
| Network drops mid-session, data cached | Cached data renders, staleness line shows its age, writes disabled |
| Network drops, nothing cached | Existing error path, unchanged |
| Server returns 500 | Error surfaces normally — cache is **not** consulted |
| Token expires while offline | On reconnect the 401 surfaces normally; existing logout flow runs; cache cleared on logout |
| Reload while offline (with SW) | App shell boots from precache, data from IndexedDB |
| Reload while offline (without SW) | Browser offline page — this is the gap approach B closes |
| IndexedDB unavailable (private mode / quota) | Cache layer degrades to no-op; app behaves exactly as it does today |

That last row matters: every cache operation is wrapped so a storage failure
can never break a page that works fine online.

## Verification

The frontend has no test runner — `package.json` has no `test` script, and
`lib/utils.spec.ts` imports `vitest`, which is not installed. So verification
is manual unless we add vitest as a separate decision:

1. DevTools → Network → Offline, with data already loaded → pages still render,
   staleness line appears, write controls disabled.
2. Offline + hard reload → app boots (service worker), data renders.
3. Server stopped but network up → error surfaces, cache **not** served.
4. Log out → IndexedDB `stocktake-offline` is empty.
5. `npx tsc --noEmit` shows no new errors beyond the two pre-existing ones
   (`components/ui/select.tsx:126`, `lib/utils.spec.ts:1`), and `npm run build`
   passes.

I'd recommend adding vitest so the cache layer's eviction and the status-0
branch get real unit tests — they're pure logic and the most bug-prone parts.
Flagging rather than assuming: it's a dependency decision.

## Open questions for review

1. **Staleness display** — is a per-page "Showing data from 18:42" line enough,
   or do you want it per card/floor?
2. **Vitest** — add it for the cache layer, or stay manual-only?
3. **Which pages get the staleness line** — Manager Review's three routes only,
   or also Dashboard / All Entries Summary / Resultsheet, which share the same
   cached `available-dates` and `getEntries` calls?
