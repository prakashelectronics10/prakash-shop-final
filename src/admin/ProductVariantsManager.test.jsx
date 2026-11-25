import { act } from "react";
import { createRoot } from "react-dom/client";
import ProductVariantsManager from "./ProductVariantsManager";

test("the floating action adds an option and focuses its label inside the modal", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const previousActEnvironment = window.IS_REACT_ACT_ENVIRONMENT;
  const previousScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  window.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() => root.render(<ProductVariantsManager value={{ hasVariants: true }} />));
    const open = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Add variant group"));
    act(() => open.click());

    const modal = document.querySelector(".pv-modal");
    const scroll = modal.querySelector(".pv-modal-scroll");
    const add = modal.querySelector(".pv-add-option");
    expect(scroll.contains(add)).toBe(false);
    expect(scroll.contains(modal.querySelector("header"))).toBe(false);
    expect(scroll.contains(modal.querySelector("footer"))).toBe(false);

    act(() => add.click());
    const labels = scroll.querySelectorAll(".pv-option-card input[placeholder='Black, Leaf, 10m…']");
    expect(labels).toHaveLength(2);
    expect(document.activeElement).toBe(labels[1]);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "center" });

    const defaults = scroll.querySelectorAll(".pv-option-card input[role='switch']");
    expect([...defaults].map((input) => input.checked)).toEqual([true, false]);
    act(() => defaults[1].closest("label").click());
    expect([...defaults].map((input) => input.checked)).toEqual([false, true]);
  } finally {
    act(() => root.unmount());
    container.remove();
    HTMLElement.prototype.scrollIntoView = previousScrollIntoView;
    window.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
