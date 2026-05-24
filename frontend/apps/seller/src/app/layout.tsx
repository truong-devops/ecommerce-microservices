import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SellerAuthGuard } from '@/components/auth/seller-auth-guard';
import { AppProvider } from '@/providers/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'emall - Kênh người bán',
  description: 'Seller/admin dashboard for eMall with analytics and order operations overview.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <SellerAuthGuard>{children}</SellerAuthGuard>
        </AppProvider>
      </body>
    </html>
  );
}
