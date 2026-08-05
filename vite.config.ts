import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  // Stamped into feedback reports so a bug can be tied to a build.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: "dist",
    target: "es2022",
    assetsInlineLimit: 8192,
  },
  server: {
    host: true, // expose on LAN so a real phone can hit the dev server
    port: 5173,
    // Run `npm run cf:dev` alongside `npm run dev` to get the real leaderboard
    // API behind the Vite dev server, with HMR still working on the game.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
