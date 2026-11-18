import { defineConfig } from "vite";
export default defineConfig({ server: { host: true, port: 5199, strictPort: true, watch: { ignored: ["**/release/**", "**/work/**", "**/docs/**"] } }, preview: { host: true, port: 5199, strictPort: true }, build: { outDir: "dist", assetsInlineLimit: 0 } });
