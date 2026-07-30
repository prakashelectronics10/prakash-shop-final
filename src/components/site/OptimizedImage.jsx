import { getOptimizedImageUrl, getResponsiveImageSources } from "../../utils/media";

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  sizes,
  loading = "lazy",
  decoding = "async",
  fetchPriority,
  crop = false,
  className,
  ...props
}) {
  const displayWidth = Number(width) > 0 ? Number(width) : 1200;
  const resolvedSizes = sizes
    || (displayWidth > 0 && displayWidth <= 480 ? `${displayWidth}px` : "100vw");
  const imageOptions = { width: displayWidth, height, crop };
  const optimizedSrc = getOptimizedImageUrl(src, imageOptions);
  const sources = getResponsiveImageSources(src, imageOptions);
  const isPriority = fetchPriority === "high";

  if (!optimizedSrc) return null;

  const image = (
    <img
      src={optimizedSrc}
      alt={alt || ""}
      width={width}
      height={height}
      sizes={sources ? resolvedSizes : undefined}
      loading={isPriority ? "eager" : loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      className={className}
      {...props}
    />
  );

  if (!sources || (!sources.avif && !sources.webp)) return image;

  return (
    <picture>
      {sources.avif ? <source type="image/avif" srcSet={sources.avif} sizes={resolvedSizes} /> : null}
      {sources.webp ? <source type="image/webp" srcSet={sources.webp} sizes={resolvedSizes} /> : null}
      {image}
    </picture>
  );
}
