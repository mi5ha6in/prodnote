/** Lock/unlock background page scroll while a modal is open. */
export function setBodyScrollLock(locked: boolean): void {
  if (typeof document !== "undefined") {
    document.body.classList.toggle("pn-modal-open", locked);
  }
}

/**
 * Wires up a `<dialog class="modal" data-modal>` rendered by `modalHtml`:
 * opens it modally and closes it on backdrop click or Esc/cancel.
 * `onClose` should clear the host component state that drives the modal and re-render.
 */
export function wireModal(root: ParentNode, options: { onClose: () => void }): void {
  const dialog = root.querySelector<HTMLDialogElement>("[data-modal]");
  if (!dialog) {
    return;
  }

  if (!dialog.open) {
    dialog.showModal();
  }

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      options.onClose();
    }
  });

  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    options.onClose();
  });
}
