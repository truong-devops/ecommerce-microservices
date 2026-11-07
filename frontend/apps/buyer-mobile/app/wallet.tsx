import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createBuyerPayout,
  fetchBuyerBankAccount,
  fetchBuyerPayouts,
  fetchBuyerTransactions,
  fetchBuyerWallet,
  updateBuyerBankAccount,
  type BuyerRefundPayout,
  type BuyerWalletBankAccount,
  type BuyerWalletTransaction
} from '@/api/wallet';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const BANK_OPTIONS = [
  { code: 'VCB', name: 'Vietcombank' },
  { code: 'TCB', name: 'Techcombank' },
  { code: 'MB', name: 'MB Bank' },
  { code: 'ACB', name: 'ACB' },
  { code: 'BIDV', name: 'BIDV' },
  { code: 'VTB', name: 'VietinBank' },
  { code: 'VPB', name: 'VPBank' },
  { code: 'TPB', name: 'TPBank' },
  { code: 'STB', name: 'Sacombank' },
  { code: 'VIB', name: 'VIB' }
] as const;

function formatVnd(value: number | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0đ';
  return `${Math.round(num).toLocaleString('vi-VN')}đ`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

function payoutStatusTag(status: string) {
  switch (status) {
    case 'SUCCEEDED':
      return { label: 'Thành công', color: '#16a34a', bg: '#f0fdf4' };
    case 'PROCESSING':
      return { label: 'Đang chuyển', color: '#ea580c', bg: '#fff7ed' };
    case 'FAILED':
      return { label: 'Thất bại', color: '#dc2626', bg: '#fef2f2' };
    case 'CANCELLED':
      return { label: 'Đã hủy', color: '#64748b', bg: '#f8fafc' };
    case 'REQUESTED':
    default:
      return { label: 'Đã tiếp nhận', color: colors.brand, bg: colors.brandSoft };
  }
}

export default function WalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const [activeTab, setActiveTab] = useState<'payouts' | 'transactions'>('payouts');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bankCode, setBankCode] = useState('TCB');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');

  const token = session?.accessToken;

  const walletQuery = useQuery({
    queryKey: ['buyer-wallet'],
    queryFn: () => fetchBuyerWallet(token!),
    enabled: Boolean(token)
  });

  const bankQuery = useQuery({
    queryKey: ['buyer-bank-account'],
    queryFn: () => fetchBuyerBankAccount(token!),
    enabled: Boolean(token)
  });

  const payoutsQuery = useQuery({
    queryKey: ['buyer-payouts'],
    queryFn: () => fetchBuyerPayouts(token!),
    enabled: Boolean(token)
  });

  const transactionsQuery = useQuery({
    queryKey: ['buyer-wallet-transactions'],
    queryFn: () => fetchBuyerTransactions(token!),
    enabled: Boolean(token)
  });

  const isRefreshing = walletQuery.isRefetching || bankQuery.isRefetching;
  const onRefresh = () => {
    void Promise.all([
      walletQuery.refetch(),
      bankQuery.refetch(),
      payoutsQuery.refetch(),
      transactionsQuery.refetch()
    ]);
  };

  const saveBank = useMutation({
    mutationFn: () => {
      const code = bankCode.trim().toUpperCase();
      const num = accountNumber.replace(/\D/g, '');
      const name = accountHolderName.trim().toUpperCase();

      if (!code) throw new Error('Vui lòng chọn ngân hàng');
      if (num.length < 6 || num.length > 20) throw new Error('Số tài khoản phải gồm 6–20 chữ số');
      if (name.length < 2) throw new Error('Vui lòng nhập tên chủ tài khoản');

      return updateBuyerBankAccount(token!, { bankCode: code, accountNumber: num, accountHolderName: name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyer-bank-account'] });
      setDialogOpen(false);
      Alert.alert('Thành công', 'Đã lưu tài khoản ngân hàng nhận tiền hoàn.');
    },
    onError: (err: Error) => {
      Alert.alert('Lỗi', err.message || 'Không thể lưu tài khoản ngân hàng');
    }
  });

  const withdraw = useMutation({
    mutationFn: () => {
      const wallet = walletQuery.data;
      if (!wallet || wallet.availableAmount <= 0) {
        throw new Error('Số dư khả dụng không đủ');
      }
      const amountToWithdraw = withdrawAmount.trim() ? Number(withdrawAmount) : wallet.availableAmount;
      if (!amountToWithdraw || amountToWithdraw <= 0 || amountToWithdraw > wallet.availableAmount) {
        throw new Error('Số tiền rút không hợp lệ');
      }
      return createBuyerPayout(token!, amountToWithdraw);
    },
    onSuccess: () => {
      setWithdrawAmount('');
      queryClient.invalidateQueries({ queryKey: ['buyer-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-payouts'] });
      Alert.alert('Thành công', 'Đã tạo yêu cầu rút tiền về ngân hàng.');
    },
    onError: (err: Error) => {
      Alert.alert('Lỗi', err.message || 'Không thể tạo yêu cầu rút tiền');
    }
  });

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <IconButton accessibilityLabel="Quay lại" color={colors.ink} name="arrow-back-outline" onPress={() => router.back()} />
          <Text style={styles.headerTitle}>Ví eMall & Hoàn tiền</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScreenState title="Vui lòng đăng nhập" detail="Đăng nhập để xem số dư ví và theo dõi tiền hoàn." />
        <View style={styles.actionPadding}>
          <PrimaryButton onPress={() => router.push('/login')}>Đăng nhập ngay</PrimaryButton>
        </View>
      </SafeAreaView>
    );
  }

  const wallet = walletQuery.data;
  const bank = bankQuery.data;
  const availableAmount = wallet?.availableAmount ?? 0;
  const pendingAmount = wallet?.payoutPendingAmount ?? 0;
  const totalPaidOut = wallet?.totalPaidOut ?? 0;

  const openEditBank = () => {
    if (bank) {
      setBankCode(bank.bankCode);
      setAccountNumber('');
      setAccountHolderName(bank.accountHolderName);
    }
    setDialogOpen(true);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.ink} name="arrow-back-outline" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Ví eMall & Hoàn tiền</Text>
        <IconButton accessibilityLabel="Tải lại" color={colors.brand} name="refresh-outline" onPress={onRefresh} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing[4]) + 20 }]}
        refreshControl={<RefreshControl onRefresh={onRefresh} refreshing={isRefreshing} tintColor={colors.brand} />}
      >
        <View style={styles.bannerInfo}>
          <AppIcon color={colors.brand} name="information-circle-outline" size={18} />
          <Text style={styles.bannerInfoText}>
            Tiền của đơn hàng bị huỷ hoặc trả hàng sẽ được lưu tại đây trước khi chuyển về ngân hàng của bạn.
          </Text>
        </View>

        {/* 3 Metric Cards */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, styles.metricCardPrimary]}>
            <View style={styles.metricDotRow}>
              <View style={[styles.metricDot, { backgroundColor: colors.brand }]} />
              <Text style={styles.metricLabel}>Có thể rút</Text>
            </View>
            <Text numberOfLines={1} style={[styles.metricValue, { color: colors.brand }]}>
              {formatVnd(availableAmount)}
            </Text>
            <Text style={styles.metricSub}>Sẵn sàng rút về</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricDotRow}>
              <View style={[styles.metricDot, { backgroundColor: '#64748b' }]} />
              <Text style={styles.metricLabel}>Đang chuyển</Text>
            </View>
            <Text numberOfLines={1} style={styles.metricValue}>
              {formatVnd(pendingAmount)}
            </Text>
            <Text style={styles.metricSub}>Admin đang gửi</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricDotRow}>
              <View style={[styles.metricDot, { backgroundColor: '#64748b' }]} />
              <Text style={styles.metricLabel}>Đã nhận</Text>
            </View>
            <Text numberOfLines={1} style={styles.metricValue}>
              {formatVnd(totalPaidOut)}
            </Text>
            <Text style={styles.metricSub}>Đã về tài khoản</Text>
          </View>
        </View>

        {/* Metallic Bank Card */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Tài khoản nhận tiền hoàn</Text>
          {bank ? (
            <Pressable hitSlop={8} onPress={openEditBank}>
              <Text style={styles.linkText}>Thay đổi</Text>
            </Pressable>
          ) : null}
        </View>

        {bank ? (
          <View style={styles.bankCardWrapper}>
            <View style={styles.bankCard}>
              <View style={styles.bankCardTop}>
                <View>
                  <Text style={styles.bankCardType}>TÀI KHOẢN NGÂN HÀNG</Text>
                  <Text style={styles.bankCardName}>
                    {BANK_OPTIONS.find((b) => b.code === bank.bankCode)?.name || bank.bankCode}
                  </Text>
                </View>
                <View style={styles.bankPill}>
                  <Text style={styles.bankPillText}>{bank.bankCode}</Text>
                </View>
              </View>

              <Text style={styles.bankCardNumber}>
                {bank.maskedAccountNumber ? bank.maskedAccountNumber.replace('****', '•••• ') : '•••• •••• ••••'}
              </Text>

              <View style={styles.bankCardBottom}>
                <View>
                  <Text style={styles.bankCardHolderLabel}>CHỦ TÀI KHOẢN</Text>
                  <Text style={styles.bankCardHolderName}>{bank.accountHolderName}</Text>
                </View>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedBadgeText}>
                    {bank.status === 'ALLOWLISTED' ? '✓ Đã xác minh' : 'Chờ xác minh'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setDialogOpen(true)} style={styles.addBankButton}>
            <AppIcon color={colors.brand} name="add-circle-outline" size={24} />
            <Text style={styles.addBankText}>Thêm tài khoản ngân hàng để nhận tiền hoàn</Text>
          </Pressable>
        )}

        {/* Withdraw Action Box */}
        <View style={styles.withdrawCard}>
          <Text style={styles.withdrawTitle}>Rút tiền về tài khoản ngân hàng</Text>
          <Text style={styles.withdrawSubtitle}>
            Số tiền sẽ được chuyển trực tiếp vào số tài khoản đã lưu bên trên.
          </Text>

          <View style={styles.withdrawInputRow}>
            <TextInput
              keyboardType="numeric"
              onChangeText={setWithdrawAmount}
              placeholder={`Tối đa ${formatVnd(availableAmount)}`}
              placeholderTextColor={colors.muted}
              style={styles.withdrawInput}
              value={withdrawAmount}
            />
            <Pressable
              hitSlop={6}
              onPress={() => setWithdrawAmount(String(availableAmount))}
              style={styles.allAmountBtn}
            >
              <Text style={styles.allAmountBtnText}>Rút tất cả</Text>
            </Pressable>
          </View>

          <PrimaryButton
            disabled={availableAmount <= 0 || withdraw.isPending || !bank}
            loading={withdraw.isPending}
            onPress={() => withdraw.mutate()}
          >
            {availableAmount <= 0
              ? 'Số dư hiện tại: 0đ'
              : !bank
                ? 'Thêm ngân hàng trước khi rút'
                : `Yêu cầu rút ${withdrawAmount ? formatVnd(Number(withdrawAmount)) : formatVnd(availableAmount)}`}
          </PrimaryButton>
        </View>

        {/* History Tabs */}
        <View style={styles.tabsHeader}>
          <Pressable
            onPress={() => setActiveTab('payouts')}
            style={[styles.historyTab, activeTab === 'payouts' && styles.historyTabActive]}
          >
            <Text style={[styles.historyTabText, activeTab === 'payouts' && styles.historyTabTextActive]}>
              Yêu cầu rút tiền ({payoutsQuery.data?.length ?? 0})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('transactions')}
            style={[styles.historyTab, activeTab === 'transactions' && styles.historyTabActive]}
          >
            <Text style={[styles.historyTabText, activeTab === 'transactions' && styles.historyTabTextActive]}>
              Lịch sử ví ({transactionsQuery.data?.length ?? 0})
            </Text>
          </Pressable>
        </View>

        {activeTab === 'payouts' ? (
          <View style={styles.historyList}>
            {payoutsQuery.isLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing[4] }} />
            ) : !payoutsQuery.data?.length ? (
              <View style={styles.emptyState}>
                <AppIcon color={colors.muted} name="receipt-outline" size={36} />
                <Text style={styles.emptyText}>Chưa có yêu cầu rút tiền nào</Text>
              </View>
            ) : (
              payoutsQuery.data.map((item) => {
                const tag = payoutStatusTag(item.status);
                return (
                  <View key={item.id} style={styles.historyItem}>
                    <View style={styles.historyItemTop}>
                      <Text style={styles.historyItemTitle}>Rút về {item.bankCode}</Text>
                      <View style={[styles.statusTag, { backgroundColor: tag.bg }]}>
                        <Text style={[styles.statusTagText, { color: tag.color }]}>{tag.label}</Text>
                      </View>
                    </View>
                    <View style={styles.historyItemBottom}>
                      <Text style={styles.historyItemDate}>{formatDate(item.requestedAt)}</Text>
                      <Text style={styles.historyItemAmount}>-{formatVnd(item.amount)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          <View style={styles.historyList}>
            {transactionsQuery.isLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing[4] }} />
            ) : !transactionsQuery.data?.length ? (
              <View style={styles.emptyState}>
                <AppIcon color={colors.muted} name="list-outline" size={36} />
                <Text style={styles.emptyText}>Chưa có biến động số dư</Text>
              </View>
            ) : (
              transactionsQuery.data.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View style={styles.historyItemTop}>
                    <Text style={styles.historyItemTitle}>
                      {item.type === 'REFUND_CREDIT' ? 'Hoàn tiền đơn hủy' : item.description || item.type}
                    </Text>
                    <Text
                      style={[
                        styles.historyItemAmount,
                        { color: item.amount > 0 ? '#16a34a' : colors.ink }
                      ]}
                    >
                      {item.amount > 0 ? `+${formatVnd(item.amount)}` : formatVnd(item.amount)}
                    </Text>
                  </View>
                  <View style={styles.historyItemBottom}>
                    <Text style={styles.historyItemDate}>{formatDate(item.occurredAt || item.createdAt)}</Text>
                    <Text style={styles.historyItemRef}>{item.referenceId ? `Mã: ${item.referenceId}` : ''}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal Edit Bank Account */}
      <Modal animationType="slide" onRequestClose={() => setDialogOpen(false)} transparent visible={dialogOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tài khoản ngân hàng nhận tiền</Text>
              <Pressable hitSlop={10} onPress={() => setDialogOpen(false)}>
                <AppIcon color={colors.muted} name="close" size={24} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.inputLabel}>Chọn ngân hàng</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankPicker}>
                {BANK_OPTIONS.map((b) => (
                  <Pressable
                    key={b.code}
                    onPress={() => setBankCode(b.code)}
                    style={[styles.bankPickerItem, bankCode === b.code && styles.bankPickerItemActive]}
                  >
                    <Text
                      style={[
                        styles.bankPickerItemText,
                        bankCode === b.code && styles.bankPickerItemTextActive
                      ]}
                    >
                      {b.code}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Số tài khoản ngân hàng</Text>
              <TextInput
                keyboardType="numeric"
                onChangeText={setAccountNumber}
                placeholder="Nhập số tài khoản..."
                placeholderTextColor={colors.muted}
                style={styles.modalInput}
                value={accountNumber}
              />

              <Text style={styles.inputLabel}>Tên chủ tài khoản (In hoa không dấu)</Text>
              <TextInput
                autoCapitalize="characters"
                onChangeText={setAccountHolderName}
                placeholder="NGUYEN VAN A"
                placeholderTextColor={colors.muted}
                style={styles.modalInput}
                value={accountHolderName}
              />

              <View style={styles.modalActions}>
                <PrimaryButton loading={saveBank.isPending} onPress={() => saveBank.mutate()}>
                  Lưu tài khoản
                </PrimaryButton>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
  headerTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  content: { gap: spacing[3], padding: spacing[3] },
  actionPadding: { padding: spacing[4] },
  bannerInfo: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderColor: '#fcdcd7',
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3]
  },
  bannerInfoText: { color: colors.brandDark, flex: 1, fontSize: 13, lineHeight: 18 },
  metricsRow: { flexDirection: 'row', gap: spacing[2] },
  metricCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    padding: spacing[3]
  },
  metricCardPrimary: {
    backgroundColor: '#fffcfb',
    borderColor: '#fcdcd7'
  },
  metricDotRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  metricDot: { borderRadius: 4, height: 7, width: 7 },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  metricValue: { color: colors.ink, fontSize: 15, fontWeight: '800', marginTop: spacing[1] },
  metricSub: { color: colors.muted, fontSize: 10, marginTop: 2 },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[1]
  },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  linkText: { color: colors.brand, fontSize: 13, fontWeight: '600' },
  bankCardWrapper: { borderRadius: radius.md, overflow: 'hidden' },
  bankCard: {
    backgroundColor: '#1e293b',
    borderRadius: radius.md,
    gap: spacing[3],
    padding: spacing[4]
  },
  bankCardTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  bankCardType: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  bankCardName: { color: colors.surface, fontSize: 18, fontWeight: '800', marginTop: 2 },
  bankPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: 3
  },
  bankPillText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  bankCardNumber: {
    color: colors.surface,
    fontFamily: 'monospace',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 3,
    marginVertical: spacing[1]
  },
  bankCardBottom: {
    alignItems: 'flex-end',
    borderTopColor: 'rgba(255,255,255,0.1)',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing[3]
  },
  bankCardHolderLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  bankCardHolderName: { color: colors.surface, fontSize: 14, fontWeight: '700', marginTop: 2 },
  verifiedBadge: {
    backgroundColor: colors.brandSoft,
    borderColor: '#fcdcd7',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing[2],
    paddingVertical: 2
  },
  verifiedBadgeText: { color: colors.brand, fontSize: 11, fontWeight: '700' },
  addBankButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderRadius: radius.sm,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing[2],
    justifyContent: 'center',
    padding: spacing[4]
  },
  addBankText: { color: colors.brand, fontSize: 14, fontWeight: '600' },
  withdrawCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[4]
  },
  withdrawTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  withdrawSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  withdrawInputRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  withdrawInput: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: spacing[3],
    paddingVertical: 10
  },
  allAmountBtn: {
    backgroundColor: colors.brandSoft,
    borderColor: '#fcdcd7',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: 10
  },
  allAmountBtnText: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  tabsHeader: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginTop: spacing[2]
  },
  historyTab: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: spacing[3]
  },
  historyTabActive: {
    borderBottomColor: colors.brand,
    borderBottomWidth: 2
  },
  historyTabText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  historyTabTextActive: { color: colors.brand, fontWeight: '700' },
  historyList: { backgroundColor: colors.surface, borderRadius: radius.sm, paddingHorizontal: spacing[3] },
  historyItem: {
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    gap: 4,
    paddingVertical: spacing[3]
  },
  historyItemTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  historyItemTitle: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  historyItemBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  historyItemDate: { color: colors.muted, fontSize: 12 },
  historyItemAmount: { color: colors.brand, fontSize: 14, fontWeight: '700' },
  historyItemRef: { color: colors.muted, fontSize: 11 },
  statusTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusTagText: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[6] },
  emptyText: { color: colors.muted, fontSize: 13 },
  modalBackdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'flex-end'
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '85%',
    padding: spacing[4]
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing[3]
  },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  modalBody: { gap: spacing[3], paddingBottom: spacing[5] },
  inputLabel: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  bankPicker: { flexDirection: 'row', marginVertical: 2 },
  bankPickerItem: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginRight: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: 8
  },
  bankPickerItemActive: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand
  },
  bankPickerItemText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  bankPickerItemTextActive: { color: colors.brand, fontWeight: '700' },
  modalInput: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: spacing[3],
    paddingVertical: 10
  },
  modalActions: { marginTop: spacing[3] }
});
