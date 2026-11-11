'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { Pair } from '@/domain/markets/markets';
import type { Messages } from '@/i18n/messages/messages';
import styles from './LanguageSwitcher.module.css';

type Props = { current: Pair; pairs: readonly Pair[]; messages: Messages };

// Q63: swap only the locale segment, keep the rest of the path and the query.
export function localeHref(pathname: string, search: string, { market, locale }: Pair): string {
  const rest = pathname.split('/').slice(3).filter(Boolean).join('/');
  const pathSuffix = rest ? `${rest}/` : '';
  return `/${market}/${locale}/${pathSuffix}${search}`;
}

// Renders nothing, so the Suspense fallback never swaps the nav DOM.
function SearchParamsListener({ onChange }: { onChange: (search: string) => void }) {
  const query = useSearchParams().toString();
  useEffect(() => onChange(query ? `?${query}` : ''), [query, onChange]);
  return null;
}

// Static HTML has no query; links keep their DOM nodes and only `href` changes after hydration.
export function LanguageSwitcher({ current, pairs, messages }: Props) {
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  const sameMarket = pairs.filter((p) => p.market === current.market);
  return (
    <nav aria-label={messages['language.switcherLabel']}>
      <Suspense fallback={null}>
        <SearchParamsListener onChange={setSearch} />
      </Suspense>
      <ul className={styles.list}>
        {sameMarket.map((pair) => (
          <li key={pair.locale}>
            <Link
              href={localeHref(pathname, search, pair)}
              lang={pair.locale}
              hrefLang={pair.locale}
              aria-current={pair.locale === current.locale ? 'page' : undefined}
              className={styles.link}
            >
              {messages[`language.${pair.locale}`]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
