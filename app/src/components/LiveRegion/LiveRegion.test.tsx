import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveRegion } from './LiveRegion';

async function mutationCount(run: () => void, region: HTMLElement) {
  let count = 0;
  const observer = new MutationObserver((records) => {
    count += records.length;
  });
  observer.observe(region, { childList: true, characterData: true, subtree: true });
  run();
  await Promise.resolve();
  observer.disconnect();
  return count;
}

describe('LiveRegion', () => {
  it('announces only when text changes', async () => {
    const { getByRole, rerender } = render(<LiveRegion text="Verifying" />);
    const region = getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(await mutationCount(() => rerender(<LiveRegion text="Verifying" />), region)).toBe(0);
    expect(
      await mutationCount(() => rerender(<LiveRegion text="Still confirming" />), region),
    ).toBeGreaterThan(0);
    expect(region).toHaveTextContent('Still confirming');
  });
});
