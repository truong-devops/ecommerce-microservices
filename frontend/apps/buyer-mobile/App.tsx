import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BuyerLivePlayer } from '@/components/live/buyer-live-player';
import { BuyerVideoPlayer } from '@/components/video/buyer-video-player';
import { selectLivePlaybackSource, selectVideoPlaybackSource } from '@/domain/media-playback';
import { fetchProductionPreview, ProductionPreview, productionApiBaseUrl } from '@/domain/remote-api';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

export default function App() {
  const [data, setData] = useState<ProductionPreview | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(true);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setError('');

    try {
      setData(await fetchProductionPreview());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu production.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const firstVideo = data?.videos[0];
  const videoSource = useMemo(
    () => selectVideoPlaybackSource({ mediaUrl: firstVideo?.mediaUrl, thumbnailUrl: firstVideo?.thumbnailUrl }),
    [firstVideo]
  );

  const firstLive = data?.liveSessions[0];
  const liveSource = useMemo(
    () =>
      selectLivePlaybackSource({
        fallbackUrl: firstLive?.media?.playback?.url ?? firstLive?.playbackUrl,
        thumbnailUrl: firstLive?.thumbnailUrl
      }),
    [firstLive]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadData()} tintColor={colors.brand} />}
      >
        <Text style={styles.title}>DT Commerce Buyer</Text>
        <Text style={styles.subtitle}>Đang lấy dữ liệu trực tiếp từ Kubernetes deployment</Text>
        <View style={styles.apiBadge}>
          <Text style={styles.apiText}>{productionApiBaseUrl()}</Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Không tải được API</Text>
            <Text style={styles.mutedText}>{error}</Text>
          </View>
        ) : null}

        <SectionHeader title="Sản phẩm" detail={`${data?.products.length ?? 0} items`} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productRow}>
          {data?.products.map((product) => (
            <View key={product.id} style={styles.productCard}>
              {product.images[0] ? (
                <Image
                  source={{ uri: normalizeRemoteAssetUrl(product.images[0], productionApiBaseUrl()) }}
                  style={styles.productImage}
                />
              ) : (
                <View style={styles.imageFallback} />
              )}
              <Text numberOfLines={2} style={styles.productName}>
                {product.name}
              </Text>
              <Text style={styles.productPrice}>{formatPrice(product.minPrice)}</Text>
            </View>
          ))}
        </ScrollView>

        <SectionHeader title="Video feed" detail={firstVideo?.seller?.shopName ?? 'Chưa có video'} />
        <View style={styles.videoFrame}>
          <BuyerVideoPlayer source={videoSource} noMediaLabel="Chưa có video để phát." />
        </View>
        {firstVideo ? <Text style={styles.mediaTitle}>{firstVideo.title}</Text> : null}

        <SectionHeader title="Live hiện tại" detail={firstLive?.status ?? 'Không có phiên live'} />
        <BuyerLivePlayer
          source={liveSource}
          state={liveSource.status}
          pausedLabel="Phiên live đang tạm dừng."
          endedLabel="Phiên live đã kết thúc."
          noPlaybackLabel="Live dùng WebRTC/WHEP, mobile preview chưa hỗ trợ phát luồng này."
        />
        {firstLive ? <Text style={styles.mediaTitle}>{firstLive.title}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionDetail}>{detail}</Text>
    </View>
  );
}

function formatPrice(value: number): string {
  return `${Math.round(value).toLocaleString('vi-VN')} đ`;
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    gap: spacing[3],
    padding: spacing[4],
    paddingBottom: spacing[6]
  },
  title: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: '900'
  },
  subtitle: {
    color: colors.muted,
    fontSize: typography.body
  },
  apiBadge: {
    backgroundColor: '#fff1ed',
    borderRadius: radius.sm,
    padding: spacing[3]
  },
  apiText: {
    color: colors.brand,
    fontSize: typography.label,
    fontWeight: '700'
  },
  errorCard: {
    backgroundColor: '#fee2e2',
    borderRadius: radius.md,
    gap: spacing[2],
    padding: spacing[4]
  },
  errorTitle: {
    color: '#991b1b',
    fontSize: typography.body,
    fontWeight: '700'
  },
  mutedText: {
    color: colors.muted,
    fontSize: typography.body
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing[3]
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800'
  },
  sectionDetail: {
    color: colors.muted,
    fontSize: typography.label
  },
  productRow: {
    gap: spacing[3]
  },
  productCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingBottom: spacing[3],
    width: 132
  },
  productImage: {
    height: 120,
    width: '100%'
  },
  imageFallback: {
    backgroundColor: colors.line,
    height: 120,
    width: '100%'
  },
  productName: {
    color: colors.ink,
    fontSize: typography.body,
    marginHorizontal: spacing[3],
    marginTop: spacing[2]
  },
  productPrice: {
    color: colors.brand,
    fontSize: typography.body,
    fontWeight: '700',
    marginHorizontal: spacing[3],
    marginTop: spacing[1]
  },
  videoFrame: {
    borderRadius: radius.md,
    height: 360,
    overflow: 'hidden'
  },
  mediaTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '700'
  }
});
