import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  Layers3,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  DISPLAY_TYPES,
  cleanHexColour,
  createVariantId,
  ensureCombinationsFromGroups,
  formatVariantSummary,
  resolveOptionDisplayType,
  sortedOptions,
} from "../utils/productVariants";
import { ProductVariantSelector } from "../components/site/ProductVariantSelector";
import AdminToggle from "./AdminToggle";
import "./ProductVariantsManager.css";

/** Render overlays on document.body so fixed layers cover the full viewport
 *  (not clipped by ancestor backdrop-filter / overflow on .glass-panel). */
function PortalOverlay({ children }) {
  if (typeof document === "undefined") return null;
  const shell = document.querySelector(".admin-shell");
  const themeClass = shell?.classList.contains("light") ? "light" : "";
  return createPortal(
    <div className={`pv-overlay-portal ${themeClass}`}>{children}</div>,
    document.body,
  );
}

function useOverlayScrollLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

const DISPLAY_TYPE_OPTIONS = [
  { value: "auto", label: "Auto (image / colour / text)" },
  { value: "image_text", label: "Image + text" },
  { value: "color_text", label: "Colour swatch + text" },
  { value: "text", label: "Text only" },
];

const PRESET_COLOURS = [
  { label: "Black", value: "#000000" },
  { label: "White", value: "#FFFFFF" },
  { label: "Red", value: "#EF4444" },
  { label: "Blue", value: "#2563EB" },
  { label: "Silver", value: "#C0C0C0" },
];

function emptyOption(index = 0) {
  return {
    id: createVariantId("opt"),
    label: "",
    imageUrl: "",
    imagePublicId: "",
    colour: "",
    priceAdjustment: "",
    sortOrder: index,
    isDefault: index === 0,
  };
}

function emptyGroup(index = 0) {
  return {
    id: createVariantId("grp"),
    name: "",
    displayType: "auto",
    sortOrder: index,
    options: [emptyOption(0)],
  };
}

function moveItem(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next.map((entry, index) => ({ ...entry, sortOrder: index }));
}

function VariantImageUpload({ apiFetch, value, onChange, onPublicIdChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await apiFetch("/admin/upload/image", { method: "POST", body: formData, timeout: 45000 });
      onChange(response.data.url || "");
      onPublicIdChange?.(response.data.publicId || "");
    } catch (uploadError) {
      setError(uploadError.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="pv-image-upload">
      {value ? (
        <div className="pv-image-preview">
          <img src={value} alt="" />
          <button type="button" className="ghost-button" onClick={() => { onChange(""); onPublicIdChange?.(""); }}>
            Remove image
          </button>
        </div>
      ) : (
        <label className="pv-upload-label">
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => upload(event.target.files?.[0])}
          />
          {uploading ? "Uploading…" : "Upload 4:3 image"}
        </label>
      )}
      {error ? <small className="pv-error">{error}</small> : null}
    </div>
  );
}

