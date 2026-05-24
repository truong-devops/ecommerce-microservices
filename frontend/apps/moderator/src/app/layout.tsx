import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/providers/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'emall | Quản lí khách hàng thật dễ dàng',
  description: 'Trust & Safety moderation workspace for eMall.'
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
