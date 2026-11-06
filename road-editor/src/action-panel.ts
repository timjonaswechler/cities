// Keep action controls mounted when a blur commits a numeric field before
// its following click. Replacing those buttons would swallow the action.
export function updateActionPanel(
  container: HTMLElement,
  html: string,
  actionAttribute: string,
): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  const actions = template.content.querySelector<HTMLElement>(
    `[${actionAttribute}s]`,
  )!;
  actions.remove();
  let body = container.querySelector<HTMLElement>("[data-panel-body]");
  if (!body) {
    body = document.createElement("div");
    body.setAttribute("data-panel-body", "");
    container.replaceChildren(body, actions);
  } else {
    const live = [
      ...container.querySelectorAll<HTMLButtonElement>(
        `button[${actionAttribute}]`,
      ),
    ];
    for (const button of actions.querySelectorAll<HTMLButtonElement>("button"))
      live.find(
        (b) =>
          b.getAttribute(actionAttribute) ===
          button.getAttribute(actionAttribute),
      )!.disabled = button.disabled;
  }
  body.replaceChildren(template.content);
}
