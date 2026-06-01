import { useMutation, useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createOrder, createPaymentIntent, quoteShipping } from '@/api/commerce';
import { fetchProfile } from '@/api/profile';
import { useAuth } from '@/auth/auth-context';
import { useCart } from '@/cart/cart-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { selectedCartItems, toCreateOrderInputs } from '@/domain/cart';
import { validateProfileInput } from '@/domain/profile';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type PaymentMethod = 'COD' | 'ONLINE';

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const { state, totals, dispatch } = useCart();
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const orderKeys = useRef(new Map<string, string>());
  const paymentKeys = useRef(new Map<string, string>());
  const selectedItems = useMemo(() => selectedCartItems(state), [state]);
  const selectedSellerIds = useMemo(
    () => Array.from(new Set(selectedItems.map((item) => item.sellerId.trim()).filter(Boolean))),
    [selectedItems]
  );
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => fetchProfile(session!.accessToken), enabled: Boolean(session) });
  const shippingQuote = useQuery({
    queryKey: ['checkout-shipping', selectedSellerIds.join('|'), profile.data?.addressProvince],
    queryFn: () =>
      quoteShipping(session!.accessToken, {
        sellerIds: selectedSellerIds,
        destinationProvince: profile.data!.addressProvince
      }),
    enabled: Boolean(session && profile.data?.addressProvince && selectedSellerIds.length > 0)
  });
  const shippingAmountBySeller = useMemo(() => {
    const amounts: Record<string, number> = {};
    for (const item of shippingQuote.data?.items ?? []) {
      amounts[item.sellerId] = item.shippingAmount;
    }
    return amounts;
  }, [shippingQuote.data]);
  const shippingTotal = useMemo(
    () => selectedItems.reduce((total, item) => total + (shippingAmountBySeller[item.sellerId] ?? 0), 0),
    [selectedItems, shippingAmountBySeller]
  );
  const payableTotal = totals.amount + shippingTotal;
  const allShippingQuoted =
    selectedSellerIds.length > 0 && selectedSellerIds.every((sellerId) => Number.isFinite(shippingAmountBySeller[sellerId]));
  const shippingReady = selectedItems.length > 0 && allShippingQuoted && Boolean(shippingQuote.data) && !shippingQuote.isError;
  const submit = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Đăng nhập để thanh toán');
      if (!profile.data) throw new Error('Chưa tải được địa chỉ giao hàng');
      validateProfileInput(profile.data);
      if (!shippingReady) throw new Error('Chưa tính được phí vận chuyển');
      const inputs = toCreateOrderInputs(state, note, profile.data, paymentMethod, shippingAmountBySeller);
      const orders = [];
      let paymentWarning = false;
      for (const [index, input] of inputs.entries()) {
        const itemKey = selectedItems[index].key;
        const order = await createOrder(session.accessToken, input, getLineIdempotencyKey(orderKeys.current, itemKey, 'mobile-order'));
        if (paymentMethod === 'ONLINE' && order.totalAmount > 0) {
          try {
            await createPaymentIntent(session.accessToken, order, getLineIdempotencyKey(paymentKeys.current, itemKey, 'mobile-payment'));
          } catch {
            paymentWarning = true;
          }
        }
        orders.push(order);
      }
      return { orders, paymentWarning };
    },
    onSuccess: ({ orders, paymentWarning }) => {
      dispatch({ type: 'clear-selected' });
      if (paymentMethod === 'ONLINE' && orders[0]) {
        if (paymentWarning) {
          Alert.alert('Đơn đã tạo', 'Chưa khởi tạo được QR tự động. Mở màn thanh toán để thử lại.');
        } else if (orders.length > 1) {
          Alert.alert('Đã tạo nhiều đơn', 'Ứng dụng sẽ mở mã QR của đơn đầu tiên.');
        }
        router.replace(`/checkout/payment/${orders[0].id}`);
        return;
      }
      if (orders.length === 1) {
        router.replace(`/orders/${orders[0].id}`);
        return;
      }
      Alert.alert('Đã đặt hàng', `Đã tạo ${orders.length} đơn hàng riêng.`);
      router.replace('/orders');
    },
    onError: (error) => Alert.alert('Không đặt được hàng', error.message)
  });

  if (!session) {
    return <SafeAreaView style={styles.safeArea}><ScreenState title="Đăng nhập để thanh toán" /><PrimaryButton onPress={() => router.push('/login')}>Đăng nhập</PrimaryButton></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.header}>
          <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
          <Text style={styles.title}>Thanh toán</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 92 + Math.max(insets.bottom, spacing[3]) }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <View style={styles.sectionLine}><AppIcon color={colors.brand} name="location-outline" /><Text style={styles.section}>Địa chỉ nhận hàng</Text></View>
            {profile.isPending ? <Text style={styles.meta}>Đang tải hồ sơ...</Text> : null}
            {profile.data ? (
              <>
                <Text>{profile.data.name || session.user.email}</Text>
                <Text>{profile.data.phone || 'Chưa có số điện thoại'}</Text>
                <Text>{formatDeliveryAddress(profile.data)}</Text>
                <PrimaryButton variant="outline" onPress={() => router.push('/profile')}>Cập nhật địa chỉ</PrimaryButton>
              </>
            ) : null}
          </View>
          <View style={styles.card}>
            <View style={styles.sectionLine}><AppIcon color={colors.brand} name="bag-handle-outline" /><Text style={styles.section}>Sản phẩm ({totals.count})</Text></View>
            {state.items.filter((item) => item.selected).map((item) => (
              <View key={item.key} style={styles.row}>
                <View style={styles.itemName}>
                  <Text>{item.title} x{item.quantity}</Text>
                  <Text style={styles.meta}>Phí vận chuyển: {formatMoney(shippingAmountBySeller[item.sellerId] ?? 0, item.currency)}</Text>
                </View>
                <Text>{formatMoney(item.price * item.quantity, item.currency)}</Text>
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <View style={styles.sectionLine}><AppIcon color={colors.brand} name="receipt-outline" /><Text style={styles.section}>Tóm tắt thanh toán</Text></View>
            <View style={styles.row}><Text style={styles.meta}>Tạm tính</Text><Text>{formatMoney(totals.amount, totals.currency)}</Text></View>
            <View style={styles.row}><Text style={styles.meta}>Phí vận chuyển</Text><Text>{formatMoney(shippingTotal, totals.currency)}</Text></View>
            {shippingQuote.isPending ? <Text style={styles.meta}>Đang tính phí vận chuyển...</Text> : null}
            {shippingQuote.isError ? <Text style={styles.errorText}>Chưa tính được phí vận chuyển. Vui lòng kiểm tra địa chỉ người bán và người nhận.</Text> : null}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.section}>Tổng thanh toán</Text><Text style={styles.total}>{formatMoney(payableTotal, totals.currency)}</Text></View>
          </View>
          <View style={styles.card}>
            <View style={styles.sectionLine}><AppIcon color={colors.brand} name="card-outline" /><Text style={styles.section}>Phương thức thanh toán</Text></View>
            <View style={styles.paymentOptions}>
              <Pressable
                onPress={() => setPaymentMethod('COD')}
                style={[styles.paymentOption, paymentMethod === 'COD' && styles.paymentOptionSelected]}
              >
                <Text style={[styles.paymentText, paymentMethod === 'COD' && styles.paymentTextSelected]}>Thanh toán khi nhận hàng (COD)</Text>
              </Pressable>
              <Pressable
                onPress={() => setPaymentMethod('ONLINE')}
                style={[styles.paymentOption, paymentMethod === 'ONLINE' && styles.paymentOptionSelected]}
              >
                <Text style={[styles.paymentText, paymentMethod === 'ONLINE' && styles.paymentTextSelected]}>Thanh toán online</Text>
              </Pressable>
            </View>
            <TextInput multiline onChangeText={setNote} placeholder="Lời nhắn cho người bán" style={styles.input} value={note} />
          </View>
        </ScrollView>
        <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          <View>
            <Text style={styles.meta}>Tổng thanh toán</Text>
            <Text style={styles.total}>{formatMoney(payableTotal, totals.currency)}</Text>
          </View>
          <PrimaryButton disabled={totals.count === 0 || !profile.data || !shippingReady} loading={submit.isPending} onPress={() => submit.mutate()}>Đặt hàng</PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatMoney(amount: number, currency = 'VND'): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ${currency}`;
}

function formatDeliveryAddress(profile: { address: string; addressWard: string; addressProvince: string }): string {
  const parts = [profile.address, profile.addressWard, profile.addressProvince].map((item) => item.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Chưa có địa chỉ';
}

function getLineIdempotencyKey(keys: Map<string, string>, itemKey: string, prefix: string): string {
  const existing = keys.get(itemKey);
  if (existing) {
    return existing;
  }
  const key = `${prefix}-${Crypto.randomUUID()}`;
  keys.set(itemKey, key);
  return key;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  headerSpacer: { width: 38 },
  content: { gap: spacing[3], paddingBottom: 92 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  section: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  card: { backgroundColor: colors.surface, gap: spacing[2], padding: spacing[4] },
  sectionLine: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  meta: { color: colors.muted, fontSize: typography.label },
  row: { flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  itemName: { flex: 1, gap: 2 },
  paymentOptions: { gap: spacing[2] },
  paymentOption: { borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, padding: spacing[3] },
  paymentOptionSelected: { borderColor: colors.brand, backgroundColor: '#fff7ed' },
  paymentText: { color: colors.ink, fontSize: typography.body },
  paymentTextSelected: { color: colors.brand, fontWeight: '800' },
  input: { borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, minHeight: 72, padding: spacing[3] },
  divider: { backgroundColor: colors.line, height: 1 },
  errorText: { color: colors.brand, fontSize: typography.label },
  sticky: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: 1, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', left: 0, padding: spacing[3], position: 'absolute', right: 0 },
  total: { color: colors.brand, fontSize: 16, fontWeight: '800' }
});
