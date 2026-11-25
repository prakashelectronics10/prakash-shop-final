import { galleryAspectRatio, galleryItemsForSave, galleryRows, moveGalleryItem } from "./gallery";

test("reads old sizing and keeps a saved aspect ratio ahead of old layout classes", () => {
  expect(galleryAspectRatio({ span: "md:col-span-2" })).toBe("16:9");
  expect(galleryAspectRatio({ span: "md:row-span-2" })).toBe("2:3");
  expect(galleryAspectRatio({ aspectRatio: "4 / 5", span: "md:col-span-2" })).toBe("4:5");
  expect(galleryAspectRatio({ aspectRatio: "1:0" })).toBe("1:1");
});

test("reflows mixed ratios into filled rows in both views and keeps photo order", () => {
  const photos = Array.from({ length: 15 }, (_, index) => ({
    id: String(index),
    aspectRatio: ["16:9", "2:3", "1:1"][index % 3],
  }));
  const desktop = galleryRows(photos, "desktop");
  const mobile = galleryRows(photos, "mobile");
  expect(mobile.length).toBeGreaterThan(desktop.length);
  for (const rows of [desktop, mobile]) {
    expect(rows.flat().map(({ item }) => item)).toEqual(photos);
    expect(rows.flat().filter(({ ratio }) => ratio === 16 / 9)).toHaveLength(5);
    expect(rows.every((row) => row.length > 1)).toBe(true);
  }
  const changed = photos.map((photo, index) => index === 0 ? { ...photo, aspectRatio: "2:3" } : photo);
  expect(galleryRows(changed, "mobile")[0].map(({ ratio }) => ratio)).not.toEqual(mobile[0].map(({ ratio }) => ratio));
});

test("writes the visual order and ratios over outdated display order values", () => {
  const photos = [
    { id: "first", imageUrl: "/one.jpg", aspectRatio: "4:5", displayOrder: 1 },
    { id: "second", imageUrl: "/two.jpg", span: "md:col-span-2", displayOrder: 2 },
  ];
  const result = galleryItemsForSave(moveGalleryItem(photos, "second", "first"));
  expect(result.map(({ id, aspectRatio, displayOrder }) => [id, aspectRatio, displayOrder])).toEqual([
    ["second", "16:9", 1],
    ["first", "4:5", 2],
  ]);
});
