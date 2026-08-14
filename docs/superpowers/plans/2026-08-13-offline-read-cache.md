# Offline Read Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the network drops, Manager Review keeps rendering the stock data it last loaded, and refuses writes instead of queueing them.

**Architecture:** A network-first, cache-fallback layer inside `utils/api.ts`. Three allowlisted GET endpoints write every successful response into IndexedDB; when a request fails at the *transport* level (`APIError.status === 0`) the cached copy is returned tagged with its age. Non-GET requests are refused outright while `navigator.onLine` is false, which is the single enforcement point for "no offline writes". A `vite-plugin-pwa` service worker precaches the app shell so the whole thing survives a reload.

**Tech Stack:** React 18, TypeScript, Vite 7, IndexedDB (no wrapper library), Vitest + jsdom + fake-indexeddb, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-08-13-offline-read-cache-design.md`

## Global Constraints

- **Frontend only.** No file under `Stocktake_backend/` may be modified.
- **Cache is never authoritative.** Network first, always. Cached data is returned only after a transport failure.
- **A cached read must never mask a server error.** Only `APIError.status === 0` triggers the fallback. Any real HTTP status (401, 404, 500…) propagates unchanged.
- **Cacheable endpoints are exactly three:** `/stocktake-entries/available-dates`, `/stocktake-entries`, `/stocktake-entries/grouped`. Matched on the exact path before `?`, never by prefix — `/stocktake-entries/submit` and `/stocktake-entries/<id>` must not match.
- **Every cache operation is failure-tolerant.** If IndexedDB is unavailable, each function no-ops and the app behaves exactly as it does today.
- **The service worker must not cache `/api/*`.** IndexedDB is the single source of truth for API data.
- **Service worker `registerType` is `"prompt"`.** Never auto-update.
- Existing type errors in `components/ui/select.tsx:126` are pre-existing and out of scope. `lib/utils.spec.ts:1` resolves once Task 1 installs vitest.
- Tests import from `vitest` explicitly (`import { describe, it, expect } from "vitest"`). Do not enable `globals`.

---

### Task 1: Test infrastructure

Vitest is not installed, yet `lib/utils.spec.ts` already imports it — one of the two standing `tsc` errors. Installing it both unblocks TDD for Tasks 2–4 and clears that error.

**Files:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Modify: `package.json` (scripts + devDependencies)

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` runs `vitest run`; `fake-indexeddb` is auto-installed into the global scope for every test, so `indexedDB` is defined in Node.

- [ ] **Step 1: Install the dev dependencies**

```bash
npm install -D vitest@^3 jsdom@^25 fake-indexeddb@^6
```

- [ ] **Step 2: Create `vitest.config.ts`**

Separate from `vite.config.ts` so the app build never loads test config. The `@` alias must be repeated here — Vitest does not inherit it from `vite.config.ts` when a separate config file is used.

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.spec.ts", "**/*.spec.tsx"],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
// Gives Node a working IndexedDB implementation so the offline cache can be
// tested without a browser.
import "fake-indexeddb/auto";
```

- [ ] **Step 4: Add the test scripts to `package.json`**

In the `"scripts"` block, after `"dev": "vite",` add:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 5: Run the existing test suite to verify the harness works**

Run: `npm test`
Expected: PASS — 5 tests in `lib/utils.spec.ts` ("cn function"). This file was previously unrunnable.

- [ ] **Step 6: Verify the pre-existing type error is gone**

Run: `npx tsc --noEmit`
Expected: exactly one error remains, `components/ui/select.tsx(126,9)`. The `lib/utils.spec.ts(1,38)` "Cannot find module 'vitest'" error must no longer appear.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json package-lock.json
git commit -m "test: add vitest harness with jsdom and fake-indexeddb"
```

---

### Task 2: IndexedDB cache store

