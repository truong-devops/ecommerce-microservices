import { useMutation, useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Dimensions, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchProductDetail } from '@/api/buyer';
import { openConversation } from '@/api/chat';
import { fetchProductReviews, fetchReviewSummary } from '@/api/reviews';
import { useAuth } from '@/auth/auth-context';
import { useCart } from '@/cart/cart-context';
import { AppIcon } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { QuantityStepper } from '@/components/core/quantity-stepper';
import { ScreenState } from '@/components/core/screen-state';
import { cartItemFromProduct } from '@/domain/cart';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

const heroWidth = Dimensions.get('window').width;

export default function ProductDetailScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { dispatch } = useCart();
  const [sku, setSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const id = productId ?? '';
  const product = useQuery({ queryKey: ['product', id], queryFn: () => fetchProductDetail(id), enabled: Boolean(id) });
  const reviewSummary = useQuery({ queryKey: ['review-summary', id], queryFn: () => fetchReviewSummary(id), enabled: Boolean(id) });
  const reviews = useQuery({ queryKey: ['reviews', id], queryFn: () => fetchProductReviews(id), enabled: Boolean(id) });
  const selectedVariant = useMemo(() => {
    if (!product.data) return null;
    return product.data.variants.find((variant) => variant.sku === sku) ?? product.data.variants.find((variant) => variant.isDefault) ?? product.data.variants[0] ?? null;
  }, [product.data, sku]);
  const chat = useMutation({
    mutationFn: async () => {
      if (!session || !product.data) throw new Error('Đăng nhập để chat với shop');
      return openConversation(session.accessToken, { sellerId: product.data.sellerId, productId: product.data.id });
    },
    onSuccess: (conversation) => router.push(`/chat/${conversation.id}`),
    onError: (error) => {
      if (!session) router.push('/login');
      else Alert.alert('Không mở được chat', error.message);
    },
  });

  const addToCart = () => {
    if (!product.data || !selectedVariant) return;
    dispatch({ type: 'add', item: cartItemFromProduct(product.data, selectedVariant, quantity) });
    Alert.alert('Đã thêm vào giỏ hàng', product.data.title);
  };

  if (product.isPending) return <ScreenState title="Đang tải sản phẩm..." />;
  if (product.isError || !product.data) return <ScreenState title="Không tải được sản phẩm" detail={product.error?.message} />;

  const detail = product.data;
  const shownPrice = selectedVariant?.price ?? detail.price;
  const comparePrice = selectedVariant?.compareAtPrice ?? detail.compareAtPrice;
  const outOfStock = detail.stock === 0;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.ink} name="arrow-back-outline" onPress={() => router.back()} />
        <View style={styles.headerActions}>
          <IconButton
            accessibilityLabel="Chia sẻ"
            color={colors.ink}
            name="share-social-outline"
            onPress={() => void Share.share({ message: Linking.createURL(`/products/${id}`) })}
          />
          <CartLink color={colors.ink} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {detail.images.map((image) => (
              <Image key={image} source={{ uri: normalizeRemoteAssetUrl(image, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.hero} />
            ))}
          </ScrollView>
          <View style={styles.counter}><Text style={styles.counterText}>1/{Math.max(detail.images.length, 1)}</Text></View>
        </View>
        <View style={styles.card}>
          <View style={styles.priceLine}>
            <Text style={styles.price}>{Math.round(shownPrice).toLocaleString('vi-VN')}đ</Text>
            {detail.discountPercent > 0 ? <Text style={styles.sale}>-{detail.discountPercent}%</Text> : null}
            <Text style={styles.sold}>Đã bán</Text>
          </View>
          {comparePrice ? <Text style={styles.compare}>{Math.round(comparePrice).toLocaleString('vi-VN')}đ</Text> : null}
          <View style={styles.titleLine}>
            <Text style={styles.mall}>Mall</Text>
            <Text style={styles.title}>{detail.title}</Text>
          </View>
          {reviewSummary.data ? (
            <View style={styles.rating}>
              <Text style={styles.ratingScore}>{reviewSummary.data.averageRating.toFixed(1)}</Text>
              <AppIcon color={colors.warning} name="star" size={16} />
              <Text style={styles.secondary}>  |  {reviewSummary.data.totalReviews} đánh giá</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.promo}>
          <AppIcon color={colors.brand} name="ticket-outline" size={21} />
          <Text style={styles.promoTitle}>Giảm 15%</Text>
          <Text style={styles.secondary}>Voucher dành cho bạn</Text>
          <AppIcon color={colors.muted} name="chevron-forward" size={16} />
        </View>
        <View style={styles.card}>
          <View style={styles.row}><AppIcon color={colors.teal} name="car-outline" size={20} /><Text style={styles.secondary}>Nhận hàng nhanh - Freeship theo điều kiện</Text></View>
          <Text style={outOfStock ? styles.soldOut : styles.secondary}>
            {outOfStock ? 'Hết hàng' : detail.stock == null ? 'Tồn kho đang cập nhật' : `Còn ${detail.stock} sản phẩm`}
          </Text>
          <Text style={styles.secondary}>{detail.description}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.section}>Phân loại</Text>
          <View style={styles.chips}>
            {detail.variants.map((variant) => (
              <Pressable key={variant.sku} onPress={() => setSku(variant.sku)} style={[styles.chip, selectedVariant?.sku === variant.sku ? styles.chipSelected : null]}>
                <Text style={selectedVariant?.sku === variant.sku ? styles.chipTextSelected : styles.chipText}>{variant.name}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.quantityLine}><Text style={styles.secondary}>Số lượng</Text><QuantityStepper onChange={setQuantity} quantity={quantity} /></View>
        </View>
        <View style={styles.shopCard}>
          <View style={styles.shopLogo}><AppIcon color={colors.brand} name="storefront-outline" size={26} /></View>
          <View style={styles.shopBody}><Text style={styles.section}>{detail.sellerCode ?? 'DT Official Store'}</Text><Text style={styles.secondary}>Phản hồi nhanh | Chính hãng</Text></View>
          <PrimaryButton variant="outline" onPress={() => router.push(`/shops/${encodeURIComponent(detail.sellerId)}`)}>Xem shop</PrimaryButton>
        </View>
        <View style={styles.card}>
          <Text style={styles.section}>Đánh giá sản phẩm</Text>
          {reviews.data?.items.length ? reviews.data.items.slice(0, 2).map((review) => (
            <View key={review.id} style={styles.review}><Text style={styles.ratingScore}>{review.rating}/5 ★</Text><Text>{review.content}</Text></View>
          )) : <Text style={styles.secondary}>Chưa có đánh giá.</Text>}
        </View>
      </ScrollView>
      <View style={styles.sticky}>
        <Pressable onPress={() => chat.mutate()} style={styles.actionIcon}><AppIcon color={colors.brand} name="chatbubble-ellipses-outline" /><Text style={styles.actionText}>Chat</Text></Pressable>
        <Pressable disabled={!selectedVariant || outOfStock} onPress={addToCart} style={styles.actionIcon}><AppIcon color={colors.brand} name="cart-outline" /><Text style={styles.actionText}>Thêm giỏ</Text></Pressable>
        <View style={styles.buy}><PrimaryButton disabled={!selectedVariant || outOfStock} onPress={() => { addToCart(); router.push('/cart'); }}>Mua ngay  {Math.round(shownPrice).toLocaleString('vi-VN')}đ</PrimaryButton></View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  headerActions: { flexDirection: 'row', gap: spacing[1] },
  content: { gap: spacing[2], paddingBottom: 74 },
  hero: { aspectRatio: 1, backgroundColor: colors.line, width: heroWidth },
  counter: { backgroundColor: colors.overlay, borderRadius: radius.pill, bottom: spacing[3], paddingHorizontal: spacing[3], paddingVertical: spacing[1], position: 'absolute', right: spacing[3] },
  counterText: { color: colors.surface },
  card: { backgroundColor: colors.surface, gap: spacing[2], padding: spacing[3] },
  priceLine: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  price: { color: colors.brand, fontSize: typography.headline, fontWeight: '800' },
  sale: { backgroundColor: colors.brandSoft, color: colors.brand, fontWeight: '800', paddingHorizontal: spacing[2] },
  sold: { color: colors.muted, marginLeft: 'auto' },
  compare: { color: colors.muted, textDecorationLine: 'line-through' },
  titleLine: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] },
  mall: { backgroundColor: colors.brand, borderRadius: 3, color: colors.surface, fontWeight: '800', paddingHorizontal: spacing[1] },
  title: { color: colors.ink, flex: 1, fontSize: 17, fontWeight: '600' },
  secondary: { color: colors.muted, fontSize: typography.body },
  rating: { alignItems: 'center', flexDirection: 'row' },
  ratingScore: { color: colors.brand, fontWeight: '700' },
  promo: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  promoTitle: { color: colors.brand, fontWeight: '800' },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  soldOut: { color: colors.brand, fontWeight: '700' },
  section: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: { borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, padding: spacing[2] },
  chipSelected: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipText: { color: colors.ink },
  chipTextSelected: { color: colors.brand, fontWeight: '700' },
  quantityLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing[2] },
  shopCard: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', gap: spacing[3], padding: spacing[3] },
  shopLogo: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, height: 50, justifyContent: 'center', width: 50 },
  shopBody: { flex: 1, gap: spacing[1] },
  review: { borderTopColor: colors.line, borderTopWidth: 1, gap: spacing[1], paddingTop: spacing[2] },
  sticky: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: 1, bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0 },
  actionIcon: { alignItems: 'center', borderRightColor: colors.line, borderRightWidth: 1, gap: 2, justifyContent: 'center', width: 64 },
  actionText: { color: colors.brand, fontSize: 11 },
  buy: { flex: 1, padding: spacing[2] },
});
