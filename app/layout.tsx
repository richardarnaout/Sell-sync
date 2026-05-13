import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vinted Tracker — Suivi de ventes',
  description: 'Suis tes bénéfices et ventes Vinted facilement.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 font-sans">{children}</body>
    </html>
  );
}
