import { useMutation, useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createOrder, createPaymentIntent } from '@/api/commerce';
import { fetchProfile } from '@/api/profile';
import { useAuth } from '@/auth/auth-context';
import { useCart } from '@/cart/cart-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { toCreateOrderInput } from '@/domain/cart';
import { validateProfileInput } from '@/domain/profile';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type PaymentMethod = 'COD' | 'ONLINE';

export default function CheckoutScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { state, totals, dispatch } = useCart();
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const orderKey = useRef(`mobile-order-${Crypto.randomUUID()}`);
  const paymentKey = useRef(`mobile-payment-${Crypto.randomUUID()}`);
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => fetchProfile(session!.accessToken), enabled: Boolean(session) });
  const submit = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('Đăng nhập để thanh toán');
      if (!profile.data) throw new Error('Chưa tải được địa chỉ giao hàng');
      validateProfileInput(profile.data);
      const order = await createOrder(session.accessToken, toCreateOrderInput(state, note, profile.data, paymentMethod), orderKey.current);
      if (paymentMethod === 'ONLINE' && order.totalAmount > 0) {
        await createPaymentIntent(session.accessToken, order, paymentKey.current);
      }
      return order;
    },
    onSuccess: (order) => {
      dispatch({ type: 'clear-selected' });
      router.replace(`/orders/${order.id}`);
    },
    onError: (error) => Alert.alert('Không đặt được hàng', error.message)
  });

  if (!session) {
    return <SafeAreaView style={styles.safeArea}><ScreenState title="Đăng nhập để thanh toán" /><PrimaryButton onPress={() => router.push('/login')}>Đăng nhập</PrimaryButton></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
        <Text style={styles.title}>Thanh toán</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
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
              <Text style={styles.itemName}>{item.title} x{item.quantity}</Text>
              <Text>{Math.round(item.price * item.quantity).toLocaleString('vi-VN')} {item.currency}</Text>
            </View>
          ))}
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
      <View style={styles.sticky}>
        <View>
          <Text style={styles.meta}>Tổng thanh toán</Text>
          <Text style={styles.total}>{Math.round(totals.amount).toLocaleString('vi-VN')} {totals.currency}</Text>
        </View>
        <PrimaryButton disabled={totals.count === 0 || !profile.data} loading={submit.isPending} onPress={() => submit.mutate()}>Đặt hàng</PrimaryButton>
      </View>
    </SafeAreaView>
  );
}

function formatDeliveryAddress(profile: { address: string; addressWard: string; addressProvince: string }): string {
  const parts = [profile.address, profile.addressWard, profile.addressProvince].map((item) => item.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Chưa có địa chỉ';
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  headerSpacer: { width: 38 },
  content: { gap: spacing[3], paddingBottom: 92 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  section: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  card: { backgroundColor: colors.surface, gap: spacing[2], padding: spacing[4] },
  sectionLine: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  meta: { color: colors.muted, fontSize: typography.label },
  row: { flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  itemName: { flex: 1 },
  paymentOptions: { gap: spacing[2] },
  paymentOption: { borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, padding: spacing[3] },
  paymentOptionSelected: { borderColor: colors.brand, backgroundColor: '#fff7ed' },
  paymentText: { color: colors.ink, fontSize: typography.body },
  paymentTextSelected: { color: colors.brand, fontWeight: '800' },
  input: { borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, minHeight: 72, padding: spacing[3] },
  sticky: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: 1, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', left: 0, padding: spacing[3], position: 'absolute', right: 0 },
  total: { color: colors.brand, fontSize: 16, fontWeight: '800' }
});
