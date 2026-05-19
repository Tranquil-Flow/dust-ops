import '@testing-library/jest-dom';
import { afterAll } from 'vitest';

afterAll(async () => {
  try {
    const { quoteCache, scanCache } = await import('../utils/cache');
    await Promise.all([
      quoteCache?.close?.(),
      scanCache?.close?.(),
    ]);
  } catch {
    // Some tests mock the cache module; cleanup is best-effort.
  }
});
