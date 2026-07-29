import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Progressive windowing without a virtualization library.
 * Renders the first `pageSize` items, then expands as a sentinel nears the viewport.
 *
 * @param {unknown[]} items
 * @param {number | { pageSize?: number, rootMargin?: string }} [pageSizeOrOptions]
 */
export function useWindowedItems(items, pageSizeOrOptions = 30) {
  const options = typeof pageSizeOrOptions === "number"
    ? { pageSize: pageSizeOrOptions }
    : (pageSizeOrOptions || {});
  const pageSize = Math.max(1, Number(options.pageSize) || 30);
  const rootMargin = options.rootMargin || "200px 0px";

  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  const [visibleCount, setVisibleCount] = useState(() => Math.min(pageSize, list.length));
  const sentinelRef = useRef(null);
  const listKey = useMemo(
    () => `${list.length}:${list[0]?._id || list[0]?.slug || list[0]?.id || ""}:${list[list.length - 1]?._id || list[list.length - 1]?.slug || ""}`,
    [list],
  );

  useEffect(() => {
    setVisibleCount(Math.min(pageSize, list.length));
  }, [listKey, pageSize, list.length]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || visibleCount >= list.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount((current) => Math.min(current + pageSize, list.length));
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list.length, pageSize, rootMargin, visibleCount]);

  return {
    visibleItems: list.slice(0, visibleCount),
    hasMore: visibleCount < list.length,
    sentinelRef,
    visibleCount,
  };
}

/** Mobile-first catalog page size (12 on narrow, 30 on desktop). */
export function useCatalogPageSize(mobileSize = 12, desktopSize = 30) {
  const [pageSize, setPageSize] = useState(() => {
    if (typeof window === "undefined") return desktopSize;
    return window.matchMedia("(max-width: 760px)").matches ? mobileSize : desktopSize;
  });

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setPageSize(media.matches ? mobileSize : desktopSize);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mobileSize, desktopSize]);

  return pageSize;
}
