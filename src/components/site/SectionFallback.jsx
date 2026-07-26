import { LoadingState } from "./StateLottie";

export function SectionFallback({ message = "Loading content..." }) {
  return <LoadingState message={message} className="site-state-lottie--section" />;
}
