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
  const optimizedSrc = getOptimizedImageUrl(src, { width: width || 1200 });
  const sources = getResponsiveImageSources(src, { width: width || 1200 });

  if (!optimizedSrc) return null;

  const image = (
    <img
      src={optimizedSrc}
      alt={alt || ""}
      width={width}
      height={height}
      sizes={sources ? sizes : undefined}
      loading={fetchPriority === "high" ? undefined : loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      className={className}
      {...props}
    />
  );

  if (!sources) return image;

  return (
    <picture>
      {sources.avif ? <source type="image/avif" srcSet={sources.avif} sizes={sizes} /> : null}
      {sources.webp ? <source type="image/webp" srcSet={sources.webp} sizes={sizes} /> : null}
      {image}
    </picture>
  );
}
