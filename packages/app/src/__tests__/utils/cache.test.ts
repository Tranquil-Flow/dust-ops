import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { InMemoryBackend, RouteCache } from '../../utils/cache';

// ---------------------------------------------------------------------------
// InMemoryBackend tests
// ---------------------------------------------------------------------------
describe('InMemoryBackend', () => {
  let backend: InMemoryBackend;

  beforeEach(() => {
    // Use a very long sweep interval so it doesn't fire during tests
    backend = new InMemoryBackend(1_000_000);
  });

  afterEach(async () => {
    await backend.quit();
  });

  it('returns null for a missing key', async () => {
    expect(await backend.get('missing')).toBeNull();
  });

  it('stores and retrieves a value', async () => {
    await backend.set('k', JSON.stringify({ foo: 'bar' }), 60);
    const raw = await backend.get('k');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ foo: 'bar' });
  });

  it('returns null after TTL has expired', async () => {
    vi.useFakeTimers();
    await backend.set('k', JSON.stringify(42), 1); // 1 second TTL
    vi.advanceTimersByTime(1001); // advance past TTL
    expect(await backend.get('k')).toBeNull();
    vi.useRealTimers();
  });

  it('still returns value before TTL expires', async () => {
    vi.useFakeTimers();
    await backend.set('k', JSON.stringify(42), 60);
    vi.advanceTimersByTime(30_000); // 30s — still within 60s TTL
    expect(await backend.get('k')).not.toBeNull();
    vi.useRealTimers();
  });

  it('deletes a key', async () => {
    await backend.set('k', JSON.stringify(1), 60);
    await backend.del('k');
    expect(await backend.get('k')).toBeNull();
  });

  it('quit clears the sweep interval', async () => {
    await backend.quit();
    // Should not throw on second quit
    await expect(backend.quit()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// RouteCache tests (using InMemoryBackend directly as the backend override)
// ---------------------------------------------------------------------------
describe('RouteCache', () => {
  let cache: RouteCache;
  let backend: InMemoryBackend;

  beforeEach(() => {
    backend = new InMemoryBackend(1_000_000);
    cache = new RouteCache({ ttlMs: 30_000, backend });
  });

  afterEach(async () => {
    await cache.close();
  });

  it('returns null on cache miss', async () => {
    expect(await cache.get('no-such-key')).toBeNull();
  });

  it('stores a value and retrieves it (typed)', async () => {
    const payload = { price: 3000, token: 'ETH' };
    await cache.set('eth-price', payload);
    const result = await cache.get<typeof payload>('eth-price');
    expect(result).toEqual(payload);
  });

  it('cache hit returns cached value', async () => {
    await cache.set('key', { x: 1 });
    const first = await cache.get('key');
    const second = await cache.get('key');
    expect(first).toEqual(second);
  });

  it('returns null after TTL expires', async () => {
    vi.useFakeTimers();
    // Create a cache with 1-second TTL
    const shortCache = new RouteCache({ ttlMs: 1000, backend });
    await shortCache.set('k', 'hello');
    vi.advanceTimersByTime(1100);
    expect(await shortCache.get('k')).toBeNull();
    vi.useRealTimers();
  });

  it('delete removes a cached entry', async () => {
    await cache.set('k', 'v');
    await cache.delete('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('handles JSON-serializable values: array', async () => {
    await cache.set('arr', [1, 2, 3]);
    expect(await cache.get('arr')).toEqual([1, 2, 3]);
  });

  it('handles JSON-serializable values: null payload inside value', async () => {
    await cache.set('nullish', { a: null, b: undefined });
    const result = await cache.get<{ a: null; b?: undefined }>('nullish');
    // JSON.stringify drops undefined keys
    expect(result).toEqual({ a: null });
  });

  it('close() does not throw', async () => {
    await expect(cache.close()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Module-level singleton smoke test (quoteCache / scanCache)
// ---------------------------------------------------------------------------
describe('module-level singletons', () => {
  it('quoteCache is a RouteCache instance', async () => {
    const { quoteCache } = await import('../../utils/cache');
    expect(quoteCache).toBeInstanceOf(RouteCache);
  });

  it('scanCache is a RouteCache instance', async () => {
    const { scanCache } = await import('../../utils/cache');
    expect(scanCache).toBeInstanceOf(RouteCache);
  });
});
