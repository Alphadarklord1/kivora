import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

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
        if (sessionStorage.getItem('kivora_guest_cleanup') !== '1') return;
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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://study-alpha-three.vercel.app'),
  ),
  title: {
    default: 'Kivora',
    template: '%s — Kivora',
  },
  description: 'The research-grade study workspace for grad students. Search PubMed, arXiv & Semantic Scholar, import papers by DOI, export BibTeX, and review with FSRS-4.5 spaced repetition — private, encrypted, and offline-capable.',
  applicationName: 'Kivora',
  keywords: [
    'grad student study workspace',
    'PubMed search',
    'arXiv research tool',
    'DOI resolver',
    'BibTeX export',
    'academic research assistant',
    'flashcards spaced repetition',
    'FSRS algorithm',
    'study planner',
    'math solver',
    'private study app',
    'offline AI study tool',
    'encrypted notes',
  ],
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Kivora',
    title: 'Kivora — Research. Review. Submit.',
    description: 'The study workspace built for grad students. Search PubMed, arXiv & Semantic Scholar, import papers by DOI, export BibTeX, generate flashcards, and plan your exam — private, encrypted, offline-capable.',
    url: '/',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Kivora study workspace preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kivora — Research. Review. Submit.',
    description: 'The study workspace built for grad students. PubMed · arXiv · DOI import · BibTeX export · FSRS flashcards · Encrypted & offline-capable.',
    images: ['/twitter-image'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Kivora" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: guestSessionScript }} />
      </head>
      <body className={inter.variable}>
        {children}
        <ServiceWorkerRegistration />
        <InstallPrompt />
      </body>
    </html>
  );
}
