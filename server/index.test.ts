import { describe, expect, it } from "vitest";
import { app } from "./index";

describe("server api cors", () => {
  it("redirects local app pages from 127.0.0.1 to localhost for passkey compatibility", async () => {
    const response = await app.request("http://127.0.0.1:8787/");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:8787/");
  });

  it("allows Vite dev frontend origin preflight requests", async () => {
    const response = await app.request("/api/auth/passkey/register/options", {
      method: "OPTIONS",
      headers: {
        "access-control-request-headers": "content-type",
        origin: "http://127.0.0.1:5174",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5174");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("rejects unknown frontend origins", async () => {
    const response = await app.request("/api/auth/passkey/register/options", {
      method: "OPTIONS",
      headers: {
        origin: "https://example.invalid",
      },
    });

    expect(response.status).toBe(403);
  });
});
