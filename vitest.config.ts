import { defineConfig } from 'vitest/config'
import path from 'path'
import { config } from 'dotenv'

// Load .env.local for integration tests that need Supabase credentials
const env = config({ path: '.env.local' }).parsed ?? {}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env,
    coverage: {
      provider: 'v8',
      include: ['src/lib/rules/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
