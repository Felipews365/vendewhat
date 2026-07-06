import Script from "next/script";
import {
  sanitizeFacebookPixelId,
  sanitizeGoogleTagId,
} from "@/lib/storefront";

/**
 * Scripts de rastreamento (Pixel do Facebook/Meta + tag do Google) que o
 * lojista configura na vitrine. Renderizado só na loja pública. Os IDs são
 * re-sanitizados aqui (só dígitos / `[A-Z0-9-]`) antes de irem para dentro do
 * `<script>`, então não dá para injetar código pelo campo do painel.
 *
 * A tag do Google usa `gtag` (funciona para GA4 `G-…` e Google Ads `AW-…`).
 * Para um container do Tag Manager (`GTM-…`) carregamos o `gtm.js`.
 */
export function StoreTrackingScripts({
  facebookPixelId,
  googleAnalyticsId,
}: {
  facebookPixelId?: string | null;
  googleAnalyticsId?: string | null;
}) {
  const fbId = sanitizeFacebookPixelId(facebookPixelId ?? "");
  const gId = sanitizeGoogleTagId(googleAnalyticsId ?? "");
  const isGtm = gId.startsWith("GTM-");

  return (
    <>
      {fbId && (
        <>
          <Script id="vw-fb-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${fbId}');fbq('track','PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${fbId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {gId && !isGtm && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gId}`}
            strategy="afterInteractive"
          />
          <Script id="vw-gtag" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${gId}');`}
          </Script>
        </>
      )}

      {gId && isGtm && (
        <>
          <Script id="vw-gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;
j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gId}');`}
          </Script>
          <noscript>
            <iframe
              title="gtm"
              src={`https://www.googletagmanager.com/ns.html?id=${gId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        </>
      )}
    </>
  );
}
