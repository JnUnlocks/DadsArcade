/** Tiny DOM helpers shared by Word Voltage's screens. */

export function div(className: string, ...children: Array<Node | string>): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  node.append(...children);
  return node;
}

export function text(className: string, content: string, tag: keyof HTMLElementTagNameMap = "div"): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

export function button(
  className: string,
  label: string,
  onClick: () => void,
  options: { aria?: string; html?: string; disabled?: boolean } = {},
): HTMLButtonElement {
  const node = document.createElement("button");
  node.className = className;
  if (options.html !== undefined) node.innerHTML = options.html;
  else node.textContent = label;
  if (options.aria) node.setAttribute("aria-label", options.aria);
  if (options.disabled) node.disabled = true;
  node.addEventListener("click", onClick);
  return node;
}

/** Inline SVG markup, made safe to drop into innerHTML alongside text. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
