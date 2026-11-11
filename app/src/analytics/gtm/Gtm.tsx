import Script from 'next/script';

import { getConfig } from '../../config';

// Consent default (all denied) goes into dataLayer before the GTM script loads (07, Q5).
export const consentDefaultSnippet = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});`;

export function Gtm() {
  const gtmId = getConfig().GTM_ID;
  if (!gtmId) return null;
  return (
    <>
      <Script id="gtm-consent-default" strategy="afterInteractive">
        {consentDefaultSnippet}
      </Script>
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtm.js?id=${gtmId}`}
      />
    </>
  );
}
