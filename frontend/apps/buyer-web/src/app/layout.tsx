import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/providers/AppProvider';
import { GlobalBuyerChat } from '@/components/home/global-buyer-chat';
import { Footer } from '@/components/layout/Footer';
import './globals.css';

export const metadata: Metadata = {
  title: 'E-Mall',
  description: 'Buyer-facing homepage scaffold inspired by modern marketplace patterns.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-app-bg text-slate-900">
        <AppProvider>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <GlobalBuyerChat />
            <Footer />
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
