import { useEffect, useRef } from "react";
import lottie from "lottie-web";

export function LottieSvgAnimation({ data, title = "Animation", className = "" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !data) return undefined;

    const animation = lottie.loadAnimation({
      container: containerRef.current,
      renderer: "svg",
      loop: true,
      autoplay: true,
      animationData: data,
      rendererSettings: {
        preserveAspectRatio: "xMidYMid meet",
        progressiveLoad: true,
        title,
      },
    });

    return () => {
      animation.destroy();
    };
  }, [data, title]);

  const aspectRatio = `${data?.w || 1} / ${data?.h || 1}`;

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={title}
      style={{ aspectRatio }}
    />
  );
}
