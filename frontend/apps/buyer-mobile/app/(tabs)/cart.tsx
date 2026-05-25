import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCart } from '@/cart/cart-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { QuantityStepper } from '@/components/core/quantity-stepper';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

export default function CartScreen() {
  const router = useRouter();
  const { isReady, state, totals, dispatch } = useCart();
  const groups = useMemo(() => {
    const stores = new Map<string, typeof state.items>();
    for (const item of state.items) stores.set(item.sellerId, [...(stores.get(item.sellerId) ?? []), item]);
    return [...stores.entries()];
  }, [state.items]);
  const allSelected = state.items.length > 0 && state.items.every((item) => item.selected);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
        <Text style={styles.title}>Giỏ hàng ({state.items.length})</Text>
        <Text style={styles.edit}>Sửa</Text>
      </View>
      {!isReady ? <ScreenState title="Đang khôi phục giỏ hàng..." /> : null}
      {isReady && state.items.length === 0 ? (
        <View style={styles.empty}>
          <AppIcon color={colors.brand} name="cart-outline" size={64} />
          <ScreenState title="Giỏ hàng trống" detail="Thêm sản phẩm yêu thích để thanh toán nhanh." />
          <PrimaryButton onPress={() => router.push('/explore')}>Mua sắm ngay</PrimaryButton>
        </View>
      ) : null}
      {groups.length > 0 ? (
        <ScrollView contentContainerStyle={styles.items}>
          {groups.map(([sellerId, items]) => (
            <View key={sellerId} style={styles.shopCard}>
              <View style={styles.shopHeader}>
                <Pressable
                  onPress={() => {
                    const selected = !items.every((item) => item.selected);
                    for (const item of items) {
                      if (item.selected !== selected) dispatch({ type: 'toggle', key: item.key });
                    }
                  }}
                  style={[styles.checkbox, items.every((item) => item.selected) ? styles.checked : null]}
                >
                  {items.every((item) => item.selected) ? <AppIcon color={colors.surface} name="checkmark" size={15} /> : null}
                </Pressable>
                <AppIcon color={colors.brand} name="storefront-outline" size={19} />
                <Text style={styles.shopName}>Cửa hàng {sellerId.slice(0, 8)}</Text>
                <AppIcon color={colors.muted} name="chevron-forward" size={16} />
              </View>
              {items.map((item) => (
                <View key={item.key} style={styles.item}>
                  <Pressable onPress={() => dispatch({ type: 'toggle', key: item.key })} style={[styles.checkbox, item.selected ? styles.checked : null]}>
                    {item.selected ? <AppIcon color={colors.surface} name="checkmark" size={15} /> : null}
                  </Pressable>
                  <Image source={{ uri: normalizeRemoteAssetUrl(item.image, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.image} />
                  <View style={styles.itemBody}>
                    <Text numberOfLines={2} style={styles.itemTitle}>{item.title}</Text>
                    <View style={styles.variant}><Text style={styles.meta}>{item.sku}</Text><AppIcon color={colors.muted} name="chevron-down" size={13} /></View>
                    <Text style={styles.price}>{Math.round(item.price).toLocaleString('vi-VN')}đ</Text>
                    <View style={styles.itemFooter}>
                      <QuantityStepper quantity={item.quantity} onChange={(quantity) => dispatch({ type: 'quantity', key: item.key, quantity })} />
                      <Pressable hitSlop={8} onPress={() => dispatch({ type: 'remove', key: item.key })} style={styles.removeButton}>
                        <Text style={styles.remove}>Xóa</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
              <View style={styles.voucher}><AppIcon color={colors.brand} name="ticket-outline" size={18} /><Text style={styles.voucherText}>Xem voucher của cửa hàng</Text><AppIcon color={colors.muted} name="chevron-forward" size={15} /></View>
            </View>
          ))}
          <View style={styles.platformVoucher}><AppIcon color={colors.brand} name="ticket-outline" /><Text style={styles.platformText}>DT Voucher</Text><Text style={styles.platformHint}>Chọn hoặc nhập mã  ›</Text></View>
        </ScrollView>
      ) : null}
      {state.items.length > 0 ? (
        <View style={styles.sticky}>
          <Pressable onPress={() => dispatch({ type: 'toggle-all', selected: !allSelected })} style={styles.all}>
            <View style={[styles.checkbox, allSelected ? styles.checked : null]}>{allSelected ? <AppIcon color={colors.surface} name="checkmark" size={15} /> : null}</View>
            <Text>Tất cả</Text>
          </Pressable>
          <View style={styles.totalBox}>
            <Text style={styles.meta}>Tổng thanh toán</Text>
            <Text style={styles.total}>{Math.round(totals.amount).toLocaleString('vi-VN')}đ</Text>
          </View>
          <PrimaryButton disabled={totals.count === 0} onPress={() => router.push('/checkout')}>Mua hàng ({totals.count})</PrimaryButton>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  edit: { color: colors.ink, fontSize: typography.body, padding: spacing[3] },
  empty: { alignItems: 'center', gap: spacing[3], padding: spacing[6] },
  items: { gap: spacing[3], paddingBottom: 100, paddingTop: spacing[3] },
  shopCard: { backgroundColor: colors.surface, gap: spacing[3], paddingHorizontal: spacing[3], paddingTop: spacing[3] },
  shopHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  shopName: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '700' },
  item: { flexDirection: 'row', gap: spacing[2] },
  checkbox: { alignItems: 'center', borderColor: '#c8c8c8', borderRadius: 5, borderWidth: 1, height: 22, justifyContent: 'center', marginTop: 3, width: 22 },
  checked: { backgroundColor: colors.brand, borderColor: colors.brand },
  image: { backgroundColor: colors.line, borderRadius: radius.sm, height: 92, width: 92 },
  itemBody: { flex: 1, gap: spacing[1] },
  itemTitle: { color: colors.ink, fontSize: typography.body },
  variant: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#f7f7f7', borderRadius: 4, flexDirection: 'row', gap: spacing[1], padding: spacing[1] },
  meta: { color: colors.muted, fontSize: typography.label },
  price: { color: colors.brand, fontSize: 17, fontWeight: '700' },
  itemFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  removeButton: { alignItems: 'center', borderRadius: radius.sm, justifyContent: 'center', minHeight: 42, minWidth: 56, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  remove: { color: colors.muted, fontSize: typography.label },
  voucher: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: spacing[2], paddingVertical: spacing[3] },
  voucherText: { color: colors.ink, flex: 1 },
  platformVoucher: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', gap: spacing[2], padding: spacing[4] },
  platformText: { color: colors.ink, flex: 1 },
  platformHint: { color: colors.muted },
  sticky: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: 1, bottom: 0, flexDirection: 'row', gap: spacing[2], left: 0, padding: spacing[3], position: 'absolute', right: 0 },
  all: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  totalBox: { alignItems: 'flex-end', flex: 1 },
  total: { color: colors.brand, fontSize: 18, fontWeight: '800' },
});
