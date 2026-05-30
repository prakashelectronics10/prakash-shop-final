export function SectionFallback({ message = "Loading content..." }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
