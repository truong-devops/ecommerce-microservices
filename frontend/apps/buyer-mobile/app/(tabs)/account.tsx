import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchBuyerWallet } from '@/api/wallet';
import { useAuth } from '@/auth/auth-context';
import { AppIcon, type AppIconName } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const orderActions: Array<{ icon: AppIconName; label: string; status?: string }> = [
  { icon: 'wallet-outline', label: 'Chờ thanh toán', status: 'PENDING' },
  { icon: 'cube-outline', label: 'Chờ lấy hàng', status: 'PROCESSING' },
  { icon: 'car-outline', label: 'Chờ giao hàng', status: 'SHIPPED' },
  { icon: 'star-outline', label: 'Hoàn thành', status: 'DELIVERED' },
  { icon: 'refresh-outline', label: 'Trả hàng/Hoàn tiền', status: 'REFUNDED' },
];

const tools: Array<{ icon: AppIconName; label: string; copy: string; route?: string }> = [
  { icon: 'wallet-outline', label: 'Ví eMall', copy: 'Xem số dư ví', route: '/wallet' },
  { icon: 'ticket-outline', label: 'Kho Voucher', copy: '50+ ưu đãi' },
  { icon: 'logo-usd', label: 'eMall Xu', copy: 'Tích xu mỗi ngày' },
  { icon: 'sparkles-outline', label: 'Khách VIP', copy: 'Đặc quyền' },
];

function formatVnd(value: number | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0đ';
  return `${Math.round(num).toLocaleString('vi-VN')}đ`;
}

