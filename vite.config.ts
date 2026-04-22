import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rolldownOptions: {
      external: [],
      output: {
        preserveModules: false,
      },
    },
    emptyOutDir: true,
  },
  test: {
    include: ['test/**/*.{spec,test}.ts'],
    typecheck: {
      enabled: false,
      include: ['test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});
