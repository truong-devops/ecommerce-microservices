import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { AppIcon, type AppIconName } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const orderActions: Array<{ icon: AppIconName; label: string }> = [
  { icon: 'wallet-outline', label: 'Chờ xác nhận' },
  { icon: 'cube-outline', label: 'Chờ lấy hàng' },
  { icon: 'car-outline', label: 'Chờ giao hàng' },
  { icon: 'star-outline', label: 'Đánh giá' },
];
const tools: Array<{ icon: AppIconName; label: string; copy: string }> = [
  { icon: 'wallet-outline', label: 'Ví DT Pay', copy: 'Ưu đãi mới' },
  { icon: 'time-outline', label: 'Trả sau', copy: 'Kích hoạt ngay' },
  { icon: 'logo-usd', label: 'DT Xu', copy: 'Nhận xu mỗi ngày' },
  { icon: 'ticket-outline', label: 'Kho Voucher', copy: '50+ voucher' },
];

export default function AccountScreen() {
  const router = useRouter();
  const { isLoading, session, signOut } = useAuth();

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
            <View style={styles.avatar}><AppIcon color={colors.surface} name="person" size={34} /></View>
            <View style={styles.identityCopy}>
              <Text style={styles.name}>{session?.user.email.split('@')[0] ?? 'Khách DT Commerce'}</Text>
              <Text style={styles.follow}>{session ? 'Thành viên  |  0 Người theo dõi' : 'Đăng nhập để nhận ưu đãi'}</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push(session ? '/profile' : '/login')} style={styles.vip}>
            <Text style={styles.vipBadge}>VIP</Text>
            <Text style={styles.vipText}>Nhận voucher giảm giá cho thành viên mới</Text>
            <AppIcon color={colors.brand} name="chevron-forward" size={18} />
          </Pressable>
        </View>

        {!isLoading && !session ? (
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Đăng nhập nhanh</Text>
            <Text style={styles.copy}>Theo dõi đơn hàng, voucher và hội thoại mua hàng tại một nơi.</Text>
            <PrimaryButton onPress={() => router.push('/login')}>Đăng nhập / Đăng ký</PrimaryButton>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.sectionTop}>
            <Text style={styles.section}>Đơn mua</Text>
            <Pressable onPress={() => router.push('/orders')} style={styles.sectionLink}>
              <Text style={styles.link}>Xem lịch sử mua hàng</Text><AppIcon color={colors.muted} name="chevron-forward" size={16} />
            </Pressable>
          </View>
          <View style={styles.orderActions}>
            {orderActions.map((action) => (
              <Pressable key={action.label} onPress={() => router.push('/orders')} style={styles.orderAction}>
                <AppIcon color={colors.ink} name={action.icon} size={29} />
                <Text style={styles.actionLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.section}>Tiện ích của tôi</Text>
          <View style={styles.tools}>
            {tools.map((tool) => (
              <View key={tool.label} style={styles.tool}>
                <AppIcon color={colors.brand} name={tool.icon} size={28} />
                <Text style={styles.toolLabel}>{tool.label}</Text>
                <Text style={styles.toolCopy}>{tool.copy}</Text>
              </View>
            ))}
          </View>
        </View>
        {session ? (
          <View style={styles.card}>
            <Pressable onPress={() => router.push('/profile')} style={styles.menu}><AppIcon color={colors.brand} name="person-outline" /><Text style={styles.menuText}>Hồ sơ và địa chỉ</Text><AppIcon color={colors.muted} name="chevron-forward" /></Pressable>
            <PrimaryButton variant="outline" onPress={() => void signOut()}>Đăng xuất</PrimaryButton>
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
  avatar: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.24)', borderColor: colors.surface, borderRadius: radius.pill, borderWidth: 2, height: 62, justifyContent: 'center', width: 62 },
  identityCopy: { flex: 1, gap: spacing[1] },
  name: { color: colors.surface, fontSize: 20, fontWeight: '800' },
  follow: { color: '#ffe5de', fontSize: typography.body },
  vip: { alignItems: 'center', backgroundColor: '#fff8e9', borderRadius: radius.sm, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  vipBadge: { backgroundColor: '#f7bb35', borderRadius: 4, color: colors.surface, fontWeight: '900', paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  vipText: { color: colors.ink, flex: 1, fontWeight: '600' },
  loginCard: { backgroundColor: colors.surface, gap: spacing[2], marginHorizontal: spacing[3], padding: spacing[4] },
  loginTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  copy: { color: colors.muted, fontSize: typography.body },
  card: { backgroundColor: colors.surface, gap: spacing[4], padding: spacing[4] },
  sectionTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  section: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  sectionLink: { alignItems: 'center', flexDirection: 'row' },
  link: { color: colors.muted, fontSize: typography.body },
  orderActions: { flexDirection: 'row', justifyContent: 'space-between' },
  orderAction: { alignItems: 'center', gap: spacing[2], width: '24%' },
  actionLabel: { color: colors.ink, fontSize: typography.label, textAlign: 'center' },
  tools: { flexDirection: 'row', justifyContent: 'space-between' },
  tool: { alignItems: 'center', gap: spacing[1], width: '24%' },
  toolLabel: { color: colors.ink, fontSize: typography.label, textAlign: 'center' },
  toolCopy: { color: colors.brand, fontSize: 10, textAlign: 'center' },
  menu: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', gap: spacing[3], paddingBottom: spacing[3] },
  menuText: { color: colors.ink, flex: 1 },
});
