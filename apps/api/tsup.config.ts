import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  minify: false,
  splitting: false,
  bundle: true,
  // Some bundled CJS deps (drizzle, hono) use dynamic require().
  // Inject a CommonJS-compatible require into the ESM bundle.
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  // Explicit list of deps to inline. Anything NOT listed (including native
  // modules like better-sqlite3) stays external and must be installed at runtime.
  noExternal: ["@home-panel/shared", "@hono/node-server", "hono", "dotenv", "drizzle-orm"],
});
