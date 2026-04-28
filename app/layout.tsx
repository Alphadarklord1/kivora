import type { Metadata, Viewport } from 'next';
import './globals.css';
import './design-tokens.css';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('kivora_theme');
    if (t === 'light') document.documentElement.setAttribute('data-theme','light');
  } catch(e){}
})();
`;

const guestSessionScript = `
(function(){
  try {
    var key = 'kivora_guest_session_id';
    var sessionId = sessionStorage.getItem(key);
    if (!sessionId) {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        sessionId = window.crypto.randomUUID();
      } else {
        sessionId = 'guest-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      }
      sessionStorage.setItem(key, sessionId);
    }
    window.__kivoraGuestSessionId = sessionId;

    var originalFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var isApiRequest = url.indexOf('/api/') === 0 || url.indexOf(window.location.origin + '/api/') === 0;
        var isAuthRequest = url.indexOf('/api/auth/') === 0 || url.indexOf(window.location.origin + '/api/auth/') === 0;
        if (isApiRequest && !isAuthRequest && window.__kivoraGuestSessionId) {
          var nextInit = init ? Object.assign({}, init) : {};
          var headers = new Headers(nextInit.headers || (typeof input !== 'string' ? input.headers : undefined) || undefined);
          if (!headers.has('x-kivora-guest-session')) {
            headers.set('x-kivora-guest-session', window.__kivoraGuestSessionId);
          }
          nextInit.headers = headers;
          return originalFetch(input, nextInit);
        }
      } catch (e) {}
      return originalFetch(input, init);
    };

    var cleanup = function() {
      try {
        var id = window.__kivoraGuestSessionId;
        if (!id) return;
        var payload = JSON.stringify({ guestSessionId: id });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/guest/session', new Blob([payload], { type: 'application/json' }));
        } else {
          fetch('/api/guest/session', {
            method: 'POST',
            body: payload,
            headers: { 'Content-Type': 'application/json', 'x-kivora-guest-session': id },
            keepalive: true
          });
        }
      } catch (e) {}
    };

    window.addEventListener('pagehide', cleanup);
  } catch(e){}
})();
`;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kivora.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Kivora - AI Study Workspace',
    template: '%s | Kivora',
  },
  description: 'Research, review, and submit. Search sources, turn them into flashcards and notes, solve math, and plan your study flow in one private workspace.',
  keywords: ['study app', 'AI study assistant', 'flashcards', 'research', 'note taking', 'academic research', 'spaced repetition', 'offline AI'],
  authors: [{ name: 'Kivora' }],
  creator: 'Kivora',
  publisher: 'Kivora',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Kivora',
    title: 'Kivora - AI Study Workspace',
    description: 'Research, review, and submit. Search sources, turn them into flashcards and notes, solve math, and plan your study flow in one private workspace.',
    images: [
      {
        url: '/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Kivora - AI Study Workspace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kivora - AI Study Workspace',
    description: 'Research, review, and submit. Search sources, turn them into flashcards and notes, solve math, and plan your study flow in one private workspace.',
    images: ['/images/og-image.png'],
    creator: '@kivora',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/icon.ico', sizes: 'any' },
    ],
    apple: [{ url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kivora',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  userScalable: false,
  themeColor: '#4a90e2',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://fonts.bunny.net"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.bunny.net/css?family=dm-sans:400,500,700|instrument-serif:400,600|jetbrains-mono:400,500|tajawal:400,500,700|noto-naskh-arabic:400,500,700"
        />

        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: guestSessionScript }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
        <InstallPrompt />
      </body>
    </html>
  );
}
