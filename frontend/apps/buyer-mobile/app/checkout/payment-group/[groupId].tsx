import type { PaymentGroup, PaymentInstructions, PaymentStatus } from '@frontend/buyer-contracts';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPaymentGroup } from '@/api/commerce';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const terminalStatuses = new Set<PaymentStatus>(['CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED', 'CHARGEBACK']);

export default function PaymentGroupQrScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const id = groupId ?? '';
  const [nowMs, setNowMs] = useState(Date.now());
  const group = useQuery({
    queryKey: ['payment-group', id],
    queryFn: () => fetchPaymentGroup(session!.accessToken, id),
    enabled: Boolean(session && id)
  });

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!session || !id || terminalStatuses.has(group.data?.status as PaymentStatus)) return;
    const timer = setInterval(() => void group.refetch(), 2500);
    return () => clearInterval(timer);
  }, [group, id, session]);

  const instructions = useMemo(() => normalizeInstructions(group.data), [group.data]);
  const secondsLeft = secondsUntil(instructions?.expiresAt ?? group.data?.expiresAt, nowMs);
  const expired = group.data?.status !== 'CAPTURED' && secondsLeft !== null && secondsLeft <= 0;

  if (!session) return <ScreenState title="Đăng nhập để thanh toán" />;
  if (group.isPending) return <ScreenState title="Đang tải mã thanh toán..." />;
  if (group.isError || !group.data) return <ScreenState title="Không tải được nhóm thanh toán" detail={group.error?.message} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Thanh toán QR</Text>
        <IconButton accessibilityLabel="Tải lại" color={colors.brand} name="refresh-outline" onPress={() => void group.refetch()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View>
            <Text style={styles.title}>{group.data.orderIds.length} đơn hàng</Text>
            <Text style={styles.meta}>Một lần chuyển khoản cho toàn bộ đơn</Text>
          </View>
          <Text style={[styles.status, group.data.status === 'CAPTURED' ? styles.paid : expired ? styles.expired : null]}>
            {group.data.status === 'CAPTURED' ? 'Đã thanh toán' : expired || group.data.status === 'FAILED' ? 'Đã hết hạn' : 'Chờ chuyển khoản'}
          </Text>
        </View>

        {group.data.status === 'CAPTURED' ? (
          <View style={styles.successCard}>
            <AppIcon color={colors.success} name="checkmark-circle-outline" size={36} />
            <Text style={styles.successTitle}>Đã thanh toán {group.data.orderIds.length} đơn</Text>
          </View>
        ) : null}

        {instructions && group.data.status !== 'CAPTURED' ? (
          <>
            <View style={styles.qrCard}><Image source={{ uri: instructions.qrImageUrl }} style={styles.qrImage} /></View>
            <PaymentRow label="Tổng tiền" value={formatMoney(group.data.amount, group.data.currency)} />
            <PaymentRow label="Nội dung chuyển khoản" value={instructions.transferDescription} share />
            <PaymentRow label="Ngân hàng" value={instructions.bankCode} />
            <PaymentRow label="Số tài khoản" value={instructions.accountNumber} share />
            <View style={styles.card}>
              <Text style={styles.label}>Hết hạn sau</Text>
              <Text style={[styles.countdown, expired ? styles.expired : null]}>{formatCountdown(secondsLeft)}</Text>
            </View>
          </>
        ) : null}

        <PrimaryButton variant="outline" onPress={() => router.replace('/orders')}>Danh sách đơn</PrimaryButton>
      </ScrollView>
    </SafeAreaView>
  );
}

function normalizeInstructions(group: PaymentGroup | undefined): PaymentInstructions | null {
  if (group?.paymentInstructions) return group.paymentInstructions;
  const raw = group?.metadata?.paymentInstructions as Partial<PaymentInstructions> | undefined;
  return raw && typeof raw.qrImageUrl === 'string' && typeof raw.paymentCode === 'string' ? raw as PaymentInstructions : null;
}

function secondsUntil(raw: string | null | undefined, now: number): number | null {
  if (!raw) return null;
  const target = new Date(raw).getTime();
  return Number.isFinite(target) ? Math.max(0, Math.floor((target - now) / 1000)) : null;
}

function formatCountdown(seconds: number | null): string {
  if (seconds === null) return '--:--';
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatMoney(amount: number, currency: string): string {
  return `${Math.round(amount).toLocaleString('vi-VN')} ${currency}`;
}

function PaymentRow({ label, value, share = false }: { label: string; value: string; share?: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>{value}</Text>
      {share ? <PrimaryButton variant="outline" onPress={() => void Share.share({ message: value })}>Chia sẻ</PrimaryButton> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[2] },
  headerTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  content: { gap: spacing[3], padding: spacing[4], paddingBottom: spacing[6] },
  summary: { alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[4] },
  title: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: typography.body },
  status: { backgroundColor: colors.brandSoft, borderRadius: radius.sm, color: colors.brand, fontWeight: '800', paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  paid: { color: colors.success },
  expired: { color: colors.brand },
  successCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing[3], padding: spacing[5] },
  successTitle: { color: colors.success, fontSize: 18, fontWeight: '800' },
  qrCard: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing[4] },
  qrImage: { aspectRatio: 1, resizeMode: 'contain', width: '86%' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, gap: spacing[2], padding: spacing[4] },
  label: { color: colors.muted, fontSize: typography.label, fontWeight: '800', textTransform: 'uppercase' },
  value: { color: colors.ink, fontSize: typography.body, fontWeight: '700' },
  countdown: { color: colors.ink, fontSize: 22, fontWeight: '800' }
});
