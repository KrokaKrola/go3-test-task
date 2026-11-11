import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gtm, consentDefaultSnippet } from './Gtm';

const config = vi.hoisted(() => ({ GTM_ID: undefined as string | undefined }));
vi.mock('../../config', () => ({ getConfig: () => config }));

vi.mock('next/script', () => ({
  default: ({
    id,
    strategy,
    src,
    children,
  }: {
    id: string;
    strategy: string;
    src?: string;
    children?: ReactNode;
  }) => (
    <script id={id} data-strategy={strategy} data-src={src}>
      {children}
    </script>
  ),
}));

afterEach(() => {
  config.GTM_ID = undefined;
  delete window.dataLayer;
});

describe('Gtm', () => {
  it('consent default (all denied) pushed before GTM script', () => {
    config.GTM_ID = 'GTM-ABC123';
    const { container } = render(<Gtm />);
    const scripts = [...container.querySelectorAll('script')];
    const consentIndex = scripts.findIndex((s) => s.id === 'gtm-consent-default');
    const gtmIndex = scripts.findIndex((s) => s.dataset.src?.includes('googletagmanager.com'));
    expect(consentIndex).toBeGreaterThanOrEqual(0);
    expect(consentIndex).toBeLessThan(gtmIndex);

    new Function(scripts[consentIndex]!.textContent!)();
    const [command, action, settings] = Array.from(window.dataLayer![0] as ArrayLike<unknown>);
    expect([command, action]).toEqual(['consent', 'default']);
    expect(settings).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    expect(consentDefaultSnippet).toContain("'consent','default'");
  });

  it('GTM script afterInteractive only when GTM ID configured', () => {
    expect(render(<Gtm />).container.querySelector('script')).toBeNull();

    config.GTM_ID = 'GTM-ABC123';
    const { container } = render(<Gtm />);
    const gtm = container.querySelector<HTMLScriptElement>('#gtm-script')!;
    expect(gtm.dataset.strategy).toBe('afterInteractive');
    expect(gtm.dataset.src).toBe('https://www.googletagmanager.com/gtm.js?id=GTM-ABC123');
  });
});
