import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true, // lets @testing-library/react register its afterEach cleanup
  },
})
