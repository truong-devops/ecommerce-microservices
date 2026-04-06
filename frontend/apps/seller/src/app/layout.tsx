import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProvider } from '@/providers/AppProvider';
import './globals.css';

const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body'
});

export const metadata: Metadata = {
  title: 'eMall Seller Dashboard',
  description: 'Seller/admin dashboard for eMall with analytics and order operations overview.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={publicSans.variable}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
