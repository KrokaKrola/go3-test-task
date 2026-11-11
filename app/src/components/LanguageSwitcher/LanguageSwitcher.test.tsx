import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PAIRS } from '@/domain/markets/markets';
import { getMessages } from '@/i18n/messages/messages';

let pathname = '/lt/lt/';
let search = '';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

import { LanguageSwitcher, localeHref } from './LanguageSwitcher';

const renderSwitcher = (market: 'ee' | 'lt', locale: 'et' | 'lt' | 'en') =>
  render(
    <LanguageSwitcher
      current={{ market, locale }}
      pairs={ALL_PAIRS}
      messages={getMessages(locale)}
    />,
  );

beforeEach(() => {
  pathname = '/lt/lt/';
  search = '';
});

describe('LanguageSwitcher', () => {
  it('links to other locale in same market', () => {
    renderSwitcher('lt', 'lt');
    expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/lt\/en\/?$/),
    );
    expect(screen.getByRole('link', { name: 'Lietuvių' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/lt\/lt\/?$/),
    );
    expect(screen.queryByRole('link', { name: 'Eesti' })).toBeNull();
  });

  it('current locale has aria-current', () => {
    pathname = '/ee/et/';
    renderSwitcher('ee', 'et');
    expect(screen.getByRole('link', { name: 'Eesti' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'English' })).not.toHaveAttribute('aria-current');
  });

  it('keeps path suffix', () => {
    pathname = '/ee/et/review/';
    renderSwitcher('ee', 'et');
    expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/ee\/en\/review\/?$/),
    );
  });

  it('adds trailing slash to path suffix', () => {
    const en = { market: 'ee', locale: 'en' } as const;
    expect(localeHref('/ee/et/review', '', en)).toBe('/ee/en/review/');
    expect(localeHref('/ee/et/', '', en)).toBe('/ee/en/');
  });

  it('keeps query', () => {
    pathname = '/ee/et/';
    search = 'utm_source=x&plan=standard';
    renderSwitcher('ee', 'et');
    expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/ee\/en\/?\?utm_source=x&plan=standard$/),
    );
  });

  it('href follows query changes', () => {
    pathname = '/ee/et/';
    search = 'q=1';
    const props = {
      current: { market: 'ee', locale: 'et' },
      pairs: ALL_PAIRS,
      messages: getMessages('et'),
    } as const;
    const { rerender } = render(<LanguageSwitcher {...props} />);
    const link = screen.getByRole('link', { name: 'English' });
    expect(link).toHaveAttribute('href', expect.stringMatching(/\?q=1$/));
    search = 'q=2';
    rerender(<LanguageSwitcher {...props} />);
    expect(link).toHaveAttribute('href', expect.stringMatching(/\?q=2$/));
    search = '';
    rerender(<LanguageSwitcher {...props} />);
    expect(link.getAttribute('href')).not.toContain('?');
  });

  it('path and query change together', () => {
    pathname = '/ee/et/x/';
    search = 'q=1';
    const props = {
      current: { market: 'ee', locale: 'et' },
      pairs: ALL_PAIRS,
      messages: getMessages('et'),
    } as const;
    const { rerender } = render(<LanguageSwitcher {...props} />);
    pathname = '/ee/et/';
    search = 'utm=new';
    rerender(<LanguageSwitcher {...props} />);
    expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/ee\/en\/?\?utm=new$/),
    );
  });
});
