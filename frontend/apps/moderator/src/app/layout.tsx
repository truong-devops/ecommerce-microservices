import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/providers/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'eMall Trust & Safety | Bảng điều khiển kiểm duyệt',
  description: 'Trung tâm kiểm duyệt & bảo vệ người dùng eMall Trust & Safety Operations Console.',
  icons: {
    icon: '/icon.svg'
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50/70 antialiased selection:bg-brand-100 selection:text-brand-900">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
