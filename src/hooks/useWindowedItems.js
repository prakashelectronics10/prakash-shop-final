import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Progressive windowing without a virtualization library.
 * Renders the first `pageSize` items, then expands as a sentinel nears the viewport.
 */
export function useWindowedItems(items, pageSize = 30) {
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
      { rootMargin: "480px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list.length, pageSize, visibleCount]);

  return {
    visibleItems: list.slice(0, visibleCount),
    hasMore: visibleCount < list.length,
    sentinelRef,
    visibleCount,
  };
}
