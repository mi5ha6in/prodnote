import { defineConfig } from "vitest/config";

const githubPagesBase = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
  : "/prodnote/";
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS === "true" ? githubPagesBase : "/");

export default defineConfig({
  base,
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
