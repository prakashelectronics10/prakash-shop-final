import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Grip, Monitor, Smartphone } from "lucide-react";
import { GalleryGrid } from "../components/site/GalleryGrid";
import { OptimizedImage } from "../components/site/OptimizedImage";
import {
  GALLERY_RATIO_PRESETS, galleryAspectRatio, galleryRatioFromResize, normalizeGalleryItems,
} from "../utils/gallery";
import "./GalleryPreview.css";

const RESIZE_HANDLES = [
  ["nw", -1, -1], ["n", 0, -1], ["ne", 1, -1], ["e", 1, 0],
  ["se", 1, 1], ["s", 0, 1], ["sw", -1, 1], ["w", -1, 0],
];

export function GalleryRatioSelect({ item, onChange, disabled }) {
  const ratio = galleryAspectRatio(item);
  return (
    <label className="gallery-ratio-field">
      <span>Aspect ratio</span>
      <select value={ratio} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {!GALLERY_RATIO_PRESETS.some(([value]) => value === ratio) && <option value={ratio}>Custom · {ratio}</option>}
        {GALLERY_RATIO_PRESETS.map(([value, label]) => (
          <option key={value} value={value}>{label} · {value}</option>
        ))}
      </select>
    </label>
  );
}

export function GalleryPreview({ items, onRatioChange, onMove, busy }) {
  const [mode, setMode] = useState("desktop");
  const [selectedId, setSelectedId] = useState(null);
  const [move, setMove] = useState(null);
  const [resize, setResize] = useState(null);
  const scroll = useRef(null);
  const board = useRef(null);
  const gesture = useRef(null);
  const frame = useRef(null);

  const photos = useMemo(() => normalizeGalleryItems({ items }), [items]);
  const previewPhotos = useMemo(() => resize
    ? photos.map((item) => item.id === resize.id ? { ...item, aspectRatio: resize.ratio } : item)
    : photos, [photos, resize]);
  const selectedIndex = previewPhotos.findIndex(({ id }) => id === selectedId);
  const selected = previewPhotos[selectedIndex];

  useEffect(() => () => window.cancelAnimationFrame(frame.current), []);

  const updateMoveTarget = (active) => {
    const target = document.elementFromPoint(active.x, active.y)?.closest("[data-gallery-photo]");
    const targetId = target && board.current?.contains(target) ? target.dataset.galleryPhoto : null;
    if (active.targetId === targetId) return;
    active.targetId = targetId;
    setMove({ id: active.id, targetId });
  };

  const scrollWhileMoving = () => {
    const active = gesture.current;
    const scroller = scroll.current;
    if (active?.type !== "move" || !scroller) return;
    const { top, bottom, left, right } = scroller.getBoundingClientRect();
    const dy = active.y < top + 32 ? -12 : active.y > bottom - 32 ? 12 : 0;
    const dx = active.x < left + 32 ? -12 : active.x > right - 32 ? 12 : 0;
    if (dx || dy) {
      scroller.scrollLeft += dx;
      scroller.scrollTop += dy;
      updateMoveTarget(active);
    }
    frame.current = window.requestAnimationFrame(scrollWhileMoving);
  };

  const begin = (event, nextGesture) => {
    if (busy || gesture.current || event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    gesture.current = { ...nextGesture, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    board.current.setPointerCapture(event.pointerId);
    return true;
  };

  const beginMove = (event, id) => {
    if (!begin(event, { type: "move", id, targetId: id, x: event.clientX, y: event.clientY })) return;
    setMove({ id, targetId: id });
    frame.current = window.requestAnimationFrame(scrollWhileMoving);
  };

  const beginResize = (event, id, horizontal, vertical) => {
    const { width, height } = event.currentTarget.closest("[data-gallery-photo]").getBoundingClientRect();
    begin(event, { type: "resize", id, width, height, horizontal, vertical });
  };

  const updateGesture = (event) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.type === "move") {
      active.x = event.clientX;
      active.y = event.clientY;
      updateMoveTarget(active);
      return;
    }
    const x = event.clientX - active.startX;
    const y = event.clientY - active.startY;
    if (!active.ratio && Math.hypot(x, y) < 4) return;
    const width = Math.max(24, active.width + x * active.horizontal);
    const height = Math.max(24, active.height + y * active.vertical);
    const ratio = galleryRatioFromResize(width, height);
    if (active.ratio !== ratio) {
      active.ratio = ratio;
      setResize({ id: active.id, ratio });
    }
  };

  const finish = (event, commit) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    window.cancelAnimationFrame(frame.current);
    setMove(null);
    setResize(null);
    if (!commit) return;
    if (active.type === "resize" && active.ratio) onRatioChange(active.id, active.ratio);
    if (active.type === "move" && active.targetId && active.targetId !== active.id) {
      onMove(active.id, active.targetId);
      setSelectedId(active.id);
    }
  };

  return (
    <details className="gallery-preview" open>
      <summary>Gallery preview</summary>
      <div className="gallery-preview-toolbar">
        <div className="gallery-preview-modes" role="group" aria-label="Preview device">
          <button type="button" aria-pressed={mode === "desktop"} onClick={() => setMode("desktop")}>
            <Monitor size={16} aria-hidden="true" /> Desktop
          </button>
          <button type="button" aria-pressed={mode === "mobile"} onClick={() => setMode("mobile")}>
            <Smartphone size={16} aria-hidden="true" /> Mobile
          </button>
        </div>
        <p className="muted">Drag a photo by its grip to reorder. Double-click or tap a photo to edit its ratio.</p>
      </div>
      {selected && (
        <div className="gallery-preview-inspector">
          <div className="gallery-preview-selected">
            <strong>{selected.label}</strong>
            <small>Drag the frame handles or choose a ratio.</small>
          </div>
          <GalleryRatioSelect item={selected} disabled={busy} onChange={(ratio) => onRatioChange(selected.id, ratio)} />
          <div className="gallery-preview-order" role="group" aria-label="Selected photo position">
            <button type="button" title="Move earlier" aria-label="Move earlier" disabled={busy || selectedIndex < 1}
              onClick={() => onMove(selected.id, previewPhotos[selectedIndex - 1].id)}>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" title="Move later" aria-label="Move later" disabled={busy || selectedIndex === previewPhotos.length - 1}
              onClick={() => onMove(selected.id, previewPhotos[selectedIndex + 1].id)}>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      {photos.length ? (
        <div className="gallery-preview-scroll" ref={scroll}>
          <div
            className={`gallery-preview-board gallery-preview-board--${mode}`}
            ref={board}
            onPointerMove={updateGesture}
            onPointerUp={(event) => finish(event, true)}
            onPointerCancel={(event) => finish(event, false)}
            onLostPointerCapture={(event) => finish(event, false)}
          >
            <GalleryGrid items={previewPhotos} mode={mode} renderTile={(item) => (
              <div
                data-gallery-photo={item.id}
                className={`gallery-preview-photo${item.id === selectedId ? " is-selected" : ""}${move?.id === item.id ? " is-moving" : ""}${move?.targetId === item.id && move.id !== item.id ? " is-drop-target" : ""}`}
              >
                <button
                  className="gallery-preview-photo-button"
                  type="button"
                  disabled={busy}
                  aria-label={`Edit ${item.label}`}
                  aria-pressed={item.id === selectedId}
                  onClick={() => setSelectedId(item.id)}
                  onDoubleClick={() => setSelectedId(item.id)}
                >
                  <OptimizedImage src={item.src} alt={item.label} width={720} sizes="400px" draggable={false} />
                </button>
                <button
                  className="gallery-preview-grip"
                  type="button"
                  disabled={busy}
                  aria-label={`Reorder ${item.label}`}
                  onClick={() => setSelectedId(item.id)}
                  onPointerDown={(event) => beginMove(event, item.id)}
                >
                  <Grip size={16} aria-hidden="true" />
                </button>
                {item.id === selectedId && RESIZE_HANDLES.map(([corner, x, y]) => (
                  <span key={corner} aria-hidden="true" className={`gallery-resize-handle gallery-resize-handle--${corner}`}
                    onPointerDown={(event) => beginResize(event, item.id, x, y)} />
                ))}
              </div>
            )} />
          </div>
        </div>
      ) : <p className="muted">Add gallery photos to see the preview.</p>}
    </details>
  );
}