**Files:**
- Create: `utils/offlineCache.ts`
- Test: `utils/offlineCache.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `cacheGet(key: string): Promise<CacheRecord | null>`
  - `cacheSet(key: string, data: unknown): Promise<void>`
  - `cacheClear(): Promise<void>`
  - `interface CacheRecord { key: string; data: unknown; cachedAt: number; lastReadAt: number }`
  - `MAX_RECORDS = 50`, `MAX_AGE_MS = 604800000`

- [ ] **Step 1: Write the failing tests**

Create `utils/offlineCache.spec.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { cacheGet, cacheSet, cacheClear, MAX_RECORDS, MAX_AGE_MS } from "./offlineCache";

describe("offlineCache", () => {
  beforeEach(async () => {
    await cacheClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for a key that was never written", async () => {
    expect(await cacheGet("/missing")).toBeNull();
  });

  it("round-trips a stored payload", async () => {
    await cacheSet("/stocktake-entries?warehouse=W202", { entries: [{ id: "1" }] });
    const record = await cacheGet("/stocktake-entries?warehouse=W202");
    expect(record).not.toBeNull();
    expect(record!.data).toEqual({ entries: [{ id: "1" }] });
    expect(typeof record!.cachedAt).toBe("number");
  });

  it("treats two different query strings as different keys", async () => {
    await cacheSet("/stocktake-entries?warehouse=W202", { entries: [1] });
    await cacheSet("/stocktake-entries?warehouse=A185", { entries: [2] });
    expect((await cacheGet("/stocktake-entries?warehouse=W202"))!.data).toEqual({ entries: [1] });
    expect((await cacheGet("/stocktake-entries?warehouse=A185"))!.data).toEqual({ entries: [2] });
  });

  it("discards a record older than MAX_AGE_MS", async () => {
    await cacheSet("/old", { a: 1 });
    const eightDaysLater = Date.now() + MAX_AGE_MS + 1000;
    vi.spyOn(Date, "now").mockReturnValue(eightDaysLater);
    expect(await cacheGet("/old")).toBeNull();
  });

  it("keeps at most MAX_RECORDS entries", async () => {
    for (let i = 0; i < MAX_RECORDS + 10; i++) {
      await cacheSet(`/key-${i}`, { i });
    }
    let surviving = 0;
    for (let i = 0; i < MAX_RECORDS + 10; i++) {
      if (await cacheGet(`/key-${i}`)) surviving++;
    }
    expect(surviving).toBeLessThanOrEqual(MAX_RECORDS);
  });

  it("spares a recently read record when evicting", async () => {
    for (let i = 0; i < MAX_RECORDS; i++) {
      await cacheSet(`/k-${i}`, { i });
    }
    // Touch the oldest write so it is no longer the LRU victim, then overflow.
    // Asserts the LRU *property* rather than naming a specific casualty: 50
    // sequential writes can share a millisecond, so which record has the lowest
    // lastReadAt is not deterministic — but the one just read must survive.
    await cacheGet("/k-0");
    await cacheSet("/overflow", { x: 1 });
    expect(await cacheGet("/k-0")).not.toBeNull();
    expect(await cacheGet("/overflow")).not.toBeNull();
  });

  it("clears everything", async () => {
    await cacheSet("/a", { a: 1 });
    await cacheClear();
    expect(await cacheGet("/a")).toBeNull();
  });

  it("degrades to a no-op when IndexedDB is unavailable", async () => {
    // Private browsing, exhausted quota, or an old browser. A storage failure
    // must never break a page that works fine online.
    vi.stubGlobal("indexedDB", undefined);
    await expect(cacheSet("/x", { a: 1 })).resolves.toBeUndefined();
    await expect(cacheGet("/x")).resolves.toBeNull();
    await expect(cacheClear()).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- utils/offlineCache.spec.ts`
Expected: FAIL — "Failed to resolve import ./offlineCache".

- [ ] **Step 3: Implement `utils/offlineCache.ts`**

```ts
// IndexedDB-backed cache for read-only API responses.
//
// Every operation is failure-tolerant by design: if IndexedDB is unavailable
// (private browsing, exhausted quota, an old browser) each function resolves
// to a no-op rather than throwing, so a storage problem can never break a page
// that works fine online.

const DB_NAME = "stocktake-offline";
const DB_VERSION = 1;
const STORE = "apiCache";

/** Beyond this many records, the least recently read are dropped. */
export const MAX_RECORDS = 50;
/** Records older than this are treated as a miss and deleted. 7 days. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface CacheRecord {
  key: string;
  data: unknown;
  cachedAt: number;
  lastReadAt: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/** Runs one request against the store, resolving to null on any failure. */
function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const request = fn(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cacheGet(key: string): Promise<CacheRecord | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const record = await run<CacheRecord>(db, "readonly", (s) => s.get(key));
    if (!record) return null;

    if (Date.now() - record.cachedAt > MAX_AGE_MS) {
      await run(db, "readwrite", (s) => s.delete(key));
      return null;
    }

    // Touch lastReadAt so eviction is genuinely LRU, not just write-ordered.
    await run(db, "readwrite", (s) => s.put({ ...record, lastReadAt: Date.now() }));
    return record;
  } finally {
    db.close();
  }
}

export async function cacheSet(key: string, data: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const now = Date.now();
    await run(db, "readwrite", (s) => s.put({ key, data, cachedAt: now, lastReadAt: now }));
    await evict(db);
  } finally {
    db.close();
  }
}

export async function cacheClear(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await run(db, "readwrite", (s) => s.clear());
  } finally {
    db.close();
  }
}

/** Drops expired records, then the least recently read above MAX_RECORDS. */
async function evict(db: IDBDatabase): Promise<void> {
  const all = (await run<CacheRecord[]>(db, "readonly", (s) => s.getAll())) || [];
  const now = Date.now();

  const expired = all.filter((r) => now - r.cachedAt > MAX_AGE_MS);
  const live = all.filter((r) => now - r.cachedAt <= MAX_AGE_MS);
  const overflow = [...live]
    .sort((a, b) => a.lastReadAt - b.lastReadAt)
    .slice(0, Math.max(0, live.length - MAX_RECORDS));

  for (const record of [...expired, ...overflow]) {
    await run(db, "readwrite", (s) => s.delete(record.key));
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- utils/offlineCache.spec.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add utils/offlineCache.ts utils/offlineCache.spec.ts
git commit -m "feat: add IndexedDB offline cache store with TTL and LRU eviction"
```

---

### Task 3: Network-first read-through in `api.ts`

**Files:**
- Modify: `utils/api.ts:34-107` (the `apiFetch` function)
- Test: `utils/api.spec.ts`

**Interfaces:**
- Consumes: `cacheGet`, `cacheSet` from Task 2
- Produces: cached responses carry `__fromCache: true` and `__cachedAt: number`. `isCacheable(endpoint: string, method: string): boolean` is exported for tests.

- [ ] **Step 1: Write the failing tests**

Create `utils/api.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isCacheable, stocktakeEntriesAPI, APIError } from "./api";
import { cacheClear } from "./offlineCache";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("isCacheable", () => {
  it("accepts the three allowlisted GET endpoints", () => {
    expect(isCacheable("/stocktake-entries/available-dates", "GET")).toBe(true);
    expect(isCacheable("/stocktake-entries?warehouse=W202", "GET")).toBe(true);
    expect(isCacheable("/stocktake-entries/grouped?warehouse=W202", "GET")).toBe(true);
  });

  it("rejects non-GET methods", () => {
    expect(isCacheable("/stocktake-entries?warehouse=W202", "PATCH")).toBe(false);
  });

  it("rejects sibling paths that merely share a prefix", () => {
    expect(isCacheable("/stocktake-entries/submit", "GET")).toBe(false);
    expect(isCacheable("/stocktake-entries/abc-123", "GET")).toBe(false);
  });
});

describe("apiFetch caching", () => {
  beforeEach(async () => {
    await cacheClear();
    localStorage.setItem("token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves the cached copy when the network is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ dates: [{ date: "2026-08-12" }] })));
    const fresh = await stocktakeEntriesAPI.getAvailableDates();
    expect(fresh.dates).toHaveLength(1);
    expect(fresh.__fromCache).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const cached = await stocktakeEntriesAPI.getAvailableDates();
    expect(cached.dates).toHaveLength(1);
    expect(cached.__fromCache).toBe(true);
    expect(typeof cached.__cachedAt).toBe("number");
  });

  it("throws when the network is unreachable and nothing is cached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(stocktakeEntriesAPI.getAvailableDates()).rejects.toBeInstanceOf(APIError);
  });

  it("does NOT serve cache for a server error — a 500 must surface", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ dates: [{ date: "2026-08-12" }] })));
    await stocktakeEntriesAPI.getAvailableDates();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "boom" }, 500)));
    await expect(stocktakeEntriesAPI.getAvailableDates()).rejects.toMatchObject({ status: 500 });
  });

  it("does not cache a non-allowlisted endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ id: "1" })));
    await stocktakeEntriesAPI.updateEntry("1", { quantity: 5 });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(stocktakeEntriesAPI.updateEntry("1", { quantity: 5 })).rejects.toBeInstanceOf(APIError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- utils/api.spec.ts`
Expected: FAIL — `isCacheable` is not exported from `./api`.

- [ ] **Step 3: Add the allowlist above `apiFetch` in `utils/api.ts`**

Insert immediately before `async function apiFetch(` at line 34:

```ts
import { cacheGet, cacheSet } from "./offlineCache";

// Read-only endpoints whose responses are cached for offline viewing. Matched
// on the exact path before "?" — never by prefix, or "/stocktake-entries" would
// also swallow "/stocktake-entries/submit" and "/stocktake-entries/<id>".
const CACHEABLE_PATHS = [
  "/stocktake-entries/available-dates",
  "/stocktake-entries/grouped",
  "/stocktake-entries",
];

export function isCacheable(endpoint: string, method: string): boolean {
  if (method !== "GET") return false;
  return CACHEABLE_PATHS.includes(endpoint.split("?")[0]);
}
```

The `import` belongs at the top of the file with the other imports; only the constant and function go above `apiFetch`.

- [ ] **Step 4: Compute cacheability at the top of `apiFetch`**

Directly after `const token = localStorage.getItem("token");` (line 38), add:

```ts
  const method = options.method || "GET";
  const cacheable = isCacheable(endpoint, method);
```

Then change the `fetch` call at line 58 from `method: options.method || "GET",` to `method,`.

- [ ] **Step 5: Serve the cache from the transport-failure branch**

Replace the `catch (networkError: any)` block at lines 62-65 with:

```ts
  } catch (networkError: any) {
    console.error("Network error:", networkError);
    // Transport failure only — this branch is unreachable for any HTTP status.
    // A 500 or 401 resolves the fetch and is handled below, so a real server
    // error can never be masked by stale data.
    if (cacheable) {
      const record = await cacheGet(endpoint);
      if (record) {
        const payload = record.data;
        if (payload && typeof payload === "object" && !Array.isArray(payload)) {
          return { ...(payload as object), __fromCache: true, __cachedAt: record.cachedAt };
        }
        return payload;
      }
    }
    throw new APIError(0, { message: networkError.message }, "Network error: Unable to connect to server");
  }
```

- [ ] **Step 6: Write to the cache on success**

Replace the final `return data;` at line 106 with:

```ts
  if (cacheable) {
    // Fire-and-forget: a storage failure must never fail a successful request.
    void cacheSet(endpoint, data);
  }

  return data;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -- utils/api.spec.ts`
Expected: PASS — 8 tests.

- [ ] **Step 8: Commit**

```bash
git add utils/api.ts utils/api.spec.ts
git commit -m "feat: serve cached reads when the network is unreachable"
```

---

### Task 4: Block writes while offline

One enforcement point in `apiFetch`, rather than eight scattered `disabled` props. A guard that lives at the only place every mutation passes through cannot be forgotten when a new button is added later. Task 8 adds the visual affordance on top; this task is what actually guarantees it.

**Files:**
- Modify: `utils/api.ts` (inside `apiFetch`, before the `fetch` call)
- Test: `utils/api.spec.ts` (append)

**Interfaces:**
- Consumes: `isCacheable` from Task 3
- Produces: any non-GET request while `navigator.onLine === false` rejects with `APIError(0, …)` and message `"You're offline — changes can't be saved. Reconnect and try again."`

- [ ] **Step 1: Write the failing tests**

Append to `utils/api.spec.ts`:

```ts
describe("offline write blocking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("refuses a write while offline without touching the network", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(stocktakeEntriesAPI.updateEntry("1", { quantity: 5 })).rejects.toMatchObject({
      status: 0,
      message: "You're offline — changes can't be saved. Reconnect and try again.",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still allows reads while offline so the cache can answer them", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const fetchSpy = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(stocktakeEntriesAPI.getAvailableDates()).rejects.toBeInstanceOf(APIError);
    expect(fetchSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- utils/api.spec.ts`
Expected: FAIL — the first test fails because `fetch` *was* called.

- [ ] **Step 3: Add the guard**

In `utils/api.ts`, immediately after the `const cacheable = isCacheable(endpoint, method);` line added in Task 3:

```ts
  // Single enforcement point for "no offline writes". Reads fall through so the
  // cache can answer them; only mutations are refused.
  if (method !== "GET" && typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new APIError(
      0,
      { message: "offline" },
      "You're offline — changes can't be saved. Reconnect and try again.",
    );
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- utils/api.spec.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Verify the message reaches the user on at least one write path**

Read `pages/ManagerReview.tsx:842` (`handleDeleteEntry`) and `:490` (`handleSaveFloorReview`). Confirm each `catch` surfaces `err.message` through `toast(...)`. If a handler only calls `console.error`, add a toast using the same shape used elsewhere in the file:

```ts
      toast({
        title: "Offline",
        description: err.message || "Unable to save",
        variant: "destructive",
      });
```

- [ ] **Step 6: Commit**

```bash
git add utils/api.ts utils/api.spec.ts pages/ManagerReview.tsx
git commit -m "feat: refuse writes while offline at the api layer"
```

---

### Task 5: `useOnlineStatus` hook

**Files:**
- Create: `hooks/useOnlineStatus.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `useOnlineStatus(): boolean`

- [ ] **Step 1: Implement the hook**

No unit test: this is three lines of event wiring with no branching logic, and testing it would pull in `@testing-library/react` for no real coverage. It is exercised by the manual verification in Task 9.

```ts
import { useState, useEffect } from "react";

/**
 * Tracks browser connectivity.
 *
 * Caveat: navigator.onLine reports link state, not reachability — a machine
 * connected to a router with no internet reads as online. That is acceptable
 * here because the read cache triggers on the request actually failing, not on
 * this flag; only the write guard trusts it, and there the failure mode is a
 * write that errors normally instead of being pre-empted.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: only the pre-existing `components/ui/select.tsx(126,9)` error.

- [ ] **Step 3: Commit**

```bash
git add hooks/useOnlineStatus.ts
git commit -m "feat: add useOnlineStatus hook"
```

---

### Task 6: Single `logout()` helper that clears the cache

Cached stock data outliving a session is a security problem on a shared warehouse machine. There are two logout sites today and they disagree — `Dashboard.tsx:335-339` clears `token` and `user`; `Index.tsx:41` clears only `token`, orphaning `user`. Adding a third cleanup step to two inconsistent call sites is how it gets missed, so both are routed through one helper. Fixing the `user` leak is a side effect of that consolidation, not unrelated refactoring.

**Files:**
- Create: `utils/session.ts`
- Modify: `pages/Dashboard.tsx:335-339`
- Modify: `pages/Index.tsx:39-44`
- Test: `utils/session.spec.ts`

**Interfaces:**
- Consumes: `cacheClear` from Task 2
- Produces: `logout(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `utils/session.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { logout } from "./session";
import { cacheGet, cacheSet } from "./offlineCache";

describe("logout", () => {
  beforeEach(() => {
    localStorage.setItem("token", "t");
    localStorage.setItem("user", JSON.stringify({ username: "bhrithik" }));
  });

  it("clears credentials and the offline cache together", async () => {
    await cacheSet("/stocktake-entries?warehouse=W202", { entries: [1] });
    await logout();
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(await cacheGet("/stocktake-entries?warehouse=W202")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- utils/session.spec.ts`
Expected: FAIL — "Failed to resolve import ./session".

- [ ] **Step 3: Create `utils/session.ts`**

```ts
import { cacheClear } from "./offlineCache";

/**
 * Tears down the session. The offline cache holds stock data for whichever
 * warehouses the last user could see, so it must be cleared alongside the
 * credentials — otherwise the next person to sign in on a shared warehouse
 * machine could read it.
 */
export async function logout(): Promise<void> {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  await cacheClear();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- utils/session.spec.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Route `Dashboard.tsx` through the helper**

Add to the imports at the top of `pages/Dashboard.tsx`:

```ts
import { logout } from "@/utils/session";
```

Replace `handleLogout` at lines 335-339:

```tsx
  const handleLogout = async () => {
    await logout();
    navigate("/");
  };
```

- [ ] **Step 6: Route `Index.tsx` through the helper**

Add to the imports at the top of `pages/Index.tsx`:

```ts
import { logout } from "@/utils/session";
```

Replace the button's `onClick` at lines 39-44:

```tsx
                <Button
                  onClick={async () => {
                    await logout();
                    setIsLoggedIn(false);
                    navigate("/");
                  }}
```

- [ ] **Step 7: Verify the whole suite and the build**

Run: `npm test`
Expected: PASS — all suites.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add utils/session.ts utils/session.spec.ts pages/Dashboard.tsx pages/Index.tsx
git commit -m "feat: clear offline cache on logout via a single session helper"
```

---

### Task 7: Offline banner in the topbar

**Files:**
- Modify: `components/AppTopbar.tsx`

**Interfaces:**
- Consumes: `useOnlineStatus` from Task 5
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the hook import and call**

In `components/AppTopbar.tsx`, add to the imports:

```ts
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
```

Inside the component, after `const navigate = useNavigate();` (line 18):

```ts
  const online = useOnlineStatus();
```

- [ ] **Step 2: Render the pill**

Insert as the first child of the right-side `<div className="flex items-center gap-2">` at line 52, immediately before `{right}`:

```tsx
        {!online && (
          <span
            title="No connection — showing saved data. Changes can't be saved until you reconnect."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#7F1D1D",
              color: "#FEE2E2",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 9px",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F87171" }} />
            Offline
          </span>
        )}
```

- [ ] **Step 3: Verify it compiles and builds**

Run: `npx tsc --noEmit`
Expected: only the pre-existing `components/ui/select.tsx(126,9)` error.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Verify manually**

Start `npm run dev`, open `localhost:3000/review`, then DevTools → Network → Offline.
Expected: a red "Offline" pill appears in the topbar within a second, and disappears when set back to No throttling.

- [ ] **Step 5: Commit**

```bash
git add components/AppTopbar.tsx
git commit -m "feat: show an offline indicator in the topbar"
```

---

### Task 8: Staleness line and button gating in Manager Review

**Files:**
- Modify: `pages/ManagerReview.tsx` — the three fetches, plus three buttons at `:2210`, `:2305`, `:2332`

**Interfaces:**
- Consumes: `useOnlineStatus` from Task 5; the `__cachedAt` field from Task 3
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the hook and staleness state**

Add to the imports at the top of `pages/ManagerReview.tsx`:

```ts
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
```

Inside the component, next to the other `useState` declarations (near `const [availableDates, setAvailableDates] = useState<string[]>([]);`):

```ts
  const online = useOnlineStatus();
  // Epoch ms of the cached response currently on screen, or null when live.
  const [cachedAt, setCachedAt] = useState<number | null>(null);
```

- [ ] **Step 2: Record staleness in the three fetches**

In `fetchAvailableDates`, immediately after `const response = await stocktakeEntriesAPI.getAvailableDates();`:

```ts
        setCachedAt(response?.__cachedAt ?? null);
```

In `fetchFloors`, immediately after `const entriesResponse = await stocktakeEntriesAPI.getEntries(fetchParams);`:

```ts
      setCachedAt(entriesResponse?.__cachedAt ?? null);
```

In `fetchGroupedItems`, immediately after the `await stocktakeEntriesAPI.getGroupedEntries(...)` call that assigns `data`:

```ts
        setCachedAt(data?.__cachedAt ?? null);
```

- [ ] **Step 3: Render the staleness line on the warehouse picker**

In the main review header, immediately after the `Select a warehouse to review floor entries` subtitle element (`pages/ManagerReview.tsx:1871`):

```tsx
            {cachedAt !== null && (
              <p style={{ color: "#B45309", fontSize: 12, fontWeight: 500, marginTop: 4 }}>
                Showing saved data from{" "}
                {new Date(cachedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                {" — reconnect to refresh."}
              </p>
            )}
```

- [ ] **Step 4: Render the staleness line on the floors page**

In the floors-page header, immediately after the `<p className="mr-subtitle">Choose a floor to review its entries</p>` element:

```tsx
            {cachedAt !== null && (
              <p style={{ color: "#B45309", fontSize: 12, fontWeight: 500, marginTop: 4 }}>
                Showing saved data from{" "}
                {new Date(cachedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                {" — reconnect to refresh."}
              </p>
            )}
```

- [ ] **Step 5: Render the same line on the item page**

In the item-page header, immediately after the `<p className="mr-subtitle">Select an item to view all entries with usernames and quantities</p>` element, insert the identical block:

```tsx
            {cachedAt !== null && (
              <p style={{ color: "#B45309", fontSize: 12, fontWeight: 500, marginTop: 4 }}>
                Showing saved data from{" "}
                {new Date(cachedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                {" — reconnect to refresh."}
              </p>
            )}
```

- [ ] **Step 6: Gate the Save Floor button**

At `pages/ManagerReview.tsx:2307`, change:

```tsx
                      disabled={savingFloorReview}
```

to:

```tsx
                      disabled={savingFloorReview || !online}
                      title={!online ? "Offline — reconnect to make changes" : undefined}
```

and at line 2313 change the background so the disabled state reads as disabled:

```tsx
                        background: savingFloorReview || !online ? '#94B8DD' : '#1B6FC8',
```

- [ ] **Step 7: Gate the Add Item button**

At `pages/ManagerReview.tsx:2332-2333`, change:

```tsx
                    <button
                      onClick={() => setAddItemDrawerOpen(true)}
```

to:

```tsx
                    <button
                      onClick={() => setAddItemDrawerOpen(true)}
                      disabled={!online}
                      title={!online ? "Offline — reconnect to make changes" : undefined}
```

and at line 2343 change `cursor: 'pointer',` to:

```tsx
                        cursor: online ? 'pointer' : 'not-allowed',
                        opacity: online ? 1 : 0.5,
```

- [ ] **Step 8: Gate the Download button**

At `pages/ManagerReview.tsx:2212`, change:

```tsx
                    disabled={downloadingWarehouse}
```

to:

```tsx
                    disabled={downloadingWarehouse || !online}
                    title={!online ? "Offline — reconnect to download" : undefined}
```

- [ ] **Step 9: Verify**

Run: `npx tsc --noEmit`
Expected: only the pre-existing `components/ui/select.tsx(126,9)` error.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 10: Commit**

```bash
git add pages/ManagerReview.tsx
git commit -m "feat: show cached-data age and disable writes when offline"
```

---

### Task 9: Service worker for the app shell

Without this, the cache only survives a network drop while the tab stays open — a reload while offline hits the browser's offline page and the cached data is unreachable.

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `vite.config.ts:52` (plugins array)
- Modify: `vite-env.d.ts`
- Create: `components/UpdatePrompt.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: nothing

- [ ] **Step 1: Install the plugin**

```bash
npm install -D vite-plugin-pwa@^1
```

- [ ] **Step 2: Register the plugin in `vite.config.ts`**

Add to the imports:

```ts
import { VitePWA } from "vite-plugin-pwa";
```

Replace the `plugins: [react(), expressPlugin()],` line at `vite.config.ts:52` with:

```ts
  plugins: [
    react(),
    expressPlugin(),
    VitePWA({
      // Never swap the bundle under a manager mid-review — prompt instead.
      registerType: "prompt",
      manifest: {
        name: "StockTake",
        short_name: "StockTake",
        theme_color: "#111827",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // exceljs is ~940 kB; the default 2 MiB cap would silently skip larger
        // chunks, so raise it enough to precache the whole shell.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // API responses are owned by the IndexedDB layer. Two caches with
        // different eviction rules would drift; the service worker must not
        // hold API data at all.
        runtimeCaching: [{ urlPattern: /\/api\//, handler: "NetworkOnly" }],
      },
    }),
  ],
```

- [ ] **Step 3: Declare the virtual module types**

Append to `vite-env.d.ts`:

```ts
/// <reference types="vite-plugin-pwa/react" />
```

- [ ] **Step 4: Create the update prompt**

Create `components/UpdatePrompt.tsx`:

```tsx
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Prompts before activating a new build. Deliberately not auto-update: a
 * manager mid-review must not have the JS bundle swapped underneath them.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#111827",
        color: "#F9FAFB",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 13,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      A new version is available.
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "#185FA5",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          padding: "5px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reload
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Mount it in `App.tsx`**

Add the import alongside the other component imports:

```ts
import { UpdatePrompt } from "@/components/UpdatePrompt";
```

Render `<UpdatePrompt />` as a sibling immediately after the `<Routes>…</Routes>` element, inside the same parent.

- [ ] **Step 6: Verify the build emits a service worker**

Run: `npm run build`
Expected: succeeds, and `dist/sw.js` plus `dist/manifest.webmanifest` exist.

Run: `ls dist/sw.js dist/manifest.webmanifest`
Expected: both listed.

- [ ] **Step 7: Verify offline boot manually**

The service worker does not run under `npm run dev`. Use the production build:

```bash
npm run build && npx vite preview --port 3000
```

1. Load `localhost:3000/review`, let data render.
2. DevTools → Application → Service Workers: confirm one is activated.
3. DevTools → Network → Offline, then **hard reload**.

Expected: the app boots (no browser offline page), the topbar shows "Offline", the floor list renders from cache with the "Showing saved data from HH:MM" line, and Save Floor / Add Item / Download are disabled.

- [ ] **Step 8: Verify a server error is still not masked**

With the network **online**, stop the backend on port 8002, then reload.
Expected: a normal error surfaces — not stale cached data.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts vite-env.d.ts components/UpdatePrompt.tsx App.tsx
git commit -m "feat: precache the app shell so the app boots offline"
```

---

## Verification checklist

Run after all tasks:

- [ ] `npm test` — all suites pass
- [ ] `npx tsc --noEmit` — only `components/ui/select.tsx(126,9)` remains
- [ ] `npm run build` — succeeds, emits `dist/sw.js`
- [ ] Offline with data loaded → pages render, staleness line shown, writes disabled
- [ ] Offline + hard reload → app boots from precache
- [ ] Backend down but network up → error surfaces, cache **not** served
- [ ] Log out → DevTools → Application → IndexedDB → `stocktake-offline` is empty
