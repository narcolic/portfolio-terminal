// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwind from "@tailwindcss/vite";
import path from "path";

const esbuildAliasMap = new Map([
  ["#tanstack-router-entry", path.resolve(__dirname, "src/tanstack-router-entry.ts")],
  ["#tanstack-start-entry", path.resolve(__dirname, "src/tanstack-start-entry.ts")],
  ["#tanstack-start-plugin-adapters", path.resolve(__dirname, "src/tanstack-start-plugin-adapters.ts")],
  ["tanstack-start-manifest:v", path.resolve(__dirname, "src/tanstack-start-manifest.ts")],
  ["tanstack-start-injected-head-scripts:v", path.resolve(__dirname, "src/tanstack-start-injected-head-scripts.ts")],
  ["node:async_hooks", path.resolve(__dirname, "src/node-async-hooks.ts")],
  ["node:stream/web", path.resolve(__dirname, "src/node-stream-web.ts")],
  ["node:stream", path.resolve(__dirname, "src/node-stream.ts")],
]);

function createEsbuildAliasPlugin() {
  return {
    name: "esbuild-alias-plugin",
    setup(build: any) {
      build.onResolve({ filter: /^(#tanstack-router-entry|#tanstack-start-entry|#tanstack-start-plugin-adapters|tanstack-start-manifest:v|tanstack-start-injected-head-scripts:v|node:async_hooks|node:stream\/web|node:stream)$/ }, (args: any) => {
        const replacement = esbuildAliasMap.get(args.path);
        if (replacement) {
          return { path: replacement };
        }
      });
    },
  };
}

// Basic Vite config for Vercel deployment (no Lovable/Cloudflare plugins)
export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwind()],
  resolve: {
    conditions: ["browser"],
    alias: [
      { find: "#tanstack-router-entry", replacement: path.resolve(__dirname, "src/tanstack-router-entry.ts") },
      { find: "#tanstack-start-entry", replacement: path.resolve(__dirname, "src/tanstack-start-entry.ts") },
      { find: "#tanstack-start-plugin-adapters", replacement: path.resolve(__dirname, "src/tanstack-start-plugin-adapters.ts") },
      { find: "tanstack-start-manifest:v", replacement: path.resolve(__dirname, "src/tanstack-start-manifest.ts") },
      { find: "tanstack-start-injected-head-scripts:v", replacement: path.resolve(__dirname, "src/tanstack-start-injected-head-scripts.ts") },
      { find: "node:async_hooks", replacement: path.resolve(__dirname, "src/node-async-hooks.ts") },
      { find: "node:stream/web", replacement: path.resolve(__dirname, "src/node-stream-web.ts") },
      { find: "node:stream", replacement: path.resolve(__dirname, "src/node-stream.ts") },
    ],
  },
  define: {
    'process.env': {},
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [createEsbuildAliasPlugin()],
    },
  },
});
