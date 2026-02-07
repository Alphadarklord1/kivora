import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistration, InstallPrompt } from "@/components/pwa";
import "./globals.css";

// Inline script to prevent flash of unstyled content
const settingsScript = `
(function() {
  try {
    var theme = localStorage.getItem('studypilot_theme');
    var fontSize = localStorage.getItem('studypilot_fontSize');
    var density = localStorage.getItem('studypilot_density');

    // Apply theme
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
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
  title: "StudyPilot",
  description: "Your AI-powered study companion",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "StudyPilot",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "StudyPilot",
    title: "StudyPilot",
    description: "Your AI-powered study companion",
  },
  twitter: {
    card: "summary",
    title: "StudyPilot",
    description: "Your AI-powered study companion",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        {children}
        <ServiceWorkerRegistration />
        <InstallPrompt />
      </body>
    </html>
  );
}
