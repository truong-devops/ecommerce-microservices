import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProvider } from '@/providers/AppProvider';
import './globals.css';

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body'
});

export const metadata: Metadata = {
  title: 'eMall Moderator Console',
  description: 'Trust & Safety moderation workspace for eMall.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={bodyFont.variable}>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
