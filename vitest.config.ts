import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest: unit tests en Node (tests/*.test.ts).
// - Alias '@' igual que Next (tsconfig paths).
// - tests/db-verify.test.ts toca la DB real: excluirlo del run por defecto
//   y correrlo explícito con `npm run test:db`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // db-verify requiere .env con credenciales Supabase reales.
    exclude: ['tests/db-verify.test.ts', 'node_modules/**'],
    environment: 'node',
  },
});
