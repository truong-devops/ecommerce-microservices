import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OrderStatus } from '@frontend/buyer-contracts';
import { fetchOrders } from '@/api/commerce';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const filters: Array<{ label: string; value?: OrderStatus }> = [
  { label: 'Tất cả' },
  { label: 'Chờ xác nhận', value: 'PENDING' },
  { label: 'Chờ lấy hàng', value: 'PROCESSING' },
  { label: 'Chờ giao hàng', value: 'SHIPPED' },
  { label: 'Hoàn thành', value: 'DELIVERED' },
];

const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  PROCESSING: 'Đang chuẩn bị',
  SHIPPED: 'Đang giao',
  DELIVERED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
  FAILED: 'Thất bại',
};

export default function OrdersScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const orders = useQuery({ queryKey: ['orders', status], queryFn: () => fetchOrders(session!.accessToken, status), enabled: Boolean(session) });

  if (!session) {
    return <SafeAreaView style={styles.safeArea}><ScreenState title="Đăng nhập để xem đơn mua" /><PrimaryButton onPress={() => router.push('/login')}>Đăng nhập</PrimaryButton></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
        <Text style={styles.title}>Đơn đã mua</Text>
        <IconButton accessibilityLabel="Tìm kiếm đơn" color={colors.brand} name="search-outline" onPress={() => setStatus(undefined)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {filters.map((filter) => (
          <Pressable key={filter.label} onPress={() => setStatus(filter.value)} style={[styles.filter, filter.value === status ? styles.selected : null]}>
            <Text style={[styles.filterText, filter.value === status ? styles.selectedText : null]}>{filter.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {orders.isPending ? <ScreenState title="Đang tải đơn hàng..." /> : null}
      {orders.isError ? <ScreenState title="Không tải được đơn hàng" detail={orders.error.message} /> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {orders.data?.map((order) => (
          <Pressable key={order.id} onPress={() => router.push(`/orders/${order.id}`)} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.shop}>
                <View style={styles.mallBadge}><Text style={styles.mallText}>Mall</Text></View>
                <Text style={styles.number}>DT Commerce Store</Text>
              </View>
              <Text style={styles.status}>{statusLabels[order.status]}</Text>
            </View>
            {order.items.slice(0, 1).map((item) => (
              <View key={item.id} style={styles.product}>
                <View style={styles.placeholder}><AppIcon color={colors.brand} name="cube-outline" size={30} /></View>
                <View style={styles.productBody}>
                  <Text numberOfLines={2} style={styles.productName}>{item.productName}</Text>
                  <Text style={styles.meta}>{item.sku}</Text>
                </View>
                <Text style={styles.meta}>x{item.quantity}</Text>
              </View>
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.meta}>Tổng số tiền ({order.items.length} sản phẩm):</Text>
              <Text style={styles.amount}>{Math.round(order.totalAmount).toLocaleString('vi-VN')}đ</Text>
            </View>
            <View style={styles.buttonLine}>
              <View />
              <View style={styles.buyAgain}><Text style={styles.buyAgainText}>{order.status === 'DELIVERED' ? 'Mua lại' : 'Xem đơn'}</Text></View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[2] },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: '700' },
  filters: { backgroundColor: colors.surface, borderBottomColor: colors.line, borderBottomWidth: 1, paddingHorizontal: spacing[3] },
  filter: { marginHorizontal: spacing[2], paddingVertical: spacing[3] },
  selected: { borderBottomColor: colors.brand, borderBottomWidth: 2 },
  filterText: { color: colors.ink, fontSize: 14 },
  selectedText: { color: colors.brand, fontWeight: '700' },
  list: { gap: spacing[3], padding: spacing[3] },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing[3], padding: spacing[3] },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  shop: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  mallBadge: { backgroundColor: colors.brand, borderRadius: 3, paddingHorizontal: spacing[1] },
  mallText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  number: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  status: { color: colors.brand, fontWeight: '600' },
  product: { flexDirection: 'row', gap: spacing[3] },
  placeholder: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.sm, height: 76, justifyContent: 'center', width: 76 },
  productBody: { flex: 1, gap: spacing[1] },
  productName: { color: colors.ink, fontSize: 15 },
  meta: { color: colors.muted, fontSize: typography.body },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[1] },
  amount: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  buttonLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  buyAgain: { borderColor: colors.brand, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing[5], paddingVertical: spacing[2] },
  buyAgainText: { color: colors.brand, fontWeight: '600' },
});
