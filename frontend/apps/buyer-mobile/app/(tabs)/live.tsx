import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchLiveSessions } from '@/api/live';
import { AppIcon } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

const CATEGORIES = ['Tất cả', 'Thời trang', 'Công nghệ', 'Làm đẹp', 'Gia dụng', 'Deal hot'];

export default function LiveListScreen() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const sessions = useQuery({ queryKey: ['live-sessions'], queryFn: fetchLiveSessions, refetchInterval: 20_000 });

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <AppIcon color={colors.surface} name="videocam-outline" size={26} />
        <View style={styles.tabs}>
          <Text onPress={() => router.push('/video')} style={styles.tab}>Video</Text>
          <Text style={styles.activeTab}>Live</Text>
          <Text style={styles.tab}>Cho bạn</Text>
        </View>
        <CartLink color={colors.surface} />
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            onRefresh={() => void sessions.refetch()}
            refreshing={sessions.isRefetching}
            tintColor={colors.brand}
          />
        }
      >
        {/* Banner matching web */}
        <View style={styles.feature}>
          <View style={styles.featureTop}>
            <View style={styles.featureBadge}>
              <Text style={styles.featureBadgeText}>LIVE SHOPPING</Text>
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => void sessions.refetch()}
              style={styles.reloadBtn}
            >
              <AppIcon color={colors.surface} name="refresh-outline" size={14} />
              <Text style={styles.reloadBtnText}>Tải lại</Text>
            </Pressable>
          </View>
          <Text style={styles.featureTitle}>Đang live trên eMall</Text>
          <Text style={styles.featureCopy}>
            Xem shop phát trực tiếp, trò chuyện trong phòng live và săn voucher độc quyền.
          </Text>
        </View>

        {/* Categories Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
          {CATEGORIES.map((cat) => {
            const isSelected = cat === selectedCategory;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
              >
                <Text style={[styles.categoryText, isSelected && styles.categoryTextActive]}>{cat}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {sessions.isPending ? <ScreenState title="Đang tải danh sách livestream..." /> : null}
        {sessions.isError ? <ScreenState title="Không tải được livestream" detail={sessions.error.message} /> : null}

        {/* Empty State with Golden Hours Schedule matching web */}
        {sessions.data && sessions.data.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyBox}>
              <View style={styles.emptyIconCircle}>
                <AppIcon color={colors.muted} name="radio-outline" size={32} />
              </View>
              <Text style={styles.emptyTitle}>Chưa có shop nào đang live</Text>
              <Text style={styles.emptySubtitle}>
                Khi người bán bắt đầu phát trực tiếp, phòng live sẽ xuất hiện tại đây.
              </Text>
            </View>

            {/* Golden hour schedule cards */}
            <View style={styles.scheduleSection}>
              <Text style={styles.scheduleHeader}>KHUNG GIỜ SĂN LIVE VÀNG</Text>
              <View style={styles.scheduleCard}>
                <View style={styles.scheduleTimeBadge}>
                  <Text style={styles.scheduleTimeText}>12:00 - 14:00</Text>
                </View>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.scheduleTitle}>Săn Deal Giờ Trưa</Text>
                  <Text style={styles.scheduleDesc}>Flash voucher giảm sâu chớp nhoáng từ các shop</Text>
                </View>
              </View>

              <View style={styles.scheduleCard}>
                <View style={[styles.scheduleTimeBadge, { backgroundColor: colors.brand }]}>
                  <Text style={styles.scheduleTimeText}>20:00 - 22:00</Text>
                </View>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.scheduleTitle}>Đại Tiệc Livestream</Text>
                  <Text style={styles.scheduleDesc}>Giảm giá lên đến 50% cùng freeship độc quyền</Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {sessions.data?.map((session) => (
          <Pressable
            key={session.sessionId}
            onPress={() => router.push(`/live/${session.sessionId}`)}
            style={styles.card}
          >
            <View style={styles.cover}>
              {session.thumbnailUrl ? (
                <Image
                  source={{ uri: normalizeRemoteAssetUrl(session.thumbnailUrl, process.env.EXPO_PUBLIC_API_BASE_URL) }}
                  style={styles.image}
                />
              ) : null}
              <View style={styles.badge}>
                <View style={styles.livePulseDot} />
                <Text style={styles.badgeText}>LIVE</Text>
              </View>
              <View style={styles.viewers}>
                <AppIcon color={colors.surface} name="eye-outline" size={13} />
                <Text style={styles.viewerText}>{session.metricsSnapshot.viewerPeak.toLocaleString('vi-VN')}</Text>
              </View>
            </View>
            <View style={styles.content}>
              <Text numberOfLines={2} style={styles.sessionTitle}>{session.title}</Text>
              <View style={styles.deal}>
                <AppIcon color={colors.brand} name="ticket-outline" size={15} />
                <Text style={styles.dealText}>Deal đang ghim - Vào xem ngay</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.media, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3]
  },
  tabs: { flex: 1, flexDirection: 'row', gap: spacing[4], justifyContent: 'center' },
  tab: { color: '#d1d5db', fontSize: 16, fontWeight: '600', paddingBottom: spacing[2] },
  activeTab: {
    borderBottomColor: colors.brand,
    borderBottomWidth: 2,
    color: colors.surface,
    fontSize: 17,
    fontWeight: '800',
    paddingBottom: spacing[2]
  },
  list: { gap: spacing[3], padding: spacing[3], paddingBottom: spacing[5] },
  feature: {
    backgroundColor: '#172238',
    borderRadius: radius.md,
    gap: spacing[2],
    padding: spacing[4]
  },
  featureTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  featureBadge: {
    backgroundColor: colors.brand,
    borderRadius: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3
  },
  featureBadgeText: { color: colors.surface, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  reloadBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 4
  },
  reloadBtnText: { color: colors.surface, fontSize: 11, fontWeight: '600' },
  featureTitle: { color: colors.surface, fontSize: typography.headline, fontWeight: '800' },
  featureCopy: { color: '#cbd5e1', fontSize: 13, lineHeight: 18 },
  categoryScroll: { marginVertical: 2 },
  categoryPill: {
    backgroundColor: '#1b2230',
    borderColor: '#2e3a4e',
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: 6
  },
  categoryPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand
  },
  categoryText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  categoryTextActive: { color: colors.surface, fontWeight: '700' },
  emptyContainer: { gap: spacing[3] },
  emptyBox: {
    alignItems: 'center',
    backgroundColor: '#11151d',
    borderColor: '#1e2636',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing[2],
    padding: spacing[5]
  },
  emptyIconCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.pill,
    height: 56,
    justifyContent: 'center',
    width: 56
  },
  emptyTitle: { color: colors.surface, fontSize: 16, fontWeight: '700' },
  emptySubtitle: { color: '#94a3b8', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  scheduleSection: {
    backgroundColor: '#11151d',
    borderColor: '#1e2636',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing[2],
    padding: spacing[4]
  },
  scheduleHeader: { color: '#94a3b8', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  scheduleCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3]
  },
  scheduleTimeBadge: {
    backgroundColor: '#334155',
    borderRadius: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 4
  },
  scheduleTimeText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  scheduleInfo: { flex: 1, gap: 2 },
  scheduleTitle: { color: colors.surface, fontSize: 13, fontWeight: '700' },
  scheduleDesc: { color: '#94a3b8', fontSize: 11 },
  card: { backgroundColor: '#11151d', borderRadius: radius.md, overflow: 'hidden' },
  cover: { aspectRatio: 16 / 9, backgroundColor: '#151a23', position: 'relative' },
  image: { height: '100%', width: '100%' },
  badge: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 4,
    flexDirection: 'row',
    gap: 4,
    left: spacing[3],
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    position: 'absolute',
    top: spacing[3]
  },
  livePulseDot: { backgroundColor: colors.surface, borderRadius: 3, height: 6, width: 6 },
  badgeText: { color: colors.surface, fontSize: 11, fontWeight: '900' },
  viewers: {
    alignItems: 'center',
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
    position: 'absolute',
    right: spacing[3],
    top: spacing[3]
  },
  viewerText: { color: colors.surface, fontSize: typography.label },
  content: { gap: spacing[2], padding: spacing[3] },
  sessionTitle: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  deal: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  dealText: { color: '#e5e7eb', fontSize: typography.label }
});
