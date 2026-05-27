import { sharedStyles } from "../ui/styles";

export function renderShadow(host: HTMLElement, content: string, styles = ""): ShadowRoot {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${sharedStyles}${styles}</style>${content}`;
  return root;
}
