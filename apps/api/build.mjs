// Bundles the API into dist/server.js. npm dependencies stay external (installed on the
// server); the workspace package @pip/shared is TypeScript source, so it is bundled in.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/server.js',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'externalize-npm-deps',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path === '@pip/shared' || args.path.startsWith('@pip/shared/')) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
