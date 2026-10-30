import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * Foundry loads one ES module and one stylesheet from module.json.
 * Library mode emits dist/forge-scribe.js. The pdf.js worker is copied beside it
 * because the browser cannot import it out of node_modules at runtime.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
    cssCodeSplit: false,
    lib: {
      entry: resolve(root, "src/folio.ts"),
      formats: ["es"],
      fileName: () => "forge-scribe.js",
      cssFileName: "forge-scribe",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
          dest: ".",
        },
      ],
    }),
  ],
});
