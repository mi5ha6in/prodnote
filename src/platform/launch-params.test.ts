import { describe, expect, it } from "vitest";
import { parseLaunchParams } from "./launch-params";

describe("parseLaunchParams", () => {
  it("recognises the new-task shortcut", () => {
    expect(parseLaunchParams("?action=new-task")).toEqual({ kind: "new-task" });
  });

  it("joins shared title, text and url into one capture string", () => {
    expect(parseLaunchParams("?title=%D0%A1%D1%82%D0%B0%D1%82%D1%8C%D1%8F&url=https%3A%2F%2Fexample.com")).toEqual({
      kind: "share",
      raw: "Статья https://example.com",
    });
    expect(parseLaunchParams("?text=Просто+текст")).toEqual({ kind: "share", raw: "Просто текст" });
  });

  it("returns null for a plain open", () => {
    expect(parseLaunchParams("")).toBeNull();
    expect(parseLaunchParams("?utm_source=x")).toBeNull();
  });
});