function GroupEditorModal({
  open,
  group,
  apiFetch,
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(group);
  const [newOptionId, setNewOptionId] = useState("");
  const newOptionInput = useRef(null);

  useEffect(() => {
    if (!open || !newOptionId || !newOptionInput.current) return;
    newOptionInput.current.scrollIntoView({ block: "center" });
    newOptionInput.current.focus({ preventScroll: true });
    setNewOptionId("");
  }, [newOptionId, open]);

  useEffect(() => {
    setDraft(group ? {
      ...group,
      options: (group.options || []).map((option, index) => ({
        ...emptyOption(index),
        ...option,
        priceAdjustment: option.priceAdjustment ?? "",
      })),
    } : null);
  }, [group]);

  useOverlayScrollLock(open && Boolean(draft));

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !draft) return null;

  const updateOption = (optionId, patch) => {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) => (
        String(option.id) === String(optionId) ? { ...option, ...patch } : option
      )),
    }));
  };

  const setDefaultOption = (optionId) => {
    setDraft((current) => ({
      ...current,
      options: current.options.map((option) => ({
        ...option,
        isDefault: String(option.id) === String(optionId),
      })),
    }));
  };

  const addOption = () => {
    const option = emptyOption();
    setDraft((current) => ({
      ...current,
      options: [...current.options, { ...option, sortOrder: current.options.length, isDefault: false }],
    }));
    setNewOptionId(option.id);
  };

  const removeOption = (optionId) => {
    setDraft((current) => {
      const options = current.options.filter((option) => String(option.id) !== String(optionId));
      if (!options.length) return current;
      if (!options.some((option) => option.isDefault)) options[0].isDefault = true;
      return { ...current, options: options.map((option, index) => ({ ...option, sortOrder: index })) };
    });
  };

  const canSave = draft.name.trim() && draft.options.some((option) => option.label.trim());

  return (
    <PortalOverlay>
      <div className="pv-modal-layer" role="dialog" aria-modal="true" aria-labelledby="pv-group-editor-title">
        <button type="button" className="pv-modal-backdrop" tabIndex={-1} aria-hidden="true" onClick={onClose} />
        <div className="pv-modal">
          <header>
            <div>
              <p className="muted">Variant group</p>
              <h3 id="pv-group-editor-title">{draft.name || "Edit variant group"}</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>

          <div className="pv-modal-content">
            <div className="pv-modal-scroll">
              <label className="pv-field">
                <span>Group name</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Colour, Size, Design…"
                />
              </label>

              <label className="pv-field">
                <span>Display style</span>
                <select
                  value={draft.displayType || "auto"}
                  onChange={(event) => setDraft({ ...draft, displayType: event.target.value })}
                >
                  {DISPLAY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="pv-options-editor">
                <div className="pv-section-head">
                  <h4>Options</h4>
                </div>
                {draft.options.map((option, index) => (
                  <article key={option.id} className="pv-option-card">
                    <div className="pv-option-card-top">
                      <strong>Option {index + 1}</strong>
                      <div className="button-row">
                        <button type="button" className="ghost-button" disabled={index === 0} onClick={() => setDraft((current) => ({ ...current, options: moveItem(current.options, index, index - 1) }))}><ArrowUp size={15} /></button>
                        <button type="button" className="ghost-button" disabled={index === draft.options.length - 1} onClick={() => setDraft((current) => ({ ...current, options: moveItem(current.options, index, index + 1) }))}><ArrowDown size={15} /></button>
                        <button type="button" className="danger" disabled={draft.options.length <= 1} onClick={() => removeOption(option.id)}><Trash2 size={15} /></button>
                      </div>
                    </div>
                    <div className="two-col">
                      <label className="pv-field">
                        <span>Label</span>
                        <input
                          ref={option.id === newOptionId ? newOptionInput : null}
                          value={option.label}
                          onChange={(event) => updateOption(option.id, { label: event.target.value })}
                          placeholder="Black, Leaf, 10m…"
                        />
                      </label>
                      <label className="pv-field">
                        <span>Extra price (₹)</span>
                        <input
                          type="number"
                          value={option.priceAdjustment}
                          onChange={(event) => updateOption(option.id, { priceAdjustment: event.target.value })}
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                    <div className="pv-field">
                      <span>Colour</span>
                      <div className="pv-colour-row">
                        {PRESET_COLOURS.map((colour) => (
                          <button
                            key={colour.value}
                            type="button"
                            className={`pv-colour-chip ${cleanHexColour(option.colour) === colour.value ? "is-selected" : ""}`}
                            style={{ backgroundColor: colour.value }}
                            title={colour.label}
                            aria-label={colour.label}
                            onClick={() => updateOption(option.id, { colour: colour.value })}
                          />
                        ))}
                        <input
                          value={option.colour || ""}
                          onChange={(event) => updateOption(option.id, { colour: event.target.value })}
                          placeholder="#HEX"
                        />
                        {option.colour ? (
                          <button type="button" className="ghost-button" onClick={() => updateOption(option.id, { colour: "" })}>Clear</button>
                        ) : null}
                      </div>
                    </div>
                    <div className="pv-field">
                      <span>Option image (optional, 4:3)</span>
                      <VariantImageUpload
                        apiFetch={apiFetch}
                        value={option.imageUrl}
                        onChange={(imageUrl) => updateOption(option.id, { imageUrl })}
                        onPublicIdChange={(imagePublicId) => updateOption(option.id, { imagePublicId })}
                      />
                    </div>
                    <AdminToggle
                      className="pv-option-toggle"
                      label="Default selected option"
                      checked={option.isDefault}
                      onChange={() => setDefaultOption(option.id)}
                    />
                    <small className="muted pv-option-display">
                      Customer display: {resolveOptionDisplayType(draft, option).replace("_", " + ")}
                    </small>
                  </article>
                ))}
              </div>
            </div>
            <button type="button" className="pv-add-option" onClick={addOption}>
              <Plus size={18} aria-hidden="true" />
              Add option
            </button>
          </div>

          <footer>
            <button type="button" className="ghost-button" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="primary-button"
              disabled={!canSave}
              onClick={() => onSave({
                ...draft,
                name: draft.name.trim(),
                options: draft.options
                  .filter((option) => option.label.trim())
                  .map((option, index) => ({
                    ...option,
                    label: option.label.trim(),
                    colour: cleanHexColour(option.colour),
                    priceAdjustment: option.priceAdjustment === "" ? null : Number(option.priceAdjustment),
                    sortOrder: index,
                  })),
              })}
            >
              Save group
            </button>
          </footer>
        </div>
      </div>
    </PortalOverlay>
  );
}

