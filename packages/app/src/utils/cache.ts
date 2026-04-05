/**
 * Shared cache utility for API routes.
 *
 * Uses Redis (ioredis) when REDIS_CONNSTR is set, otherwise falls back to an
 * in-process LRU-style Map with TTL expiry. The fallback is suitable for
 * development; Redis is recommended for production to survive across serverless
 * function invocations.
 *
 * Usage:
 *   const cache = new RouteCache({ ttlMs: 30_000 });
 *   await cache.set(key, value);
 *   const hit = await cache.get(key);   // null on miss / expired
 *   await cache.delete(key);
 *   await cache.close();                // call on clean shutdown (optional)
 */

interface InMemoryEntry {
  value: unknown;
  expiresAt: number;
}

/** Thin interface so we can swap backends in tests. */
export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  quit(): Promise<void>;
}

/**
 * In-process Map backend — zero-dep fallback for dev / test.
 * Entries are purged lazily on read; an optional sweep runs on interval.
 */
export class InMemoryBackend implements CacheBackend {
  private store = new Map<string, InMemoryEntry>();
  private sweepInterval: ReturnType<typeof setInterval> | null = null;

  constructor(sweepIntervalMs = 60_000) {
    // Periodically evict expired entries to prevent unbounded memory growth
    this.sweepInterval = setInterval(() => this.sweep(), sweepIntervalMs);
    // Don't block process exit
    if (this.sweepInterval.unref) this.sweepInterval.unref();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return JSON.stringify(entry.value);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value: JSON.parse(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async quit(): Promise<void> {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  /** Expose store size for testing. */
  get size(): number {
    return this.store.size;
  }
}

/** Lazily creates a Redis backend; returns null if ioredis is unavailable. */
function createRedisBackend(connStr: string): CacheBackend | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: Redis } = require('ioredis') as {
      default: new (url: string) => {
        get(key: string): Promise<string | null>;
        set(key: string, value: string, ex: 'EX', ttl: number): Promise<unknown>;
        del(key: string): Promise<unknown>;
        quit(): Promise<unknown>;
      };
    };

    const client = new Redis(connStr);

    return {
      async get(key) {
        return client.get(key);
      },
      async set(key, value, ttlSeconds) {
        await client.set(key, value, 'EX', ttlSeconds);
      },
      async del(key) {
        await client.del(key);
      },
      async quit() {
        await client.quit();
      },
    };
  } catch {
    return null;
  }
}

export interface RouteCacheOptions {
  /** Cache TTL in milliseconds (e.g. 30_000 for 30 s). */
  ttlMs: number;
  /** Override the backend (useful in tests). Defaults to Redis or InMemory. */
  backend?: CacheBackend;
}

export class RouteCache {
  private backend: CacheBackend;
  private ttlSeconds: number;

  constructor(options: RouteCacheOptions) {
    this.ttlSeconds = Math.ceil(options.ttlMs / 1000);

    if (options.backend) {
      this.backend = options.backend;
    } else {
      const connStr = process.env.REDIS_CONNSTR;
      const redis = connStr ? createRedisBackend(connStr) : null;
      this.backend = redis ?? new InMemoryBackend();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.backend.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    try {
      await this.backend.set(key, JSON.stringify(value), this.ttlSeconds);
    } catch {
      // Cache write failures are non-fatal — proceed without caching
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.backend.del(key);
    } catch {
      // Non-fatal
    }
  }

  async close(): Promise<void> {
    try {
      await this.backend.quit();
    } catch {
      // Non-fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton caches (one per route, created once per process).
// These are safe in Next.js because each route file is only loaded once.
// ---------------------------------------------------------------------------

/** 30-second cache for /api/quote responses. */
export const quoteCache = new RouteCache({ ttlMs: 30_000 });

/** 5-minute cache for /api/scan responses. */
export const scanCache = new RouteCache({ ttlMs: 5 * 60 * 1000 });
