import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Keyboard, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { searchProducts } from '@/api/buyer';
import { AppIcon } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { IconButton } from '@/components/core/icon-button';
import { ProductTile } from '@/components/core/product-tile';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function SearchScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const productTileWidth = Math.floor((width - spacing[3] * 2 - spacing[2]) / 2);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const products = useQuery({
    queryKey: ['search-products', search],
    queryFn: () => searchProducts({ page: 1, pageSize: 100, search })
  });

  const submitSearch = () => {
    const query = draft.trim();
    setSearch(query);
    Keyboard.dismiss();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
        <View style={styles.searchBox}>
          <AppIcon color={colors.muted} name="search-outline" size={20} />
          <TextInput
            accessibilityLabel="Tìm kiếm sản phẩm"
            autoFocus
            clearButtonMode="while-editing"
            onChangeText={setDraft}
            onSubmitEditing={submitSearch}
            placeholder="Tìm sản phẩm, thương hiệu..."
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.input}
            value={draft}
          />
          <IconButton accessibilityLabel="Tìm sản phẩm" color={colors.brand} name="search-outline" onPress={submitSearch} size={20} />
        </View>
        <CartLink color={colors.brand} />
      </View>
      <Text style={styles.resultTitle}>{search ? `Kết quả cho "${search}"` : 'Tất cả sản phẩm'}</Text>
      {products.isPending ? <ScreenState title="Đang tải sản phẩm..." /> : null}
      {products.isError ? <ScreenState title="Không tải được sản phẩm" detail={products.error.message} /> : null}
      {products.data ? (
        <FlatList
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.list, products.data.items.length === 0 && styles.emptyList]}
          data={products.data.items}
          keyboardDismissMode="on-drag"
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<ScreenState title="Không có sản phẩm phù hợp" />}
          numColumns={2}
          renderItem={({ item }) => <ProductTile product={item} width={productTileWidth} />}
          showsVerticalScrollIndicator={false}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3]
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    height: 46,
    paddingHorizontal: spacing[2]
  },
  input: { color: colors.ink, flex: 1, fontSize: typography.body, height: 45, paddingHorizontal: spacing[2] },
  resultTitle: { color: colors.ink, fontSize: typography.body, fontWeight: '700', paddingHorizontal: spacing[3], paddingTop: spacing[3] },
  list: { paddingHorizontal: spacing[3], paddingVertical: spacing[3], rowGap: spacing[3] },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  row: { justifyContent: 'space-between' }
});