function CombinationsDrawer({
  open,
  productName,
  groups,
  combinations,
  onClose,
  onChange,
}) {
  useOverlayScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const labelFor = (optionIds = []) => formatVariantSummary({ variantGroups: groups, hasVariants: true }, optionIds) || "Combination";

  const updateCombination = (id, patch) => {
    onChange(combinations.map((item) => (String(item.id) === String(id) ? { ...item, ...patch } : item)));
  };

  return (
    <PortalOverlay>
      <div className="pv-drawer-layer" role="dialog" aria-modal="true" aria-labelledby="pv-combinations-title">
        <button type="button" className="pv-drawer-backdrop" aria-label="Close" onClick={onClose} />
        <aside className="pv-drawer">
          <header>
            <div>
              <p className="muted">{productName || "Product"}</p>
              <h3 id="pv-combinations-title">Stock, SKU & pricing</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>
          <p className="muted">
            Each row is a unique option combination. Mark unavailable combinations to block ordering.
          </p>
          <div className="pv-combination-list">
            {combinations.map((item) => (
              <article key={item.id} className={`pv-combination-card ${item.isAvailable === false ? "is-unavailable" : ""}`}>
                <strong>{labelFor(item.optionIds)}</strong>
                <div className="three-col">
                  <label className="pv-field">
                    <span>SKU</span>
                    <input value={item.sku || ""} onChange={(event) => updateCombination(item.id, { sku: event.target.value.toUpperCase() })} placeholder="Optional" />
                  </label>
                  <label className="pv-field">
                    <span>Stock</span>
                    <input
                      type="number"
                      value={item.stock ?? ""}
                      onChange={(event) => updateCombination(item.id, { stock: event.target.value === "" ? null : Number(event.target.value) })}
                      placeholder="Use product qty"
                    />
                  </label>
                  <label className="pv-field">
                    <span>Extra price (₹)</span>
                    <input
                      type="number"
                      value={item.priceAdjustment ?? ""}
                      onChange={(event) => updateCombination(item.id, { priceAdjustment: event.target.value === "" ? null : Number(event.target.value) })}
                      placeholder="Optional"
                    />
                  </label>
                </div>
                <div className="two-col">
                  <label className="pv-field">
                    <span>Absolute price override (₹)</span>
                    <input
                      type="number"
                      value={item.price ?? ""}
                      onChange={(event) => updateCombination(item.id, { price: event.target.value === "" ? null : Number(event.target.value) })}
                      placeholder="Leave empty to use base + extras"
                    />
                  </label>
                  <AdminToggle
                    className="pv-option-toggle pv-option-toggle--centered"
                    label="Available for purchase"
                    checked={item.isAvailable !== false}
                    onChange={(isAvailable) => updateCombination(item.id, { isAvailable })}
                  />
                </div>
              </article>
            ))}
          </div>
          <footer>
            <button type="button" className="primary-button" onClick={onClose}>Done</button>
          </footer>
        </aside>
      </div>
    </PortalOverlay>
  );
}

function PreviewDrawer({ open, productName, value, onClose }) {
  const [selectedOptionIds, setSelectedOptionIds] = useState([]);
  const previewProduct = useMemo(() => ({
    name: productName || "Product",
    hasVariants: true,
    variantGroups: value.variantGroups || [],
    variantCombinations: value.variantCombinations || [],
  }), [productName, value]);

  useEffect(() => {
    if (!open) return;
    const first = (value.variantCombinations || [])[0];
    setSelectedOptionIds((first?.optionIds || []).map(String));
  }, [open, value]);

  useOverlayScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <PortalOverlay>
      <div className="pv-drawer-layer" role="dialog" aria-modal="true" aria-labelledby="pv-preview-title">
        <button type="button" className="pv-drawer-backdrop" aria-label="Close" onClick={onClose} />
        <aside className="pv-drawer pv-drawer--preview">
          <header>
            <div>
              <p className="muted">Customer preview</p>
              <h3 id="pv-preview-title">{productName || "Product variants"}</h3>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </header>
          <div className="pv-preview-panel">
            <ProductVariantSelector
              product={previewProduct}
              selectedOptionIds={selectedOptionIds}
              onChange={(combination) => setSelectedOptionIds(combination.optionIds.map(String))}
            />
          </div>
          <footer>
            <button type="button" className="primary-button" onClick={onClose}>Close preview</button>
          </footer>
        </aside>
      </div>
    </PortalOverlay>
  );
}

