import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Order, OrderStatus } from '@frontend/buyer-contracts';
import { fetchProductDetail } from '@/api/buyer';
import { fetchOrders, fetchShipmentForOrder } from '@/api/commerce';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { buyerOrderListStatusLabel } from '@/domain/orders';
import { shipmentDisplayCode } from '@/domain/shipping';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

type OrderFilterTab = 'ALL' | 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

const filters: Array<{ label: string; value: OrderFilterTab }> = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Chờ thanh toán', value: 'PENDING' },
  { label: 'Vận chuyển', value: 'PROCESSING' },
  { label: 'Chờ giao hàng', value: 'SHIPPED' },
  { label: 'Hoàn thành', value: 'DELIVERED' },
  { label: 'Đã hủy', value: 'CANCELLED' },
  { label: 'Trả hàng/Hoàn tiền', value: 'REFUNDED' },
];

function formatVnd(value: number | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0đ';
  return `${Math.round(num).toLocaleString('vi-VN')}đ`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${d.toLocaleDateString('vi-VN')}`;
  } catch {
    return iso;
  }
}

export default function OrdersScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();

  const [activeTab, setActiveTab] = useState<OrderFilterTab>(
    (params.status as OrderFilterTab) || 'ALL'
  );
  const [searchTerm, setSearchTerm] = useState('');

  const statusParam: OrderStatus | undefined =
    activeTab === 'ALL' || activeTab === 'REFUNDED' ? undefined : (activeTab as OrderStatus);

  const orders = useQuery({
    queryKey: ['orders', statusParam],
    queryFn: () => fetchOrders(session!.accessToken, statusParam),
    enabled: Boolean(session)
  });

  const filteredOrders = useMemo(() => {
    if (!orders.data) return [];
    let list = orders.data;
    if (activeTab === 'REFUNDED') {
      list = list.filter((order) => order.status === 'CANCELLED' || order.status === 'FAILED');
    }
    if (!searchTerm.trim()) return list;
    const q = searchTerm.trim().toLowerCase();
    return list.filter((order) => {
      const matchNumber = order.orderNumber?.toLowerCase().includes(q) || order.id?.toLowerCase().includes(q);
      const matchItems = order.items.some((item) =>
        item.productName?.toLowerCase().includes(q) || item.sku?.toLowerCase().includes(q)
      );
      return matchNumber || matchItems;
    });
  }, [orders.data, activeTab, searchTerm]);

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <IconButton accessibilityLabel="Quay lại" color={colors.ink} name="arrow-back-outline" onPress={() => router.back()} />
          <Text style={styles.title}>Theo Dõi Đơn Mua</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScreenState title="Đăng nhập để xem đơn mua" detail="Theo dõi tình trạng vận chuyển và đơn hàng của bạn." />
        <View style={{ padding: spacing[4] }}>
          <PrimaryButton onPress={() => router.push('/login')}>Đăng nhập ngay</PrimaryButton>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.ink} name="arrow-back-outline" onPress={() => router.back()} />
        <View style={styles.headerTitleCol}>
          <Text style={styles.title}>Theo Dõi Đơn Mua</Text>
          <Text style={styles.subTitle}>Trạng thái đơn hàng và thao tác mua sắm</Text>
        </View>
        <IconButton accessibilityLabel="Tải lại" color={colors.brand} name="refresh-outline" onPress={() => void orders.refetch()} />
      </View>

      {/* Search Input matching web */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <AppIcon color={colors.muted} name="search-outline" size={18} />
          <TextInput
            clearButtonMode="while-editing"
            onChangeText={setSearchTerm}
            placeholder="Tìm theo mã đơn, tên sản phẩm..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={searchTerm}
          />
        </View>
      </View>

      {/* Filter Tabs matching web */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} style={styles.filterBar}>
        {filters.map((filter) => {
          const isSelected = filter.value === activeTab;
          return (
            <Pressable
              key={filter.label}
              onPress={() => setActiveTab(filter.value)}
              style={[styles.filter, isSelected && styles.selected]}
            >
              <Text style={[styles.filterText, isSelected && styles.selectedText]}>{filter.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {orders.isPending ? (
        <View style={styles.feedback}><ScreenState title="Đang tải đơn hàng..." /></View>
      ) : null}
      {orders.isError ? (
        <View style={styles.feedback}><ScreenState title="Không tải được đơn hàng" detail={orders.error.message} /></View>
      ) : null}

      {orders.data ? (
        <FlatList
          contentContainerStyle={[styles.list, filteredOrders.length === 0 && styles.emptyList]}
          data={filteredOrders}
          keyExtractor={(order) => order.id}
          ListEmptyComponent={
            <ScreenState
              title={searchTerm ? 'Không tìm thấy đơn phù hợp' : 'Chưa có đơn hàng trong mục này'}
              detail={searchTerm ? 'Vui lòng kiểm tra lại từ khóa tìm kiếm' : undefined}
            />
          }
          renderItem={({ item: order }) => (
            <OrderCard
              accessToken={session.accessToken}
              onPress={() => router.push(`/orders/${order.id}`)}
              order={order}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : null}
    </SafeAreaView>
  );
}

function OrderCard({ accessToken, order, onPress }: { accessToken: string; order: Order; onPress: () => void }) {
  const item = order.items[0];
  const product = useQuery({
    queryKey: ['order-product-preview', item?.productId],
    queryFn: () => fetchProductDetail(item!.productId),
    enabled: Boolean(item?.productId)
  });
  const shipment = useQuery({
    queryKey: ['order-shipment-preview', order.id],
    queryFn: () => fetchShipmentForOrder(accessToken, order.id),
    enabled: Boolean(accessToken && order.id)
  });

  const image = product.data?.image;
  const productName = product.data?.title ?? item?.productName ?? 'Sản phẩm';
  const shipmentCode = shipmentDisplayCode(shipment.data);
  const statusLabel = buyerOrderListStatusLabel(order.status);
  const isDelivered = order.status === 'DELIVERED';
  const isCancelled = order.status === 'CANCELLED';

  return (
    <Pressable onPress={onPress} style={styles.card}>
      {/* Header: Shop badge + Status label */}
      <View style={styles.cardHeader}>
        <View style={styles.shop}>
          <View style={styles.mallBadge}>
            <Text style={styles.mallText}>Mall</Text>
          </View>
          <Text style={styles.shopName}>Market Mall</Text>
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.status,
            isCancelled && styles.statusCancelled,
            isDelivered && styles.statusDelivered
          ]}
        >
          {statusLabel}
        </Text>
      </View>

      {/* Meta sub-bar: Mã đơn & Vận chuyển */}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Mã: <Text style={styles.metaTextBold}>{order.orderNumber || order.id.slice(0, 8)}</Text></Text>
        <Text style={styles.metaDot}>•</Text>
        <Text style={styles.metaText}>VC: {shipmentCode || 'Chờ xử lý'}</Text>
      </View>

      {/* Product item */}
      {item ? (
        <View style={styles.product}>
          {image ? (
            <Image
              source={{ uri: normalizeRemoteAssetUrl(image, process.env.EXPO_PUBLIC_API_BASE_URL) }}
              style={styles.productImage}
            />
          ) : (
            <View style={styles.placeholder}>
              <AppIcon color={colors.brand} name="cube-outline" size={28} />
            </View>
          )}
          <View style={styles.productBody}>
            <Text numberOfLines={2} style={styles.productName}>{productName}</Text>
            {item.sku ? <Text numberOfLines={1} style={styles.productSku}>SKU: {item.sku}</Text> : null}
            <Text style={styles.productQty}>Số lượng: x{item.quantity}</Text>
          </View>
          <View style={styles.priceCol}>
            <Text style={styles.itemPrice}>{formatVnd(item.unitPrice)}</Text>
          </View>
        </View>
      ) : null}

      {order.items.length > 1 ? (
        <Text style={styles.moreItemsText}>+ {order.items.length - 1} sản phẩm khác</Text>
      ) : null}

      {/* Footer: Date + Total amount + Action button */}
      <View style={styles.cardFooter}>
        <Text style={styles.orderDate}>Đặt lúc: {formatDate(order.createdAt)}</Text>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Thành tiền:</Text>
          <Text style={styles.totalAmount}>{formatVnd(order.totalAmount)}</Text>
        </View>
      </View>

      <View style={styles.buttonLine}>
        <View />
        <View style={styles.actionButton}>
          <Text style={styles.actionButtonText}>{isDelivered ? 'Mua lại' : 'Xem chi tiết'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2]
  },
  headerTitleCol: { alignItems: 'center', flex: 1 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  subTitle: { color: colors.muted, fontSize: 11, marginTop: 1 },
  searchContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2]
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: 7
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    padding: 0
  },
  filterBar: { backgroundColor: colors.surface, flexGrow: 0, height: 46 },
  filters: { alignItems: 'stretch', borderBottomColor: colors.line, borderBottomWidth: 1, paddingHorizontal: spacing[2] },
  filter: { justifyContent: 'center', marginHorizontal: spacing[2], paddingHorizontal: spacing[2] },
  selected: { borderBottomColor: colors.brand, borderBottomWidth: 2 },
  filterText: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  selectedText: { color: colors.brand, fontWeight: '700' },
  feedback: { flex: 1, justifyContent: 'center' },
  list: { gap: spacing[3], padding: spacing[3], paddingBottom: spacing[5] },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing[2],
    padding: spacing[3]
  },
  cardHeader: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing[2]
  },
  shop: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  mallBadge: { backgroundColor: colors.brand, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  mallText: { color: colors.surface, fontSize: 10, fontWeight: '800' },
  shopName: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  status: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  statusCancelled: { color: colors.muted },
  statusDelivered: { color: colors.brandDark },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    paddingVertical: 2
  },
  metaText: { color: colors.muted, fontSize: 12 },
  metaTextBold: { color: colors.ink, fontWeight: '600' },
  metaDot: { color: colors.line },
  product: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[3], marginTop: spacing[1] },
  placeholder: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.sm,
    height: 64,
    justifyContent: 'center',
    width: 64
  },
  productImage: { backgroundColor: colors.line, borderRadius: radius.sm, height: 64, width: 64 },
  productBody: { flex: 1, gap: 3 },
  productName: { color: colors.ink, fontSize: 14, fontWeight: '500', lineHeight: 18 },
  productSku: { color: colors.muted, fontSize: 11 },
  productQty: { color: colors.muted, fontSize: 12 },
  priceCol: { alignItems: 'flex-end', justifyContent: 'center' },
  itemPrice: { color: colors.brand, fontSize: 14, fontWeight: '700' },
  moreItemsText: { color: colors.muted, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  cardFooter: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[2]
  },
  orderDate: { color: colors.muted, fontSize: 11 },
  totalRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] },
  totalLabel: { color: colors.ink, fontSize: 12 },
  totalAmount: { color: colors.brand, fontSize: 17, fontWeight: '800' },
  buttonLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2
  },
  actionButton: {
    borderColor: colors.brand,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: 7
  },
  actionButtonText: { color: colors.brand, fontSize: 13, fontWeight: '700' }
});
