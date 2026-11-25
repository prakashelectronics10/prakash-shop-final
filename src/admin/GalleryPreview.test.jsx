import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { moveGalleryItem } from "../utils/gallery";
import { GalleryPreview } from "./GalleryPreview";

function PreviewFixture() {
  const [items, setItems] = useState([
    { id: "one", label: "Workshop", imageUrl: "/one.jpg" },
    { id: "two", label: "Shop", imageUrl: "/two.jpg", aspectRatio: "4:5" },
    { id: "three", label: "Lights", imageUrl: "/three.jpg" },
  ]);
  return <GalleryPreview items={items}
    onMove={(id, target) => setItems((current) => moveGalleryItem(current, id, target))}
    onRatioChange={(id, aspectRatio) => setItems((current) => current.map((item) => item.id === id ? { ...item, aspectRatio } : item))}
  />;
}

test("switches preview devices, edits the selected ratio and reorders by dropping on a photo", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const oldActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const oldElementFromPoint = document.elementFromPoint;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const pointer = (node, type, coordinates = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...coordinates });
    Object.defineProperty(event, "pointerId", { value: 1 });
    act(() => node.dispatchEvent(event));
  };

  try {
    act(() => root.render(<PreviewFixture />));
    act(() => container.querySelectorAll(".gallery-preview-modes button")[1].click());
    expect(container.querySelector(".gallery-grid--mobile")).not.toBeNull();

    const photo = container.querySelector('[data-gallery-photo="two"]');
    act(() => photo.querySelector(".gallery-preview-photo-button").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    const ratio = container.querySelector("select");
    expect(ratio.value).toBe("4:5");
    act(() => {
      ratio.value = "16:9";
      ratio.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('[data-gallery-photo="two"]').parentNode.style.aspectRatio).toBe(String(16 / 9));

    const board = container.querySelector(".gallery-preview-board");
    board.setPointerCapture = jest.fn();
    const source = container.querySelector('[data-gallery-photo="two"]');
    const destination = container.querySelector('[data-gallery-photo="one"]');
    document.elementFromPoint = () => destination;
    pointer(source.querySelector(".gallery-preview-grip"), "pointerdown");
    pointer(board, "pointermove");
    pointer(board, "pointerup");
    expect([...container.querySelectorAll("[data-gallery-photo]")].map((element) => element.dataset.galleryPhoto))
      .toEqual(["two", "one", "three"]);
    expect(container.querySelector("select").value).toBe("16:9");

    const selected = container.querySelector('[data-gallery-photo="two"]');
    selected.getBoundingClientRect = () => ({ width: 160, height: 90 });
    pointer(selected.querySelector(".gallery-resize-handle--s"), "pointerdown");
    pointer(board, "pointermove", { clientY: 70 });
    pointer(board, "pointerup", { clientY: 70 });
    expect(container.querySelector("select").value).toBe("1:1");
  } finally {
    act(() => root.unmount());
    document.elementFromPoint = oldElementFromPoint;
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldActEnvironment;
  }
});
