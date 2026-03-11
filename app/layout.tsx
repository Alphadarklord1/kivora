import type { Metadata, Viewport } from "next";
import { headers } from 'next/headers';
import { ServiceWorkerRegistration, InstallPrompt } from "@/components/pwa";
import { DesktopRequired } from '@/components/layout/DesktopRequired';
import { isDesktopOnlyModeEnabled, isDesktopUserAgent } from '@/lib/runtime/mode';
import "./globals.css";

// Inline script to prevent flash of unstyled content
const settingsScript = `
(function() {
  try {
    var readCompat = function(currentKey, legacyKey) {
      var currentValue = localStorage.getItem(currentKey);
      if (currentValue !== null) return currentValue;
      var legacyValue = localStorage.getItem(legacyKey);
      if (legacyValue !== null) {
        localStorage.setItem(currentKey, legacyValue);
      }
      return legacyValue;
    };
    var theme = readCompat('kivora_theme', 'studypilot_theme');
    var fontSize = readCompat('kivora_fontSize', 'studypilot_fontSize');
    var density = readCompat('kivora_density', 'studypilot_density');
    var language = readCompat('kivora_language', 'studypilot_language') || 'en';

    // Apply language + direction first
    document.documentElement.setAttribute('lang', language === 'ar' ? 'ar' : 'en');
    document.documentElement.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');

    // Apply theme
    var normalizedTheme = theme === 'dark' ? 'blue' : theme;
    if (normalizedTheme === 'blue' || normalizedTheme === 'black' || normalizedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', normalizedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'blue' : 'light');
    }

    // Apply font scale
    if (fontSize) {
      document.documentElement.style.setProperty('--font-scale', fontSize);
    }

    // Apply density
    document.documentElement.setAttribute('data-density', density || 'normal');
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: "Kivora",
  description: "Desktop-first study workspace with local AI tools",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kivora",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Kivora",
    title: "Kivora",
    description: "Desktop-first study workspace with local AI tools",
  },
  twitter: {
    card: "summary",
    title: "Kivora",
    description: "Desktop-first study workspace with local AI tools",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const desktopOnlyMode = isDesktopOnlyModeEnabled();
  const shouldEnforceDesktop = desktopOnlyMode && process.env.NODE_ENV === 'production';
  const userAgent = shouldEnforceDesktop ? (await headers()).get('user-agent') : null;
  const allowAppShell = !shouldEnforceDesktop || isDesktopUserAgent(userAgent);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-maskable.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: settingsScript }} />
      </head>
      <body>
        {allowAppShell ? children : <DesktopRequired />}
        {allowAppShell && (
          <>
            <ServiceWorkerRegistration />
            <InstallPrompt />
          </>
        )}
      </body>
    </html>
  );
}
