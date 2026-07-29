import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true, // lets @testing-library/react register its afterEach cleanup
    css: true, // otherwise Vitest mocks CSS imports as empty — themes.test.ts reads themes.css via `?raw` and needs its real content
  },
})
