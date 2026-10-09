import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
// Demo mode (npm run demo): a pretend phone, always connected, played with
// the mouse, so the games can be seen without pairing one.
const demoRoom = fileURLToPath(new URL("src/lib/demo-room.ts", import.meta.url));
const demo = (): Plugin => ({
  name: "demo-room",
  enforce: "pre",
  config: () => ({ define: { "import.meta.env.VITE_DEMO": '"1"' } }),
  async resolveId(source, importer, options) {
    if (!/(^|\/)room(\.ts)?$/.test(source) || importer === demoRoom) return null;
    const real = await this.resolve(source, importer, { ...options, skipSelf: true });
    return real?.id.endsWith("/src/lib/room.ts") ? demoRoom : null;
  },
});
export default defineConfig({
  plugins: [react(), ...(process.env.DEMO ? [demo()] : [])],
  server: { host: "0.0.0.0" },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
