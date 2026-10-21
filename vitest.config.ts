import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'scripts/ios-release-config.test.mjs'] },
});
