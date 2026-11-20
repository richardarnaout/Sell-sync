import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { DEMO_MODE } from './lib/demo/flag';

// Inter auto-hébergée par Next (aucune requête vers Google côté navigateur), seulement les graisses utilisées.
const inter = Inter({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-inter' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
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
    <html lang="fr" className={inter.variable}>
      <body className="font-sans" style={{ background: '#0b0c14', minHeight: '100vh' }}>
        {/* T-034.1 : bandeau du mode démo (jamais affiché en production : DEMO_MODE y vaut false). */}
        {DEMO_MODE && (
          <div role="status" data-demo-banner
            className="fixed left-1/2 -translate-x-1/2 z-[60] px-3 py-0.5 rounded-full text-xs font-bold pointer-events-none whitespace-nowrap"
            style={{ top: 'calc(env(safe-area-inset-top) + 2px)', background: '#f59e0b', color: '#1c1917', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
            Mode démo · données fictives<span className="hidden sm:inline">, rien n’est enregistré</span>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
