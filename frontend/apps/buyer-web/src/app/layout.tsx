import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/providers/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'E-Mall',
  description: 'Buyer-facing homepage scaffold inspired by modern marketplace patterns.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
