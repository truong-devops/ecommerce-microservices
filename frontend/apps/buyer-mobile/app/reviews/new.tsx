import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchProductDetail } from '@/api/buyer';
import { fetchOrder } from '@/api/commerce';
import { createReview } from '@/api/reviews';
import { useAuth } from '@/auth/auth-context';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function NewReviewScreen() {
  const { orderId, productId } = useLocalSearchParams<{ orderId: string; productId: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const order = useQuery({ queryKey: ['order', orderId], queryFn: () => fetchOrder(session!.accessToken, orderId!), enabled: Boolean(session && orderId) });
  const product = useQuery({ queryKey: ['product', productId], queryFn: () => fetchProductDetail(productId!), enabled: Boolean(productId) });
  const submit = useMutation({
    mutationFn: () => createReview(session!.accessToken, { order: order.data!, productId: productId!, sellerId: product.data!.sellerId, rating, content }),
    onSuccess: () => {
      Alert.alert('Đã gửi đánh giá');
      router.back();
    },
    onError: (error) => Alert.alert('Không gửi được đánh giá', error.message)
  });

  if (!session) return <ScreenState title="Đăng nhập để đánh giá" />;
  if (order.isPending || product.isPending) return <ScreenState title="Đang kiểm tra đơn hàng..." />;
  if (!order.data || !product.data) return <ScreenState title="Không đủ dữ liệu đánh giá" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Text onPress={() => router.back()} style={styles.back}>Quay lại</Text>
      <Text style={styles.title}>Đánh giá sản phẩm</Text>
      <Text style={styles.name}>{product.data.title}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Text key={value} onPress={() => setRating(value)} style={[styles.star, value <= rating ? styles.active : null]}>{value} sao</Text>
        ))}
      </View>
      <TextInput multiline onChangeText={setContent} placeholder="Chia sẻ trải nghiệm của bạn" style={styles.input} value={content} />
      <PrimaryButton disabled={!content.trim()} loading={submit.isPending} onPress={() => submit.mutate()}>Gửi đánh giá</PrimaryButton>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1, gap: spacing[3], padding: spacing[4] },
  back: { color: colors.brand, fontWeight: '700' },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: '900' },
  name: { color: colors.ink, fontWeight: '700' },
  stars: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  star: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, color: colors.muted, padding: spacing[2] },
  active: { borderColor: colors.brand, color: colors.brand },
  input: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, minHeight: 120, padding: spacing[3] }
});
