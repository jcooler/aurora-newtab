import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['supabase/functions/tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
})