export default function AccountScreen() {
  const router = useRouter();
  const { isLoading, session, signOut } = useAuth();
  const token = session?.accessToken;

  const wallet = useQuery({
    queryKey: ['buyer-wallet-snippet'],
    queryFn: () => fetchBuyerWallet(token!),
    enabled: Boolean(token)
  });

  const displayName = session?.user.email.split('@')[0] || 'Khách hàng eMall';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroActions}>
            <IconButton accessibilityLabel="Cài đặt" color={colors.surface} name="settings-outline" onPress={() => router.push('/profile')} />
            <CartLink color={colors.surface} />
            <IconButton accessibilityLabel="Tin nhắn" color={colors.surface} name="chatbubble-ellipses-outline" onPress={() => router.push('/chat')} />
          </View>
          {isLoading ? <ActivityIndicator color={colors.surface} /> : null}
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.follow}>{session ? 'Thành viên eMall  |  Đã xác thực' : 'Đăng nhập để nhận ưu đãi'}</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push(session ? '/profile' : '/login')} style={styles.vip}>
            <Text style={styles.vipBadge}>MALL</Text>
            <Text style={styles.vipText}>Thành viên eMall Rewards - Xem đặc quyền</Text>
            <AppIcon color={colors.brand} name="chevron-forward" size={18} />
          </Pressable>
        </View>

        {!isLoading && !session ? (
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Đăng nhập tài khoản</Text>
            <Text style={styles.copy}>Theo dõi đơn hàng, ví tiền hoàn và hội thoại mua sắm tại một nơi.</Text>
            <PrimaryButton onPress={() => router.push('/login')}>Đăng nhập / Đăng ký</PrimaryButton>
          </View>
        ) : null}

        {/* Ví eMall Quick Snippet */}
        {session ? (
          <Pressable onPress={() => router.push('/wallet')} style={styles.walletBanner}>
            <View style={styles.walletBannerLeft}>
              <View style={styles.walletIconCircle}>
                <AppIcon color={colors.surface} name="wallet-outline" size={20} />
              </View>
              <View>
                <Text style={styles.walletTitle}>Ví eMall & Hoàn tiền</Text>
                <Text style={styles.walletSubtitle}>
                  {wallet.data ? `Khả dụng: ${formatVnd(wallet.data.availableAmount)}` : 'Xem số dư và yêu cầu rút tiền'}
                </Text>
              </View>
            </View>
            <View style={styles.walletBannerRight}>
              <Text style={styles.walletLinkText}>Rút tiền</Text>
              <AppIcon color={colors.brand} name="chevron-forward" size={16} />
            </View>
          </Pressable>
        ) : null}

        {/* Đơn mua */}
        <View style={styles.card}>
          <View style={styles.sectionTop}>
            <Text style={styles.section}>Đơn mua</Text>
            <Pressable onPress={() => router.push('/orders')} style={styles.sectionLink}>
              <Text style={styles.link}>Xem lịch sử mua hàng</Text>
              <AppIcon color={colors.muted} name="chevron-forward" size={16} />
            </Pressable>
          </View>
          <View style={styles.orderActions}>
            {orderActions.map((action) => (
              <Pressable
                key={action.label}
                onPress={() => router.push(action.status ? `/orders?status=${action.status}` : '/orders')}
                style={styles.orderAction}
              >
                <AppIcon color={colors.ink} name={action.icon} size={26} />
                <Text numberOfLines={2} style={styles.actionLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Tiện ích của tôi */}
        <View style={styles.card}>
          <Text style={styles.section}>Tiện ích của tôi</Text>
          <View style={styles.tools}>
            {tools.map((tool) => (
              <Pressable
                key={tool.label}
                onPress={() => {
                  if (tool.route) router.push(tool.route as any);
                }}
                style={styles.tool}
              >
                <AppIcon color={colors.brand} name={tool.icon} size={28} />
                <Text style={styles.toolLabel}>{tool.label}</Text>
                <Text style={styles.toolCopy}>{tool.copy}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {session ? (
          <View style={styles.card}>
            <Pressable onPress={() => router.push('/wallet')} style={styles.menu}>
              <AppIcon color={colors.brand} name="card-outline" size={20} />
              <Text style={styles.menuText}>Tài khoản ngân hàng & rút tiền</Text>
              <AppIcon color={colors.muted} name="chevron-forward" size={18} />
            </Pressable>
            <Pressable onPress={() => router.push('/profile')} style={styles.menu}>
              <AppIcon color={colors.brand} name="person-outline" size={20} />
              <Text style={styles.menuText}>Hồ sơ và địa chỉ nhận hàng</Text>
              <AppIcon color={colors.muted} name="chevron-forward" size={18} />
            </Pressable>
            <View style={{ marginTop: spacing[3] }}>
              <PrimaryButton variant="outline" onPress={() => void signOut()}>
                Đăng xuất
              </PrimaryButton>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: spacing[3], paddingBottom: spacing[4] },
  hero: { backgroundColor: colors.brand, gap: spacing[3], padding: spacing[3] },
  heroActions: { alignItems: 'center', flexDirection: 'row', gap: spacing[1], justifyContent: 'flex-end' },
  identity: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  avatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 60,
    justifyContent: 'center',
    width: 60
  },
  avatarText: { color: colors.surface, fontSize: 24, fontWeight: '800' },
  identityCopy: { flex: 1, gap: 2 },
  name: { color: colors.surface, fontSize: 20, fontWeight: '800' },
  follow: { color: '#ffe5de', fontSize: typography.body },
  vip: {
    alignItems: 'center',
    backgroundColor: '#fff8e9',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3]
  },
  vipBadge: {
    backgroundColor: colors.brand,
    borderRadius: 4,
    color: colors.surface,
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: spacing[2],
    paddingVertical: 2
  },
  vipText: { color: colors.ink, flex: 1, fontSize: 13, fontWeight: '600' },
  loginCard: { backgroundColor: colors.surface, gap: spacing[2], marginHorizontal: spacing[3], padding: spacing[4] },
  loginTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  copy: { color: colors.muted, fontSize: typography.body },
  walletBanner: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: '#fcdcd7',
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: spacing[3],
    padding: spacing[3]
  },
  walletBannerLeft: { alignItems: 'center', flexDirection: 'row', gap: spacing[3] },
  walletIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    width: 38
  },
  walletTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  walletSubtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  walletBannerRight: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  walletLinkText: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: colors.surface, gap: spacing[3], padding: spacing[4] },
  sectionTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  section: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  sectionLink: { alignItems: 'center', flexDirection: 'row' },
  link: { color: colors.muted, fontSize: 13 },
  orderActions: { flexDirection: 'row', justifyContent: 'space-between' },
  orderAction: { alignItems: 'center', gap: spacing[1], width: '19%' },
  actionLabel: { color: colors.ink, fontSize: 11, textAlign: 'center' },
  tools: { flexDirection: 'row', justifyContent: 'space-between' },
  tool: { alignItems: 'center', gap: spacing[1], width: '23%' },
  toolLabel: { color: colors.ink, fontSize: typography.label, textAlign: 'center' },
  toolCopy: { color: colors.brand, fontSize: 10, textAlign: 'center' },
  menu: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    paddingVertical: spacing[3]
  },
  menuText: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '500' }
});
