import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/ios-*.test.mjs', 'tests/identity/**/*.test.ts'],
  },
});
