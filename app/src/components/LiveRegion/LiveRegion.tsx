// Always mounted; screen readers announce only when the text node changes.
export function LiveRegion({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite">
      {text}
    </div>
  );
}
