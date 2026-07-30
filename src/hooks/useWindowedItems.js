import { startTransition, useEffect, useMemo, useRef, useState } from "react";

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
  const visibleCountRef = useRef(visibleCount);
  const listLengthRef = useRef(list.length);
  const pageSizeRef = useRef(pageSize);
  const listKey = useMemo(
    () => [
      list.length,
      list[0]?._id || list[0]?.slug || list[0]?.id || "",
      list[Math.min(1, list.length - 1)]?._id || list[Math.min(1, list.length - 1)]?.slug || "",
      list[list.length - 1]?._id || list[list.length - 1]?.slug || "",
    ].join(":"),
    [list],
  );

  visibleCountRef.current = visibleCount;
  listLengthRef.current = list.length;
  pageSizeRef.current = pageSize;

  useEffect(() => {
    setVisibleCount(Math.min(pageSize, list.length));
  }, [listKey, pageSize, list.length]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || list.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (visibleCountRef.current >= listLengthRef.current) return;
        startTransition(() => {
          setVisibleCount((current) => Math.min(
            current + pageSizeRef.current,
            listLengthRef.current,
          ));
        });
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [listKey, rootMargin, list.length]);

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
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mobileSize, desktopSize]);

  return pageSize;
}
