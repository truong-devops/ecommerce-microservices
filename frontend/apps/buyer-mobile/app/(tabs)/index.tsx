import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchHomeSections } from '@/api/buyer';
import { AppIcon, type AppIconName } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { IconButton } from '@/components/core/icon-button';
import { ProductTile } from '@/components/core/product-tile';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

const quickServices: Array<{ icon: AppIconName; label: string; route?: string }> = [
  { icon: 'storefront-outline', label: 'eMall', route: '/explore' },
  { icon: 'videocam-outline', label: 'Live', route: '/live' },
  { icon: 'play-circle-outline', label: 'Video', route: '/video' },
  { icon: 'flash-outline', label: 'Flash Sale' },
  { icon: 'ticket-outline', label: 'Mã Giảm Giá' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const productTileWidth = Math.floor((width - spacing[3] * 2 - spacing[2]) / 2);
  const home = useQuery({ queryKey: ['buyer-home'], queryFn: fetchHomeSections });

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            onRefresh={() => void home.refetch()}
            refreshing={home.isRefetching}
            tintColor={colors.brand}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.actionRow}>
            <Pressable accessibilityRole="search" onPress={() => router.push('/search')} style={styles.search}>
              <AppIcon color={colors.brand} name="search-outline" size={20} />
              <Text style={styles.searchText}>Tìm sản phẩm, thương hiệu trên eMall...</Text>
              <AppIcon color={colors.muted} name="camera-outline" size={20} />
            </Pressable>
            <CartLink color={colors.surface} />
            <IconButton accessibilityLabel="Tin nhắn" color={colors.surface} name="chatbubble-ellipses-outline" onPress={() => router.push('/chat')} />
          </View>

          {/* Quick Wallet Bar */}
          <View style={styles.wallet}>
            <Pressable onPress={() => router.push('/wallet')} style={styles.walletItem}>
              <AppIcon color={colors.brand} name="wallet-outline" size={20} />
              <View>
                <Text style={styles.walletTitle}>Ví eMall</Text>
                <Text style={styles.walletCopy}>Hoàn tiền & rút tiền</Text>
              </View>
            </Pressable>
            <View style={styles.divider} />
            <Pressable onPress={() => router.push('/account')} style={styles.walletItem}>
              <AppIcon color={colors.warning} name="logo-usd" size={20} />
              <View>
                <Text style={styles.walletTitle}>eMall Xu</Text>
                <Text style={styles.walletCopy}>Tích xu mỗi ngày</Text>
              </View>
            </Pressable>
            <View style={styles.divider} />
            <Pressable onPress={() => router.push('/explore')} style={styles.walletItem}>
              <AppIcon color={colors.brand} name="ticket-outline" size={20} />
              <View>
                <Text style={styles.walletTitle}>Voucher</Text>
                <Text style={styles.walletCopy}>Giảm đến 50%</Text>
              </View>
            </Pressable>
          </View>

          {/* Quick Services */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.services}>
            {quickServices.map((service) => (
              <Pressable
                key={service.label}
                onPress={() => {
                  if (service.route) router.push(service.route as any);
                }}
                style={styles.service}
              >
                <View style={styles.serviceIcon}>
                  <AppIcon color={colors.brand} name={service.icon} size={26} />
                </View>
                <Text style={styles.serviceLabel}>{service.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Campaign Banner */}
          <View style={styles.campaign}>
            <View style={{ flex: 1 }}>
              <Text style={styles.campaignKicker}>EMALL SIÊU SALE</Text>
              <Text style={styles.campaignTitle}>Đại Tiệc Mua Sắm</Text>
              <Text style={styles.campaignCopy}>Freeship 0Đ & Voucher hoàn xu độc quyền</Text>
            </View>
            <View style={styles.campaignTag}>
              <Text style={styles.campaignTagText}>SALE</Text>
            </View>
          </View>
        </View>

        {home.isPending ? <ScreenState title="Đang tải trang chủ..." /> : null}
        {home.isError ? <ScreenState title="Không tải được trang chủ" detail={home.error.message} /> : null}
        {home.data ? (
          <>
            <View style={styles.whiteSection}>
              <Text style={styles.sectionTitle}>Danh mục sản phẩm</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {home.data.categories.map((category) => (
                  <Pressable
                    key={category.id}
                    onPress={() =>
                      router.push(`/explore?categoryId=${encodeURIComponent(category.id)}&categoryLabel=${encodeURIComponent(category.label)}`)
                    }
                    style={styles.category}
                  >
                    <View style={styles.categoryIcon}>
                      {category.icon ? (
                        <Image source={{ uri: normalizeRemoteAssetUrl(category.icon, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.categoryImage} />
                      ) : (
                        <AppIcon color={colors.brand} name="grid-outline" size={25} />
                      )}
                    </View>
                    <Text numberOfLines={2} style={styles.categoryLabel}>{category.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Media Row: Live & Video Hubs */}
            <View style={styles.mediaRow}>
              <Pressable onPress={() => router.push('/live')} style={styles.mediaPanel}>
                <View style={styles.panelHeading}>
                  <Text style={styles.mediaTitle}>EMALL LIVE</Text>
                  <AppIcon color={colors.brand} name="chevron-forward" size={16} />
                </View>
                <Text style={styles.mediaCopy}>Săn deal trực tiếp</Text>
                <View style={styles.livePreview}>
                  <AppIcon color={colors.surface} name="radio" size={22} />
                  <Text style={styles.livePreviewText}>Đang live</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => router.push('/video')} style={styles.mediaPanel}>
                <View style={styles.panelHeading}>
                  <Text style={styles.mediaTitle}>SHOPEE VIDEO</Text>
                  <AppIcon color={colors.brand} name="chevron-forward" size={16} />
                </View>
                <Text style={styles.mediaCopy}>Lướt xem & mua ngay</Text>
                <View style={styles.videoPreview}>
                  <AppIcon color={colors.surface} name="play" size={26} />
                </View>
              </Pressable>
            </View>

            {/* Flash Sale */}
            <View style={styles.saleHeader}>
              <Text style={styles.sectionTitle}>Flash Sale</Text>
              <Text style={styles.saleLabel}>Đang diễn ra  ›</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.flashRow}>
              {home.data.flashSaleItems.map((item) => (
                <Pressable key={item.id} onPress={() => router.push(`/products/${item.id}`)} style={styles.flashTile}>
                  <Image source={{ uri: normalizeRemoteAssetUrl(item.image, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.flashImage} />
                  <Text numberOfLines={1} style={styles.flashName}>{item.name}</Text>
                  <Text style={styles.flashPrice}>{Math.round(item.price).toLocaleString('vi-VN')}đ</Text>
                  <Text style={styles.flashSold}>{item.soldLabel}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Recommendations */}
            <Text style={styles.sectionTitle}>Gợi ý hôm nay</Text>
            <View style={styles.grid}>
              {home.data.recommendationProducts.map((product) => (
                <ProductTile key={product.id} product={product} width={productTileWidth} />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: spacing[3], paddingBottom: spacing[5] },
  hero: {
    backgroundColor: colors.brand,
    gap: spacing[3],
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2]
  },
  actionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] },
  search: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    flex: 1,
    flexDirection: 'row',
    gap: spacing[2],
    height: 44,
    paddingHorizontal: spacing[3]
  },
  searchText: { color: colors.muted, flex: 1, fontSize: 13 },
  wallet: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    flexDirection: 'row',
    padding: spacing[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4
  },
  walletItem: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[2] },
  walletTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  walletCopy: { color: colors.muted, fontSize: 10 },
  divider: { backgroundColor: colors.line, width: 1 },
  services: { gap: spacing[3], paddingHorizontal: spacing[1], paddingVertical: 2 },
  service: { alignItems: 'center', gap: spacing[1], width: 64 },
  serviceIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 52,
    justifyContent: 'center',
    width: 52
  },
  serviceLabel: { color: colors.surface, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  campaign: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing[3]
  },
  campaignKicker: { color: '#ffddd6', fontSize: 10, fontWeight: '800' },
  campaignTitle: { color: colors.surface, fontSize: 18, fontWeight: '900', textTransform: 'uppercase' },
  campaignCopy: { color: '#fff0ec', fontSize: 11, marginTop: 1 },
  campaignTag: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  campaignTagText: { color: colors.brand, fontSize: 12, fontWeight: '900' },
  whiteSection: { backgroundColor: colors.surface, gap: spacing[3], paddingVertical: spacing[3] },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800', marginHorizontal: spacing[4] },
  categoryRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  category: { alignItems: 'center', gap: spacing[2], width: 68 },
  categoryIcon: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderColor: '#fff1ed',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 52
  },
  categoryImage: { height: '100%', width: '100%' },
  categoryLabel: { color: colors.ink, fontSize: typography.label, textAlign: 'center' },
  mediaRow: { flexDirection: 'row', gap: spacing[3], paddingHorizontal: spacing[3] },
  mediaPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing[1],
    padding: spacing[3]
  },
  panelHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  mediaTitle: { color: colors.brand, fontSize: 14, fontWeight: '900' },
  mediaCopy: { color: colors.muted, fontSize: 11 },
  livePreview: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: spacing[2],
    height: 64,
    justifyContent: 'center',
    marginTop: spacing[2]
  },
  livePreviewText: { color: colors.surface, fontSize: 13, fontWeight: '800' },
  videoPreview: {
    alignItems: 'center',
    backgroundColor: '#11151d',
    borderRadius: radius.sm,
    height: 64,
    justifyContent: 'center',
    marginTop: spacing[2]
  },
  saleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingRight: spacing[4]
  },
  saleLabel: { color: colors.brand, fontSize: 12, fontWeight: '700' },
  flashRow: { gap: spacing[2], paddingHorizontal: spacing[4] },
  flashTile: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: spacing[2],
    width: 125
  },
  flashImage: { aspectRatio: 1, backgroundColor: colors.line, width: '100%' },
  flashName: { color: colors.ink, fontSize: typography.label, paddingHorizontal: spacing[2], paddingTop: spacing[1] },
  flashPrice: { color: colors.brand, fontSize: 14, fontWeight: '800', paddingHorizontal: spacing[2] },
  flashSold: { color: colors.muted, fontSize: 10, paddingHorizontal: spacing[2] },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    rowGap: spacing[3]
  }
});
