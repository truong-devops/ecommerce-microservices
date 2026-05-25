import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchLiveSessions } from '@/api/live';
import { AppIcon } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

export default function LiveListScreen() {
  const router = useRouter();
  const sessions = useQuery({ queryKey: ['live-sessions'], queryFn: fetchLiveSessions, refetchInterval: 20_000 });

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <AppIcon color={colors.surface} name="person-circle-outline" size={28} />
        <View style={styles.tabs}>
          <Text onPress={() => router.push('/video')} style={styles.tab}>Video</Text>
          <Text style={styles.activeTab}>Live</Text>
          <Text style={styles.tab}>Cho bạn</Text>
        </View>
        <CartLink color={colors.surface} />
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={sessions.isRefetching} onRefresh={() => void sessions.refetch()} tintColor={colors.surface} />}
      >
        <View style={styles.feature}>
          <Text style={styles.featureBadge}>DT LIVE</Text>
          <Text style={styles.featureTitle}>Săn Deal Trực Tiếp</Text>
          <Text style={styles.featureCopy}>Voucher độc quyền trong phòng live</Text>
        </View>
        {sessions.isPending ? <ScreenState title="Đang tải livestream..." /> : null}
        {sessions.isError ? <ScreenState title="Không tải được livestream" detail={sessions.error.message} /> : null}
        {sessions.data?.length === 0 ? <ScreenState title="Chưa có phiên live đang phát" /> : null}
        {sessions.data?.map((session) => (
          <Pressable key={session.sessionId} onPress={() => router.push(`/live/${session.sessionId}`)} style={styles.card}>
            <View style={styles.cover}>
              {session.thumbnailUrl ? <Image source={{ uri: normalizeRemoteAssetUrl(session.thumbnailUrl, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.image} /> : null}
              <View style={styles.badge}><AppIcon color={colors.surface} name="radio" size={13} /><Text style={styles.badgeText}>LIVE</Text></View>
              <View style={styles.viewers}><AppIcon color={colors.surface} name="eye-outline" size={13} /><Text style={styles.viewerText}>{session.metricsSnapshot.viewerPeak.toLocaleString('vi-VN')}</Text></View>
            </View>
            <View style={styles.content}>
              <Text numberOfLines={2} style={styles.sessionTitle}>{session.title}</Text>
              <View style={styles.deal}><AppIcon color={colors.brand} name="ticket-outline" size={16} /><Text style={styles.dealText}>Deal đang ghim - Vào xem ngay</Text></View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.media, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  tabs: { flex: 1, flexDirection: 'row', gap: spacing[4], justifyContent: 'center' },
  tab: { color: '#d1d5db', fontSize: 16, fontWeight: '600', paddingBottom: spacing[2] },
  activeTab: { borderBottomColor: colors.surface, borderBottomWidth: 2, color: colors.surface, fontSize: 17, fontWeight: '800', paddingBottom: spacing[2] },
  list: { gap: spacing[3], padding: spacing[3], paddingBottom: spacing[5] },
  feature: { backgroundColor: '#172238', borderRadius: radius.md, gap: spacing[1], padding: spacing[4] },
  featureBadge: { color: colors.brand, fontSize: typography.label, fontWeight: '900' },
  featureTitle: { color: colors.surface, fontSize: typography.title, fontWeight: '900' },
  featureCopy: { color: '#cbd5e1' },
  card: { backgroundColor: '#11151d', borderRadius: radius.md, overflow: 'hidden' },
  cover: { aspectRatio: 16 / 9, backgroundColor: '#151a23', position: 'relative' },
  image: { height: '100%', width: '100%' },
  badge: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 4, flexDirection: 'row', gap: 3, left: spacing[3], paddingHorizontal: spacing[2], paddingVertical: spacing[1], position: 'absolute', top: spacing[3] },
  badgeText: { color: colors.surface, fontSize: 11, fontWeight: '900' },
  viewers: { alignItems: 'center', backgroundColor: colors.overlay, borderRadius: radius.pill, flexDirection: 'row', gap: 4, paddingHorizontal: spacing[2], paddingVertical: spacing[1], position: 'absolute', right: spacing[3], top: spacing[3] },
  viewerText: { color: colors.surface, fontSize: typography.label },
  content: { gap: spacing[2], padding: spacing[3] },
  sessionTitle: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  deal: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  dealText: { color: '#e5e7eb', fontSize: typography.label },
});
