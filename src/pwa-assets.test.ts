import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA assets", () => {
  const publicDir = resolve(process.cwd(), "public");
  const manifest = JSON.parse(
    readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8"),
  ) as {
    theme_color: string;
    icons: Array<{ src: string; sizes: string; type: string }>;
  };

  it("references application icons that exist on disk", () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    for (const icon of manifest.icons) {
      expect(existsSync(resolve(publicDir, icon.src))).toBe(true);
    }
  });

  it("includes installable PNG icons and the current brand color", () => {
    expect(manifest.theme_color).toBe("#183d2c");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
      ]),
    );
  });

  it("pre-caches every manifest icon in the service worker app shell", () => {
    const serviceWorker = readFileSync(resolve(process.cwd(), "scripts/sw.template.js"), "utf8");

    for (const icon of manifest.icons) {
      expect(serviceWorker).toContain(`"${icon.src}"`);
    }
  });
});
