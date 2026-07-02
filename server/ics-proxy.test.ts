import { describe, expect, it } from "vitest";
import { isSafeIcsUrl } from "./ics-proxy";

describe("isSafeIcsUrl", () => {
  it("accepts public http(s) calendar urls", () => {
    expect(isSafeIcsUrl("https://calendar.google.com/calendar/ical/x/basic.ics")).toBe(true);
    expect(isSafeIcsUrl("http://example.com/feed.ics")).toBe(true);
  });

  it("rejects non-http schemes, loopback and private ranges", () => {
    expect(isSafeIcsUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeIcsUrl("ftp://example.com/a.ics")).toBe(false);
    expect(isSafeIcsUrl("not a url")).toBe(false);
    expect(isSafeIcsUrl("http://localhost:8787/api/me")).toBe(false);
    expect(isSafeIcsUrl("http://127.0.0.1/x.ics")).toBe(false);
    expect(isSafeIcsUrl("http://10.0.0.5/x.ics")).toBe(false);
    expect(isSafeIcsUrl("http://172.20.1.1/x.ics")).toBe(false);
    expect(isSafeIcsUrl("http://192.168.1.10/x.ics")).toBe(false);
    expect(isSafeIcsUrl("http://169.254.1.1/x.ics")).toBe(false);
    expect(isSafeIcsUrl("http://server.internal/x.ics")).toBe(false);
    expect(isSafeIcsUrl("http://[::1]/x.ics")).toBe(false);
  });
});
