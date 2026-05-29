import { readFile } from "node:fs/promises";
import { defineConfig } from "vitest/config";

const githubPagesBase = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
  : "/prodnote/";
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS === "true" ? githubPagesBase : "/");
const buildId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

export default defineConfig({
  base,
  define: {
    __PRODNOTE_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    {
      name: "prodnote-service-worker",
      apply: "build",
      async generateBundle() {
        const template = await readFile(new URL("./scripts/sw.template.js", import.meta.url), "utf-8");
        this.emitFile({
          type: "asset",
          fileName: "sw.js",
          source: template.replaceAll("__PRODNOTE_BUILD_ID__", buildId),
        });
      },
    },
  ],
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
  },
});
