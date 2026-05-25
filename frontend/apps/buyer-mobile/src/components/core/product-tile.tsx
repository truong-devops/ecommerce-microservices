import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/core/app-icon';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

interface TileProduct {
  id: string;
  title: string;
  image: string;
  price: number;
  discountPercent?: number;
}

export function ProductTile({ product, width }: { product: TileProduct; width?: number }) {
  const router = useRouter();
  const rawImage = product.image;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/products/${encodeURIComponent(product.id)}`)}
      style={[styles.tile, width ? { width } : null]}
    >
      <Image source={{ uri: normalizeRemoteAssetUrl(rawImage, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.image} />
      {product.discountPercent && product.discountPercent > 0 ? (
        <View style={styles.saleBadge}>
          <Text style={styles.saleText}>-{product.discountPercent}%</Text>
        </View>
      ) : null}
      <Text numberOfLines={2} style={styles.name}>
        {product.title}
      </Text>
      <View style={styles.footer}>
        <Text style={styles.price}>{Math.round(product.price).toLocaleString('vi-VN')}đ</Text>
        <View style={styles.mall}>
          <AppIcon color={colors.brand} name="shield-checkmark" size={11} />
          <Text style={styles.mallText}>Mall</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    gap: spacing[1],
    overflow: 'hidden',
    paddingBottom: spacing[2],
    position: 'relative',
    width: '48.5%'
  },
  image: {
    aspectRatio: 1,
    backgroundColor: colors.line,
    width: '100%'
  },
  name: {
    color: colors.ink,
    fontSize: typography.body,
    lineHeight: 20,
    minHeight: 40,
    paddingHorizontal: spacing[2]
  },
  price: {
    color: colors.brand,
    fontSize: typography.body,
    fontWeight: '700',
    paddingHorizontal: spacing[2]
  },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingRight: spacing[2] },
  mall: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  mallText: { color: colors.brand, fontSize: 10, fontWeight: '700' },
  saleBadge: { backgroundColor: colors.brandSoft, paddingHorizontal: spacing[2], paddingVertical: 3, position: 'absolute', right: 0, top: 0 },
  saleText: { color: colors.brand, fontSize: typography.label, fontWeight: '800' }
});
