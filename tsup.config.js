import { defineConfig } from 'tsup';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['cjs', 'esm'],
  minify: isProduction,
  shims: true,
  sourcemap: true,
});
