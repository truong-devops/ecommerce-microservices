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

const quickServices: Array<{ icon: AppIconName; label: string }> = [
  { icon: 'fast-food-outline', label: 'Food Deal' },
  { icon: 'storefront-outline', label: 'Mall' },
  { icon: 'diamond-outline', label: 'VIP' },
  { icon: 'flash-outline', label: 'Deal 1K' },
  { icon: 'ticket-outline', label: 'Voucher' },
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
        refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => void home.refetch()} tintColor={colors.surface} />}
      >
        <View style={styles.hero}>
          <View style={styles.actionRow}>
            <Pressable accessibilityRole="search" onPress={() => router.push('/search')} style={styles.search}>
              <AppIcon color={colors.muted} name="search-outline" size={20} />
              <Text style={styles.searchText}>Tìm sản phẩm, thương hiệu...</Text>
              <AppIcon color={colors.muted} name="camera-outline" size={20} />
            </Pressable>
            <CartLink color={colors.surface} />
            <IconButton accessibilityLabel="Tin nhắn" color={colors.surface} name="chatbubble-ellipses-outline" onPress={() => router.push('/chat')} />
          </View>
          <View style={styles.wallet}>
            <View style={styles.walletItem}>
              <AppIcon color={colors.brand} name="wallet-outline" size={20} />
              <View><Text style={styles.walletTitle}>DT Pay</Text><Text style={styles.walletCopy}>Voucher mới</Text></View>
            </View>
            <View style={styles.divider} />
            <View style={styles.walletItem}>
              <AppIcon color={colors.warning} name="logo-usd" size={20} />
              <View><Text style={styles.walletTitle}>Điểm thưởng</Text><Text style={styles.walletCopy}>Điểm danh</Text></View>
            </View>
            <View style={styles.divider} />
            <View style={styles.walletItem}>
              <AppIcon color={colors.brand} name="card-outline" size={20} />
              <View><Text style={styles.walletTitle}>Trả sau</Text><Text style={styles.walletCopy}>Ưu đãi 0%</Text></View>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.services}>
            {quickServices.map((service) => (
              <View key={service.label} style={styles.service}>
                <View style={styles.serviceIcon}><AppIcon color={colors.brand} name={service.icon} size={28} /></View>
                <Text style={styles.serviceLabel}>{service.label}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.campaign}>
            <View>
              <Text style={styles.campaignKicker}>DT COMMERCE DAY</Text>
              <Text style={styles.campaignTitle}>Săn Deal Sale To</Text>
              <Text style={styles.campaignCopy}>Freeship và voucher giảm đến 50%</Text>
            </View>
            <View style={styles.campaignTag}><Text style={styles.campaignTagText}>25.5</Text></View>
          </View>
        </View>

        {home.isPending ? <ScreenState title="Đang tải trang chủ..." /> : null}
        {home.isError ? <ScreenState title="Không tải được trang chủ" detail={home.error.message} /> : null}
        {home.data ? (
          <>
            <View style={styles.whiteSection}>
              <Text style={styles.sectionTitle}>Danh mục</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {home.data.categories.map((category) => (
                  <Pressable key={category.id} onPress={() => router.push(`/explore?categoryId=${category.id}`)} style={styles.category}>
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

            <View style={styles.mediaRow}>
              <Pressable onPress={() => router.push('/live')} style={styles.mediaPanel}>
                <View style={styles.panelHeading}><Text style={styles.mediaTitle}>LIVE</Text><AppIcon color={colors.brand} name="chevron-forward" size={16} /></View>
                <Text style={styles.mediaCopy}>Deal trực tiếp</Text>
                <View style={styles.livePreview}><AppIcon color={colors.surface} name="radio" size={23} /><Text style={styles.livePreviewText}>Đang phát</Text></View>
              </Pressable>
              <Pressable onPress={() => router.push('/video')} style={styles.mediaPanel}>
                <View style={styles.panelHeading}><Text style={styles.mediaTitle}>VIDEO</Text><AppIcon color={colors.brand} name="chevron-forward" size={16} /></View>
                <Text style={styles.mediaCopy}>Mua ngay trong clip</Text>
                <View style={styles.videoPreview}><AppIcon color={colors.surface} name="play" size={26} /></View>
              </Pressable>
            </View>

            <View style={styles.saleHeader}>
              <Text style={styles.sectionTitle}>Flash Sale</Text>
              <Text style={styles.saleLabel}>Kết thúc 11:17:49  ›</Text>
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
  hero: { backgroundColor: '#153b73', gap: spacing[4], paddingBottom: spacing[4], paddingHorizontal: spacing[3], paddingTop: spacing[2] },
  actionRow: { alignItems: 'center', flexDirection: 'row', gap: spacing[1] },
  search: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, flex: 1, flexDirection: 'row', gap: spacing[2], height: 46, paddingHorizontal: spacing[3] },
  searchText: { color: colors.brand, flex: 1, fontSize: typography.body },
  wallet: { backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', padding: spacing[3] },
  walletItem: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[2] },
  walletTitle: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  walletCopy: { color: colors.muted, fontSize: 11 },
  divider: { backgroundColor: colors.line, width: 1 },
  services: { gap: spacing[4], paddingHorizontal: spacing[2] },
  service: { alignItems: 'center', gap: spacing[2], width: 62 },
  serviceIcon: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, height: 55, justifyContent: 'center', width: 55 },
  serviceLabel: { color: colors.surface, fontSize: 11, textAlign: 'center' },
  campaign: { alignItems: 'center', backgroundColor: '#074a94', borderColor: '#2972bf', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[4] },
  campaignKicker: { color: '#b9dcff', fontSize: 11, fontWeight: '800' },
  campaignTitle: { color: colors.surface, fontSize: 23, fontWeight: '900', textTransform: 'uppercase' },
  campaignCopy: { color: '#dceeff', fontSize: typography.label },
  campaignTag: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: radius.pill, height: 54, justifyContent: 'center', width: 54 },
  campaignTagText: { color: colors.surface, fontSize: 17, fontWeight: '900' },
  whiteSection: { backgroundColor: colors.surface, gap: spacing[3], paddingVertical: spacing[3] },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginHorizontal: spacing[4] },
  categoryRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  category: { alignItems: 'center', gap: spacing[2], width: 68 },
  categoryIcon: { alignItems: 'center', backgroundColor: colors.brandSoft, borderColor: '#fff1ed', borderRadius: radius.pill, borderWidth: 1, height: 54, justifyContent: 'center', overflow: 'hidden', width: 54 },
  categoryImage: { height: '100%', width: '100%' },
  categoryLabel: { color: colors.ink, fontSize: typography.label, textAlign: 'center' },
  mediaRow: { flexDirection: 'row', gap: spacing[3], paddingHorizontal: spacing[3] },
  mediaPanel: { backgroundColor: colors.surface, borderRadius: radius.md, flex: 1, gap: spacing[1], padding: spacing[3] },
  panelHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  mediaTitle: { color: colors.brand, fontSize: 17, fontWeight: '900' },
  mediaCopy: { color: colors.muted, fontSize: typography.label },
  livePreview: { alignItems: 'center', backgroundColor: '#ee5137', borderRadius: radius.sm, flexDirection: 'row', gap: spacing[2], height: 70, justifyContent: 'center', marginTop: spacing[2] },
  livePreviewText: { color: colors.surface, fontWeight: '800' },
  videoPreview: { alignItems: 'center', backgroundColor: '#121d38', borderRadius: radius.sm, height: 70, justifyContent: 'center', marginTop: spacing[2] },
  saleHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingRight: spacing[4] },
  saleLabel: { color: colors.brand, fontSize: typography.label, fontWeight: '700' },
  flashRow: { gap: spacing[2], paddingHorizontal: spacing[4] },
  flashTile: { backgroundColor: colors.surface, borderRadius: radius.sm, overflow: 'hidden', paddingBottom: spacing[2], width: 125 },
  flashImage: { aspectRatio: 1, backgroundColor: colors.line, width: '100%' },
  flashName: { color: colors.ink, fontSize: typography.label, paddingHorizontal: spacing[2], paddingTop: spacing[1] },
  flashPrice: { color: colors.brand, fontWeight: '800', paddingHorizontal: spacing[2] },
  flashSold: { color: colors.muted, fontSize: 10, paddingHorizontal: spacing[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: spacing[3], rowGap: spacing[3] },
});
