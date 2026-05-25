import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchShopDetail, searchProducts } from '@/api/buyer';
import { CartLink } from '@/components/core/cart-link';
import { ProductTile } from '@/components/core/product-tile';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

export default function ShopScreen() {
  const { sellerId } = useLocalSearchParams<{ sellerId: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const productWidth = Math.floor((width - spacing[4] * 2 - spacing[3]) / 2);
  const id = sellerId ?? '';
  const shop = useQuery({ queryKey: ['shop', id], queryFn: () => fetchShopDetail(id), enabled: Boolean(id) });
  const products = useQuery({ queryKey: ['shop-products', id], queryFn: () => searchProducts({ sellerId: id, pageSize: 20 }), enabled: Boolean(id) });

  if (shop.isPending) return <ScreenState title="Đang tải shop..." />;
  if (shop.isError || !shop.data) return <ScreenState title="Không tải được shop" detail={shop.error?.message} />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}><Text style={styles.headerText}>Quay lại</Text></Pressable>
        <CartLink />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={{ uri: normalizeRemoteAssetUrl(shop.data.bannerUrl, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.banner} />
        <View style={styles.identity}>
          <Image source={{ uri: normalizeRemoteAssetUrl(shop.data.logoUrl, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.logo} />
          <View style={styles.identityText}>
            <Text style={styles.title}>{shop.data.shopName}</Text>
            <Text style={styles.copy}>{shop.data.slogan}</Text>
          </View>
        </View>
        {shop.data.navItems?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}>
            {shop.data.navItems.map((item) => <Text key={item} style={styles.chip}>{item}</Text>)}
          </ScrollView>
        ) : null}
        <Text style={styles.section}>Sản phẩm của shop</Text>
        {products.isError ? <ScreenState title="Không tải được sản phẩm shop" /> : null}
        <View style={styles.grid}>
          {products.data?.items.map((product) => <ProductTile key={product.id} product={product} width={productWidth} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.brand, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[4] },
  headerText: { color: colors.surface, fontWeight: '700' },
  content: { gap: spacing[3], paddingBottom: spacing[6] },
  banner: { aspectRatio: 3, backgroundColor: colors.line, width: '100%' },
  identity: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, flexDirection: 'row', gap: spacing[3], marginHorizontal: spacing[4], marginTop: -32, padding: spacing[3] },
  logo: { backgroundColor: colors.line, borderRadius: 28, height: 56, width: 56 },
  identityText: { flex: 1, gap: spacing[1] },
  title: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  copy: { color: colors.muted, fontSize: typography.body },
  nav: { gap: spacing[2], paddingHorizontal: spacing[4] },
  chip: { backgroundColor: colors.surface, borderRadius: radius.sm, color: colors.ink, padding: spacing[2] },
  section: { color: colors.ink, fontSize: 18, fontWeight: '800', paddingHorizontal: spacing[4] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: spacing[4], rowGap: spacing[3] }
});
