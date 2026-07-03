/**
 * One-shot hand-off of a task id from other views to the focus view.
 *
 * When the user jumps into focus from a checklist item we want the focus view
 * to pre-select that task in the start form — but without auto-starting a
 * timer. The value is consumed once by the focus view on mount.
 */
let pendingFocusTaskId: string | null = null;

export function setPendingFocusTaskId(id: string | null): void {
  pendingFocusTaskId = id;
}

export function takePendingFocusTaskId(): string | null {
  const id = pendingFocusTaskId;
  pendingFocusTaskId = null;
  return id;
}
