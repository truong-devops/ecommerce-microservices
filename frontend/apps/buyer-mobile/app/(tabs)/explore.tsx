import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { searchProducts } from '@/api/buyer';
import { AppIcon } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { PrimaryButton } from '@/components/core/primary-button';
import { ProductTile } from '@/components/core/product-tile';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function ExploreScreen() {
  const { width } = useWindowDimensions();
  const productTileWidth = Math.floor((width - spacing[3] * 2 - spacing[2]) / 2);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const products = useQuery({ queryKey: ['products', search], queryFn: () => searchProducts({ page: 1, pageSize: 20, search }) });

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.topline}>
          <View style={styles.searchBox}>
            <AppIcon color={colors.muted} name="search-outline" size={20} />
            <TextInput
              accessibilityLabel="Tìm kiếm sản phẩm"
              onChangeText={setDraft}
              onSubmitEditing={() => setSearch(draft.trim())}
              placeholder="Tìm kiếm trong emall"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={draft}
            />
            <AppIcon color={colors.muted} name="camera-outline" size={20} />
          </View>
          <CartLink color={colors.surface} />
        </View>
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>EMALL</Text>
          <Text style={styles.bannerTitle}>Thương hiệu chính hãng</Text>
          <Text style={styles.bannerCopy}>Trả hàng 15 ngày  |  Miễn phí giao hàng</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.features}>
          {['Premium', 'Deal siêu hot', 'Thương hiệu mới', 'Quốc tế', 'Flash Sale'].map((label) => (
            <View key={label} style={styles.feature}>
              <View style={styles.featureIcon}><AppIcon color={colors.brand} name="diamond-outline" size={24} /></View>
              <Text style={styles.featureLabel}>{label}</Text>
            </View>
          ))}
        </ScrollView>
        <PrimaryButton onPress={() => setSearch(draft.trim())}>Tìm sản phẩm</PrimaryButton>
      </View>
      {products.isPending ? <ScreenState title="Đang tải sản phẩm..." /> : null}
      {products.isError ? <ScreenState title="Không tải được sản phẩm" detail={products.error.message} /> : null}
      {products.data ? (
        <FlatList
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          data={products.data.items}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => <ProductTile product={item} width={productTileWidth} />}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { backgroundColor: colors.surface, gap: spacing[3], paddingBottom: spacing[3] },
  topline: { alignItems: 'center', backgroundColor: colors.brand, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  searchBox: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, flex: 1, flexDirection: 'row', height: 45, paddingHorizontal: spacing[2] },
  input: {
    color: colors.ink,
    flex: 1,
    height: 44,
    paddingHorizontal: spacing[2]
  },
  banner: { backgroundColor: colors.brandSoft, gap: spacing[1], padding: spacing[4] },
  bannerLabel: { color: colors.brand, fontSize: typography.label, fontWeight: '900' },
  bannerTitle: { color: colors.ink, fontSize: typography.title, fontWeight: '900' },
  bannerCopy: { color: colors.muted },
  features: { gap: spacing[3], paddingHorizontal: spacing[3] },
  feature: { alignItems: 'center', gap: spacing[1], width: 70 },
  featureIcon: { alignItems: 'center', borderColor: colors.line, borderRadius: radius.md, borderWidth: 1, height: 52, justifyContent: 'center', width: 52 },
  featureLabel: { color: colors.ink, fontSize: 10, textAlign: 'center' },
  list: { paddingHorizontal: spacing[3], paddingVertical: spacing[3], rowGap: spacing[3] },
  row: { justifyContent: 'space-between' }
});
