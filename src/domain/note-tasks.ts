/**
 * Extraction of actionable checkboxes from note markdown: every unchecked
 * `- [ ] item` line becomes a task title. Checked boxes are considered done
 * and are skipped.
 */
export function extractOpenCheckboxes(markdown: string): string[] {
  const titles: string[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^\s*[-*]\s+\[ \]\s+(.+)$/.exec(line);
    const title = match?.[1]?.trim();
    if (title) {
      titles.push(title);
    }
  }
  return titles;
}

/** Title for a day's journal note, e.g. «День 02.07.2026». */
export function dayNoteTitle(day: string): string {
  const [year, month, date] = day.split("-");
  return `День ${date}.${month}.${year}`;
}
