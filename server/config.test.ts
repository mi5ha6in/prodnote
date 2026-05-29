import { describe, expect, it } from "vitest";
import { getRequestOrigin, getRequestRpId, getServerConfig, isAllowedOrigin, resolveClientOrigin } from "./config";

describe("server config helpers", () => {
  it("uses configured origin when provided", () => {
    expect(getRequestOrigin("http://127.0.0.1:8787/api/health", "https://prodnote.example")).toBe(
      "https://prodnote.example",
    );
  });

  it("derives origin and rp id from request url by default", () => {
    const origin = getRequestOrigin("http://127.0.0.1:8787/api/health", null);

    expect(origin).toBe("http://127.0.0.1:8787");
    expect(getRequestRpId(origin)).toBe("127.0.0.1");
  });

  it("accepts configured dev origins for cross-port frontend requests", () => {
    const config = {
      appOrigin: null,
      appOrigins: ["http://127.0.0.1:5174"],
    };

    expect(isAllowedOrigin("http://127.0.0.1:5174", "http://127.0.0.1:8787/api/me", config)).toBe(true);
    expect(resolveClientOrigin("http://127.0.0.1:8787/api/me", "http://127.0.0.1:5174", config)).toBe(
      "http://127.0.0.1:5174",
    );
  });

  it("does not force secure cookies for local http compose origin", () => {
    process.env.APP_ORIGIN = "http://localhost:8787";
    process.env.NODE_ENV = "production";
    delete process.env.COOKIE_SECURE;

    expect(getServerConfig().cookieSecure).toBe(false);

    delete process.env.APP_ORIGIN;
    delete process.env.NODE_ENV;
  });
});
