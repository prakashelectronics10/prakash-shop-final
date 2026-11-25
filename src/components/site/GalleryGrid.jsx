import { useMemo } from "react";
import { galleryRows } from "../../utils/gallery";
import "./GalleryGrid.css";

export function GalleryGrid({ items, mode, renderTile }) {
  const rows = useMemo(() => galleryRows(items, mode), [items, mode]);

  return (
    <div className={`gallery-grid gallery-grid--${mode}`}>
      {rows.map((row) => (
        <div
          key={row[0].index}
          className="gallery-grid-row"
          style={{ gridTemplateColumns: row.map(({ ratio }) => `minmax(0, ${ratio}fr)`).join(" ") }}
        >
          {row.map(({ item, index, ratio }) => (
            <div
              className="gallery-grid-cell"
              key={item.id || index}
              style={{ aspectRatio: ratio }}
            >
              {renderTile(item, index)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
