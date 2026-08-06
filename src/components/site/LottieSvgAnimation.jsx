import { useEffect, useRef } from "react";

let lottieModulePromise = null;

function loadLottie() {
  if (!lottieModulePromise) {
    lottieModulePromise = import("lottie-web").then((mod) => mod.default || mod);
  }
  return lottieModulePromise;
}

export function LottieSvgAnimation({ data, title = "Animation", className = "" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !data) return undefined;

    let cancelled = false;
    let animation = null;

    loadLottie().then((lottie) => {
      if (cancelled || !containerRef.current) return;
      animation = lottie.loadAnimation({
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
    });

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [data, title]);

  const aspectRatio = `${data?.w || 1} / ${data?.h || 1}`;

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={title}
      style={{ aspectRatio, width: "100%" }}
    />
  );
}

export { loadLottie };
