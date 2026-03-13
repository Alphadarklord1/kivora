import type { Metadata, Viewport } from 'next';
import './globals.css';

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
        if (isApiRequest && window.__kivoraGuestSessionId) {
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

export const metadata: Metadata = {
  title: 'Kivora',
  description: 'Your study workspace — organize materials, generate summaries, quizzes, and more.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,300..700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: guestSessionScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
