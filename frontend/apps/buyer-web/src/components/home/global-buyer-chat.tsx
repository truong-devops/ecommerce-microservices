'use client';

import { usePathname } from 'next/navigation';
import { BuyerChatDrawer } from '@/components/home/buyer-chat-drawer';
import { useAuth } from '@/providers/AppProvider';

export function GlobalBuyerChat() {
  const pathname = usePathname();
  const { ready, accessToken, user } = useAuth();

  if (!ready || !user || !accessToken || pathname === '/chat') {
    return null;
  }

  return <BuyerChatDrawer accessToken={accessToken} buyerId={user?.id ?? null} buyerName={user?.name ?? null} />;
}
