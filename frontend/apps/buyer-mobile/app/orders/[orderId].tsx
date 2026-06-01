import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelOrder, confirmOrderReceived, fetchOrder, fetchPaymentForOrder, fetchShipmentForOrder } from '@/api/commerce';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { buyerOrderStatusLabel } from '@/domain/orders';
import { shipmentDisplayCode, shipmentStatusLabel } from '@/domain/shipping';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function OrderDetailScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = orderId ?? '';
  const order = useQuery({ queryKey: ['order', id], queryFn: () => fetchOrder(session!.accessToken, id), enabled: Boolean(session && id) });
  const payment = useQuery({ queryKey: ['payment', id], queryFn: () => fetchPaymentForOrder(session!.accessToken, id), enabled: Boolean(session && id) });
  const shipment = useQuery({ queryKey: ['shipment', id], queryFn: () => fetchShipmentForOrder(session!.accessToken, id), enabled: Boolean(session && id) });
  const refresh = async () => {
    await Promise.all([order.refetch(), payment.refetch(), shipment.refetch()]);
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
  };
  const cancel = useMutation({
    mutationFn: () => cancelOrder(session!.accessToken, id),
    onSuccess: () => void refresh(),
    onError: (error) => Alert.alert('Không hủy được đơn', error.message)
  });
  const received = useMutation({
    mutationFn: () => confirmOrderReceived(session!.accessToken, id),
    onSuccess: () => void refresh(),
    onError: (error) => Alert.alert('Không cập nhật được đơn', error.message)
  });

  if (!session) return <ScreenState title="Đăng nhập để xem đơn hàng" />;
  if (order.isPending) return <ScreenState title="Đang tải chi tiết đơn hàng..." />;
  if (order.isError || !order.data) return <ScreenState title="Không tải được đơn hàng" detail={order.error?.message} />;

  const data = order.data;
  const statusLabel = buyerOrderStatusLabel(data.status, payment.data?.status);
  const shipmentCode = shipmentDisplayCode(shipment.data);
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Chi tiết đơn mua</Text>
        <IconButton accessibilityLabel="Tải lại" color={colors.brand} name="refresh-outline" onPress={() => void refresh()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusCard}>
          <View style={styles.statusLine}><AppIcon color={colors.surface} name="car-outline" size={26} /><Text style={styles.status}>{statusLabel}</Text></View>
          <Text style={styles.meta}>{data.orderNumber}</Text>
          {shipmentCode ? <Text style={styles.statusMeta}>{shipmentCode}</Text> : null}
        </View>
        <View style={styles.card}>
          <Text style={styles.section}>Sản phẩm</Text>
          {data.items.map((item) => (
            <View key={item.id} style={styles.item}>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{item.productName}</Text>
                <Text style={styles.meta}>{item.sku} - x{item.quantity}</Text>
              </View>
              <Text>{Math.round(item.totalPrice).toLocaleString('vi-VN')} {data.currency}</Text>
              {data.status === 'DELIVERED' ? (
                <Text style={styles.action} onPress={() => router.push(`/reviews/new?orderId=${data.id}&productId=${item.productId}`)}>Đánh giá</Text>
              ) : null}
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.section}>Thanh toán</Text>
          <Text style={styles.meta}>Trạng thái: {payment.data?.status ?? 'Đang cập nhật'}</Text>
          {payment.data?.requiresActionUrl ? (
            <PrimaryButton onPress={() => void WebBrowser.openBrowserAsync(payment.data!.requiresActionUrl!)}>Tiếp tục thanh toán</PrimaryButton>
          ) : null}
          {data.paymentMethod === 'ONLINE' && data.status === 'PENDING' && payment.data?.status !== 'CAPTURED' ? (
            <PrimaryButton onPress={() => router.push(`/checkout/payment/${encodeURIComponent(data.id)}`)}>Tiếp tục thanh toán QR</PrimaryButton>
          ) : null}
          <View style={styles.moneyRow}><Text style={styles.meta}>Tạm tính</Text><Text>{formatMoney(data.subtotalAmount, data.currency)}</Text></View>
          <View style={styles.moneyRow}><Text style={styles.meta}>Phí vận chuyển</Text><Text>{formatMoney(data.shippingAmount, data.currency)}</Text></View>
          <View style={styles.moneyRow}><Text style={styles.meta}>Giảm giá</Text><Text>{formatMoney(data.discountAmount, data.currency)}</Text></View>
          <Text style={styles.total}>Tổng: {Math.round(data.totalAmount).toLocaleString('vi-VN')}đ</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.section}>Vận chuyển</Text>
          <View style={styles.moneyRow}>
            <Text style={styles.meta}>Trạng thái</Text>
            <Text>{shipment.data ? shipmentStatusLabel(shipment.data.status) : shipment.isPending ? 'Đang cập nhật' : 'Chưa tạo'}</Text>
          </View>
          {shipmentCode ? (
            <View style={styles.moneyRow}>
              <Text style={styles.meta}>Mã vận đơn</Text>
              <Text style={styles.shipmentCode}>{shipmentCode}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.actions}>
          {(data.status === 'PENDING' || data.status === 'CONFIRMED') ? (
            <PrimaryButton variant="outline" loading={cancel.isPending} onPress={() => cancel.mutate()}>Hủy đơn</PrimaryButton>
          ) : null}
          {data.status === 'SHIPPED' ? (
            <PrimaryButton loading={received.isPending} onPress={() => received.mutate()}>Đã nhận hàng</PrimaryButton>
          ) : null}
          {data.items[0] ? (
            <PrimaryButton variant="outline" onPress={() => router.push(`/products/${data.items[0].productId}`)}>Mua lại</PrimaryButton>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatMoney(amount: number, currency = 'VND'): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ${currency}`;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[2] },
  headerTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  content: { gap: spacing[3], padding: spacing[4] },
  statusCard: { backgroundColor: colors.brand, borderRadius: radius.md, gap: spacing[2], padding: spacing[4] },
  statusLine: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  status: { color: colors.surface, fontSize: 20, fontWeight: '800' },
  statusMeta: { color: colors.surface, fontSize: typography.body, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: typography.label },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing[3], padding: spacing[4] },
  section: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  item: { borderTopColor: colors.line, borderTopWidth: 1, gap: spacing[2], paddingTop: spacing[3] },
  flex: { flex: 1 },
  itemTitle: { color: colors.ink, fontWeight: '600' },
  action: { color: colors.brand, fontWeight: '700' },
  total: { color: colors.brand, fontSize: 17, fontWeight: '800', textAlign: 'right' },
  moneyRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  shipmentCode: { color: colors.ink, fontWeight: '700' },
  actions: { gap: spacing[2] }
});
