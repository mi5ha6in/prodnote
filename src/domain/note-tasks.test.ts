import { describe, expect, it } from "vitest";
import { dayNoteTitle, extractOpenCheckboxes } from "./note-tasks";

describe("extractOpenCheckboxes", () => {
  it("collects unchecked items and skips checked, plain lists and prose", () => {
    const markdown = [
      "# План",
      "- [ ] позвонить в банк",
      "- [x] уже сделано",
      "* [ ] купить билеты",
      "- обычный пункт списка",
      "  - [ ] вложенный пункт",
      "текст про [ ] не в списке",
    ].join("\n");

    expect(extractOpenCheckboxes(markdown)).toEqual(["позвонить в банк", "купить билеты", "вложенный пункт"]);
  });

  it("returns nothing for markdown without checkboxes", () => {
    expect(extractOpenCheckboxes("просто текст\n- список")).toEqual([]);
  });
});

describe("dayNoteTitle", () => {
  it("formats the day key as a Russian date title", () => {
    expect(dayNoteTitle("2026-07-02")).toBe("День 02.07.2026");
  });
});
