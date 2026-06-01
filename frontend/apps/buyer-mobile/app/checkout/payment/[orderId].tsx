import type { Payment, PaymentInstructions, PaymentStatus } from '@frontend/buyer-contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createPaymentIntent, fetchOrder, fetchPaymentForOrder } from '@/api/commerce';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const terminalStatuses = new Set<PaymentStatus>(['CAPTURED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK']);

export default function PaymentQrScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const id = orderId ?? '';
  const [nowMs, setNowMs] = useState(Date.now());

  const order = useQuery({
    queryKey: ['payment-order', id],
    queryFn: () => fetchOrder(session!.accessToken, id),
    enabled: Boolean(session && id)
  });
  const payment = useQuery({
    queryKey: ['payment-intent', id],
    queryFn: () => fetchPaymentForOrder(session!.accessToken, id),
    enabled: Boolean(session && id)
  });
  const createIntent = useMutation({
    mutationFn: async () => {
      if (!session || !order.data) {
        throw new Error('Chưa tải được thông tin đơn hàng');
      }
      return createPaymentIntent(session.accessToken, order.data, `mobile-payment-${Crypto.randomUUID()}`);
    },
    onSuccess: () => void payment.refetch(),
    onError: (error) => Alert.alert('Không tạo được mã QR', error.message)
  });

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session || !id || terminalStatuses.has(payment.data?.status as PaymentStatus)) {
      return;
    }
    const timer = setInterval(() => {
      void payment.refetch();
      void order.refetch();
    }, 2500);
    return () => clearInterval(timer);
  }, [id, order, payment, session]);

  const instructions = useMemo(() => normalizeInstructions(payment.data), [payment.data]);
  const secondsLeft = secondsUntil(instructions?.expiresAt ?? payment.data?.expiresAt, nowMs);
  const expired = payment.data?.status !== 'CAPTURED' && secondsLeft !== null && secondsLeft <= 0;

  if (!session) {
    return <ScreenState title="Đăng nhập để thanh toán" />;
  }
  if (order.isPending || payment.isPending) {
    return <ScreenState title="Đang tải mã thanh toán..." />;
  }
  if (order.isError || !order.data) {
    return <ScreenState title="Không tải được đơn hàng" detail={order.error?.message} />;
  }

  const status = paymentStatusLabel(payment.data?.status, expired);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Thanh toán QR</Text>
        <IconButton accessibilityLabel="Tải lại" color={colors.brand} name="refresh-outline" onPress={() => void payment.refetch()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View>
            <Text style={styles.orderNumber}>{order.data.orderNumber}</Text>
            <Text style={styles.meta}>{formatMoney(order.data.totalAmount, order.data.currency)}</Text>
          </View>
          <Text style={[styles.status, payment.data?.status === 'CAPTURED' ? styles.statusPaid : expired ? styles.statusExpired : null]}>
            {status}
          </Text>
        </View>

        {payment.data?.status === 'CAPTURED' ? (
          <View style={styles.successCard}>
            <AppIcon color={colors.success} name="checkmark-circle-outline" size={32} />
            <Text style={styles.successTitle}>Đã thanh toán</Text>
            <PrimaryButton onPress={() => router.replace(`/orders/${encodeURIComponent(id)}`)}>Xem đơn hàng</PrimaryButton>
          </View>
        ) : null}

        {instructions && payment.data?.status !== 'CAPTURED' ? (
          <>
            <View style={styles.qrCard}>
              <Image source={{ uri: instructions.qrImageUrl }} style={styles.qrImage} />
            </View>
            <PaymentRow label="Số tiền" value={formatMoney(instructions.amount, instructions.currency)} />
            <PaymentRow label="Nội dung chuyển khoản" value={instructions.transferDescription} share />
            <PaymentRow label="Ngân hàng" value={instructions.bankCode} />
            <PaymentRow label="Số tài khoản" value={instructions.accountNumber} share />
            {instructions.accountName ? <PaymentRow label="Tên tài khoản" value={instructions.accountName} /> : null}
            <View style={styles.card}>
              <Text style={styles.label}>Hết hạn sau</Text>
              <Text style={[styles.countdown, expired ? styles.statusExpired : null]}>{formatCountdown(secondsLeft)}</Text>
            </View>
          </>
        ) : null}

        {!instructions && payment.data?.status !== 'CAPTURED' ? (
          <View style={styles.card}>
            <Text style={styles.meta}>Thông tin thanh toán chưa sẵn sàng.</Text>
            {order.data.paymentMethod === 'ONLINE' ? (
              <PrimaryButton loading={createIntent.isPending} onPress={() => createIntent.mutate()}>
                Tạo lại mã QR
              </PrimaryButton>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton variant="outline" onPress={() => router.replace(`/orders/${encodeURIComponent(id)}`)}>Xem đơn hàng</PrimaryButton>
          <PrimaryButton variant="outline" onPress={() => router.replace('/orders')}>Danh sách đơn</PrimaryButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function normalizeInstructions(payment: Payment | null | undefined): PaymentInstructions | null {
  if (!payment) {
    return null;
  }
  if (payment.paymentInstructions) {
    return payment.paymentInstructions;
  }
  const raw = payment.metadata?.paymentInstructions;
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Partial<PaymentInstructions>;
  if (typeof candidate.qrImageUrl !== 'string' || typeof candidate.paymentCode !== 'string') {
    return null;
  }
  return candidate as PaymentInstructions;
}

function secondsUntil(rawDate: string | null | undefined, nowMs: number): number | null {
  if (!rawDate) {
    return null;
  }
  const target = new Date(rawDate).getTime();
  if (!Number.isFinite(target)) {
    return null;
  }
  return Math.max(0, Math.floor((target - nowMs) / 1000));
}

function formatCountdown(seconds: number | null): string {
  if (seconds === null) {
    return '--:--';
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function paymentStatusLabel(status: PaymentStatus | undefined, expired: boolean): string {
  if (status === 'CAPTURED') return 'Đã thanh toán';
  if (status === 'FAILED' || expired) return 'Đã hết hạn';
  if (status === 'CANCELLED') return 'Đã hủy';
  return 'Chờ chuyển khoản';
}

function formatMoney(amount: number, currency = 'VND'): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ${currency}`;
}

function PaymentRow({ label, value, share = false }: { label: string; value: string; share?: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Text selectable style={styles.value}>{value}</Text>
        {share ? (
          <Pressable onPress={() => void Share.share({ message: value })} style={styles.shareButton}>
            <Text style={styles.shareText}>Chia sẻ</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[2] },
  headerTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  content: { gap: spacing[3], padding: spacing[4], paddingBottom: spacing[6] },
  summary: { alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[4] },
  orderNumber: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: typography.body },
  status: { backgroundColor: colors.brandSoft, borderRadius: radius.sm, color: colors.brand, fontSize: typography.label, fontWeight: '800', paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  statusPaid: { color: colors.success },
  statusExpired: { color: colors.brand },
  successCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing[3], padding: spacing[5] },
  successTitle: { color: colors.success, fontSize: 18, fontWeight: '800' },
  qrCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing[4] },
  qrImage: { aspectRatio: 1, resizeMode: 'contain', width: '86%' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing[2], padding: spacing[4] },
  label: { color: colors.muted, fontSize: typography.label, fontWeight: '800', textTransform: 'uppercase' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], justifyContent: 'space-between' },
  value: { color: colors.ink, flex: 1, fontSize: typography.body, fontWeight: '700' },
  shareButton: { borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  shareText: { color: colors.brand, fontWeight: '700' },
  countdown: { color: colors.ink, fontSize: 22, fontWeight: '800' },
  actions: { gap: spacing[2] }
});
