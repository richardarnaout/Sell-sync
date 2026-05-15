import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0b0c14',
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'SellSync',
  description: 'Suivi de ventes Vinted — bénéfices, stats et graphiques',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SellSync',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans" style={{ background: '#0b0c14', minHeight: '100vh' }}>{children}</body>
    </html>
  );
}
