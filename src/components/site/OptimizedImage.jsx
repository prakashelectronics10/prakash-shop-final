import { getOptimizedImageUrl, getResponsiveImageSources } from "../../utils/media";

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  sizes = "100vw",
  loading = "lazy",
  decoding = "async",
  fetchPriority,
  className,
  ...props
}) {
  const displayWidth = Number(width) > 0 ? Number(width) : 1200;
  const optimizedSrc = getOptimizedImageUrl(src, { width: displayWidth });
  const sources = getResponsiveImageSources(src, { width: displayWidth });
  const isPriority = fetchPriority === "high";

  if (!optimizedSrc) return null;

  const image = (
    <img
      src={optimizedSrc}
      alt={alt || ""}
      width={width}
      height={height}
      sizes={sources ? sizes : undefined}
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
      {sources.avif ? <source type="image/avif" srcSet={sources.avif} sizes={sizes} /> : null}
      {sources.webp ? <source type="image/webp" srcSet={sources.webp} sizes={sizes} /> : null}
      {image}
    </picture>
  );
}
