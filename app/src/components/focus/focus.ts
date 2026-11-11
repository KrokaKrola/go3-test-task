import { useEffect, useRef } from 'react';

export function focusHeading(root: ParentNode = document): void {
  const heading = root.querySelector('h1');
  if (!heading) return;
  heading.setAttribute('tabindex', '-1');
  heading.focus();
}

// Not on first render: initial load is not a step change.
export function useFocusHeadingOnStepChange(step: string): void {
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current === step) return;
    previous.current = step;
    focusHeading();
  }, [step]);
}
