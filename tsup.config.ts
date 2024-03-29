import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: { cli: 'src/cli/index.ts', package: 'src/cli/index.ts' },
  format: ['esm'],
  sourcemap: true,
  minify: false,
  splitting: true,
  target: 'esnext',
  outDir: 'dist',
});
