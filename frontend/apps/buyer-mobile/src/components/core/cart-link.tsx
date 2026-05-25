import { useRouter } from 'expo-router';

import { useCart } from '@/cart/cart-context';

import { IconButton } from './icon-button';

export function CartLink({ color }: { color?: string }) {
  const { totals } = useCart();
  const router = useRouter();

  return (
    <IconButton
      accessibilityLabel={`Giỏ hàng, ${totals.count} sản phẩm`}
      badge={totals.count}
      color={color}
      name="cart-outline"
      onPress={() => router.push('/cart')}
    />
  );
}