export default function ProductVariantsManager({
  value,
  onChange,
  apiFetch,
  productName = "",
}) {
  const [groupEditor, setGroupEditor] = useState(null);
  const [combinationsOpen, setCombinationsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const groups = value?.variantGroups || [];
  const combinations = value?.variantCombinations || [];
  const enabled = Boolean(value?.hasVariants);

  const syncCombinations = (nextGroups, currentCombinations = combinations) => (
    ensureCombinationsFromGroups(nextGroups, currentCombinations)
  );

  const setEnabled = (hasVariants) => {
    if (!hasVariants) {
      onChange({ hasVariants: false, variantGroups: [], variantCombinations: [] });
      return;
    }
    const nextGroups = groups.length ? groups : [emptyGroup(0)];
    onChange({
      hasVariants: true,
      variantGroups: nextGroups,
      variantCombinations: syncCombinations(nextGroups, combinations),
    });
  };

  const saveGroup = (group) => {
    const exists = groups.some((item) => String(item.id) === String(group.id));
    const nextGroups = exists
      ? groups.map((item) => (String(item.id) === String(group.id) ? group : item))
      : [...groups, { ...group, sortOrder: groups.length }];
    onChange({
      hasVariants: true,
      variantGroups: nextGroups.map((item, index) => ({ ...item, sortOrder: index })),
      variantCombinations: syncCombinations(nextGroups, combinations),
    });
    setGroupEditor(null);
  };

  const deleteGroup = (groupId) => {
    if (!window.confirm("Delete this variant group and regenerate combinations?")) return;
    const nextGroups = groups
      .filter((item) => String(item.id) !== String(groupId))
      .map((item, index) => ({ ...item, sortOrder: index }));
    onChange({
      hasVariants: nextGroups.length > 0,
      variantGroups: nextGroups,
      variantCombinations: nextGroups.length ? syncCombinations(nextGroups, combinations) : [],
    });
  };

  const reorderGroup = (index, direction) => {
    const nextGroups = moveItem(groups, index, index + direction);
    onChange({
      hasVariants: true,
      variantGroups: nextGroups,
      variantCombinations: syncCombinations(nextGroups, combinations),
    });
  };

  return (
    <div className="admin-form-section product-variants-manager">
      <div className="pv-summary-head">
        <div>
          <h3><Layers3 size={18} /> Product variants</h3>
          <p className="muted">
            Manage colour, size, design and other options in a dedicated drawer — keep the main product form clean.
          </p>
        </div>
        <AdminToggle className="pv-toggle" label="Enable variants" checked={enabled} onChange={setEnabled} />
      </div>

      {enabled ? (
        <>
          <div className="pv-toolbar">
            <button type="button" className="ghost-button" onClick={() => setGroupEditor(emptyGroup(groups.length))}>
              <Plus size={16} /> Add variant group
            </button>
            <button type="button" className="ghost-button" onClick={() => setCombinationsOpen(true)} disabled={!groups.length}>
              <Pencil size={16} /> Stock & SKU
            </button>
            <button type="button" className="ghost-button" onClick={() => setPreviewOpen(true)} disabled={!groups.length}>
              <Eye size={16} /> Preview selector
            </button>
          </div>

          {!groups.length ? (
            <p className="muted">No variant groups yet. Add Colour, Size, or a custom group to get started.</p>
          ) : (
            <div className="pv-group-list">
              {groups.map((group, index) => (
                <article key={group.id} className="pv-group-row">
                  <span className="pv-group-handle" aria-hidden="true"><GripVertical size={16} /></span>
                  <div>
                    <strong>{group.name || "Untitled group"}</strong>
                    <small>
                      {DISPLAY_TYPES.includes(group.displayType) ? group.displayType.replace("_", " + ") : "auto"}
                      {" · "}
                      {sortedOptions(group).length} option{sortedOptions(group).length === 1 ? "" : "s"}
                    </small>
                  </div>
                  <div className="button-row">
                    <button type="button" className="ghost-button" disabled={index === 0} onClick={() => reorderGroup(index, -1)}><ArrowUp size={15} /></button>
                    <button type="button" className="ghost-button" disabled={index === groups.length - 1} onClick={() => reorderGroup(index, 1)}><ArrowDown size={15} /></button>
                    <button type="button" onClick={() => setGroupEditor(group)}><Pencil size={15} /> Edit</button>
                    <button type="button" className="danger" onClick={() => deleteGroup(group.id)}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <p className="muted">
            {combinations.length} combination{combinations.length === 1 ? "" : "s"} generated.
            Use Stock & SKU to set availability per combination.
          </p>
        </>
      ) : null}

      <GroupEditorModal
        open={Boolean(groupEditor)}
        group={groupEditor}
        apiFetch={apiFetch}
        onClose={() => setGroupEditor(null)}
        onSave={saveGroup}
      />
      <CombinationsDrawer
        open={combinationsOpen}
        productName={productName}
        groups={groups}
        combinations={combinations}
        onClose={() => setCombinationsOpen(false)}
        onChange={(nextCombinations) => onChange({
          hasVariants: true,
          variantGroups: groups,
          variantCombinations: nextCombinations,
        })}
      />
      <PreviewDrawer
        open={previewOpen}
        productName={productName}
        value={value}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
