import { defineConfig } from 'vitest/config'

// Unit tests (Vitest). Run: npm test   One module: npm test -- test/login
// (npx vitest run works too from a terminal whose path starts with C:\; see
// scripts/vitest.mjs for why npm test is safer on Windows.)
// They run in Node: fetch and the canvas are replaced by stand-ins in each test
// (files that need a page window use happy-dom), so no browser and no backend
// are needed.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Each test file, its group and every test name with a check mark.
    reporters: ['tree'],
  },
})
