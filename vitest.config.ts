import { defineConfig, configDefaults } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/.claude/**',
      'scripts/preview-information-first.test.mjs',
      'scripts/**',
    ],

    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ],
    },

    environment: 'node',
    globals: true,
    css: true,
  },
})