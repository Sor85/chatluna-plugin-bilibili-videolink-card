import { defineConfig } from 'vitest/config'
import unyaml from '@cordisjs/unyaml/vite'

export default defineConfig({
  plugins: [unyaml()],
  test: { include: ['tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 }
})
