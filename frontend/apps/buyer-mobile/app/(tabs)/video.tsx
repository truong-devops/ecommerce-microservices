import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BuyerVideo, BuyerVideoComment } from '@frontend/buyer-contracts';
import { fetchProductDetail } from '@/api/buyer';
import { createVideoComment, fetchVideoComments, fetchVideos, trackVideoEvent } from '@/api/videos';
import { useAuth } from '@/auth/auth-context';
import { useCart } from '@/cart/cart-context';
import { AppIcon } from '@/components/core/app-icon';
import { CartLink } from '@/components/core/cart-link';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { BuyerVideoPlayer } from '@/components/video/buyer-video-player';
import { cartItemFromProduct } from '@/domain/cart';
import { selectVideoPlaybackSource } from '@/domain/media-playback';
import { mergeVideoComments, normalizeVideoComment, videoEventId } from '@/domain/video';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { normalizeRemoteAssetUrl } from '@/utils/asset-url';

const LIKES_KEY = 'buyer.video.likes.v1';
const pageHeight = Dimensions.get('window').height - 92;

export default function VideoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ videoId?: string }>();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { dispatch } = useCart();
  const [activeIndex, setActiveIndex] = useState(0);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentInputRef = useRef<TextInput>(null);
  const trackedStarts = useRef(new Set<string>());
  const trackedQualified = useRef(new Set<string>());
  const initialVideoApplied = useRef(false);
  const videos = useQuery({ queryKey: ['videos'], queryFn: fetchVideos });
  const activeVideo = videos.data?.[activeIndex];
  const comments = useQuery({ queryKey: ['video-comments', activeVideo?.videoId], queryFn: () => fetchVideoComments(activeVideo!.videoId), enabled: Boolean(activeVideo) });

  useEffect(() => {
    if (initialVideoApplied.current || !params.videoId || !videos.data) return;
    const index = videos.data.findIndex((video) => video.videoId === params.videoId);
    if (index >= 0) setActiveIndex(index);
    initialVideoApplied.current = true;
  }, [params.videoId, videos.data]);

  useEffect(() => {
    void AsyncStorage.getItem(LIKES_KEY).then((raw) => {
      try {
        setLikes(new Set(JSON.parse(raw ?? '[]') as string[]));
      } catch {
        setLikes(new Set());
      }
    });
  }, []);

  useEffect(() => {
    if (!activeVideo) return;
    if (!trackedStarts.current.has(activeVideo.videoId)) {
      trackedStarts.current.add(activeVideo.videoId);
      void trackVideoEvent(activeVideo.videoId, 'view-started', { clientEventId: videoEventId(activeVideo.videoId, 'view-started') });
    }
    const timer = setTimeout(() => {
      if (!trackedQualified.current.has(activeVideo.videoId)) {
        trackedQualified.current.add(activeVideo.videoId);
        void trackVideoEvent(activeVideo.videoId, 'view-qualified', {
          clientEventId: videoEventId(activeVideo.videoId, 'view-qualified'),
          watchTimeSec: 3
        });
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [activeVideo]);

  const buyNow = useMutation({
    mutationFn: async ({ video, productId }: { video: BuyerVideo; productId: string }) => {
      const detail = await fetchProductDetail(productId);
      const variant = detail.variants.find((item) => item.isDefault) ?? detail.variants[0];
      if (!variant) throw new Error('Sản phẩm chưa có phiên bản để mua');
      dispatch({ type: 'buy-now', item: cartItemFromProduct(detail, variant, 1) });
      await trackVideoEvent(video.videoId, 'product-clicked', {
        productId,
        clientEventId: videoEventId(video.videoId, 'product-clicked', productId)
      });
    },
    onSuccess: () => router.push('/checkout'),
    onError: (error) => Alert.alert('Không mua được sản phẩm', error.message)
  });
  const comment = useMutation({
    mutationFn: async ({ videoId, text, clientCommentId }: { videoId: string; text: string; clientCommentId: string }) => {
      if (!session) throw new Error('Đăng nhập để bình luận');
      return createVideoComment(session.accessToken, videoId, text, clientCommentId);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<BuyerVideoComment[]>(['video-comments', created.videoId], (current) =>
        mergeVideoComments(current ?? [], created),
      );
      setDraft('');
    },
    onError: (error) => Alert.alert('Không gửi được bình luận', error.message)
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<BuyerVideo>[] }) => {
    const index = viewableItems.find((item) => item.isViewable)?.index;
    if (typeof index === 'number') setActiveIndex(index);
  }).current;

  const openComments = () => {
    setCommentsOpen(true);
    setTimeout(() => commentInputRef.current?.focus(), 120);
  };

  const submitComment = () => {
    if (!activeVideo) return;
    comment.mutate({
      videoId: activeVideo.videoId,
      text: normalizeVideoComment(draft),
      clientCommentId: `mobile-${Crypto.randomUUID()}`,
    });
  };

  if (videos.isPending) return <ScreenState title="Đang tải video..." />;
  if (videos.isError) return <ScreenState title="Không tải được video" detail={videos.error.message} />;
  if (!videos.data?.length) return <ScreenState title="Chưa có video mua sắm" />;

  return (
    <View style={styles.safeArea}>
      <View style={[styles.topbar, { top: insets.top + spacing[2] }]}>
        <AppIcon color={colors.surface} name="person-circle-outline" size={28} />
        <View style={styles.tabs}>
          <View style={styles.tabTarget}>
            <Text style={styles.activeTab}>Video</Text>
          </View>
          <Pressable accessibilityLabel="Mở livestream" accessibilityRole="button" hitSlop={6} onPress={() => router.push('/live')} style={styles.tabTarget}>
            <Text style={styles.tab}>Live</Text>
          </Pressable>
          <View style={styles.tabTarget}>
            <Text style={styles.tab}>Cho bạn</Text>
          </View>
        </View>
        <CartLink color={colors.surface} />
      </View>
      <FlatList
        data={videos.data}
        keyExtractor={(item) => item.videoId}
        onViewableItemsChanged={onViewableItemsChanged}
        pagingEnabled
        renderItem={({ item, index }) => (
          <View style={styles.page}>
            <BuyerVideoPlayer active={index === activeIndex} noMediaLabel="Video chưa sẵn sàng" source={selectVideoPlaybackSource(item)} />
            <View style={styles.overlay}>
              <View style={styles.creator}>
                <Text style={styles.shop}>@{item.seller.shopName}</Text>
                <View style={styles.follow}><Text style={styles.followText}>+ Theo dõi</Text></View>
              </View>
              <View style={styles.products}>
                {item.products.slice(0, 2).map((product) => (
                  <View key={product.productId} style={styles.product}>
                    {product.image ? <Image source={{ uri: normalizeRemoteAssetUrl(product.image, process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.productImage} /> : null}
                    <Pressable onPress={() => {
                      void trackVideoEvent(item.videoId, 'product-clicked', { productId: product.productId, clientEventId: videoEventId(item.videoId, 'product-clicked', product.productId) });
                      router.push(`/products/${product.productId}`);
                    }}>
                      <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
                      <View style={styles.productTags}><Text style={styles.tag}>Mall</Text><Text style={styles.tagOutline}>Voucher</Text></View>
                      <Text style={styles.price}>{Math.round(product.price).toLocaleString('vi-VN')}đ</Text>
                    </Pressable>
                    <Pressable disabled={buyNow.isPending} onPress={() => buyNow.mutate({ video: item, productId: product.productId })} style={styles.add}><Text style={styles.addText}>Mua ngay</Text></Pressable>
                  </View>
                ))}
              </View>
              <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
            </View>
            <View style={styles.rail}>
              <Pressable onPress={() => {
                const next = new Set(likes);
                next.has(item.videoId) ? next.delete(item.videoId) : next.add(item.videoId);
                setLikes(next);
                void AsyncStorage.setItem(LIKES_KEY, JSON.stringify([...next]));
              }} style={styles.railAction}>
                <AppIcon color={colors.surface} name={likes.has(item.videoId) ? 'heart' : 'heart-outline'} size={34} />
                <Text style={styles.railLabel}>{likes.has(item.videoId) ? 'Đã thích' : 'Thích'}</Text>
              </Pressable>
              <Pressable onPress={openComments} style={styles.railAction}>
                <AppIcon color={colors.surface} name="chatbubble-outline" size={31} />
                <Text style={styles.railLabel}>{item.metrics.commentCount ?? 0}</Text>
              </Pressable>
              <Pressable onPress={() => void Share.share({ message: Linking.createURL('/video', { queryParams: { videoId: item.videoId } }) })} style={styles.railAction}>
                <AppIcon color={colors.surface} name="arrow-redo-outline" size={32} />
                <Text style={styles.railLabel}>Chia sẻ</Text>
              </Pressable>
            </View>
          </View>
        )}
        snapToInterval={pageHeight}
      />
      <View style={styles.commentPanel}>
        <Text numberOfLines={1} style={styles.commentPreview}>{comments.data?.[0]?.text ?? 'Viết bình luận cho sản phẩm...'}</Text>
        <View style={styles.composer}>
          <TextInput ref={commentInputRef} maxLength={1000} onChangeText={setDraft} placeholder="Bạn đang nghĩ gì..." placeholderTextColor="#d1d5db" style={styles.input} value={draft} />
          <PrimaryButton
            disabled={!draft.trim()}
            loading={comment.isPending}
            onPress={submitComment}
          >
            Gửi
          </PrimaryButton>
        </View>
      </View>
      <Modal animationType="slide" onRequestClose={() => setCommentsOpen(false)} transparent visible={commentsOpen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.commentModalRoot}>
          <Pressable onPress={() => setCommentsOpen(false)} style={styles.commentBackdrop} />
          <View style={[styles.commentSheet, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
            <View style={styles.commentSheetHeader}>
              <View>
                <Text style={styles.commentSheetTitle}>Bình luận</Text>
                <Text style={styles.commentSheetSubtitle}>{comments.data?.length ?? 0} tin nhắn trong video này</Text>
              </View>
              <Pressable accessibilityLabel="Đóng bình luận" hitSlop={10} onPress={() => setCommentsOpen(false)}>
                <AppIcon color={colors.muted} name="close" size={24} />
              </Pressable>
            </View>
            <FlatList
              contentContainerStyle={styles.commentList}
              data={comments.data ?? []}
              keyExtractor={(item, index) => item.commentId || item.clientCommentId || `${item.videoId}-${index}`}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.emptyComments}>Chưa có bình luận. Hãy là người đầu tiên nhắn ở video này.</Text>}
              renderItem={({ item }) => (
                <View style={styles.commentBubble}>
                  <View style={styles.commentAvatar}><AppIcon color={colors.brand} name="person" size={16} /></View>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>Người mua</Text>
                    <Text style={styles.commentText}>{item.text}</Text>
                  </View>
                </View>
              )}
            />
            <View style={styles.sheetComposer}>
              <TextInput ref={commentInputRef} maxLength={1000} onChangeText={setDraft} placeholder="Nhập bình luận..." placeholderTextColor={colors.muted} style={styles.sheetInput} value={draft} />
              <PrimaryButton disabled={!draft.trim()} loading={comment.isPending} onPress={submitComment}>Gửi</PrimaryButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.media, flex: 1 },
  topbar: { alignItems: 'center', flexDirection: 'row', left: spacing[3], position: 'absolute', right: spacing[3], zIndex: 5 },
  tabs: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[3], justifyContent: 'center' },
  tabTarget: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing[1] },
  tab: { color: '#e5e7eb', fontSize: 16, fontWeight: '600', paddingBottom: spacing[2] },
  activeTab: { borderBottomColor: colors.surface, borderBottomWidth: 2, color: colors.surface, fontSize: 17, fontWeight: '800', paddingBottom: spacing[2] },
  page: { backgroundColor: colors.media, height: pageHeight, position: 'relative' },
  overlay: { bottom: 72, gap: spacing[2], left: spacing[3], position: 'absolute', right: 72 },
  creator: { alignItems: 'center', flexDirection: 'row', gap: spacing[2] },
  shop: { color: colors.surface, fontWeight: '800' },
  follow: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  followText: { color: colors.surface, fontSize: typography.label, fontWeight: '700' },
  title: { color: colors.surface, fontSize: 16, fontWeight: '700' },
  products: { gap: spacing[2] },
  product: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: radius.md, flexDirection: 'row', gap: spacing[2], padding: spacing[2] },
  productImage: { backgroundColor: colors.line, borderRadius: radius.sm, height: 57, width: 57 },
  productName: { color: colors.ink, maxWidth: 160 },
  productTags: { flexDirection: 'row', gap: spacing[1] },
  tag: { backgroundColor: colors.brand, color: colors.surface, fontSize: 10, paddingHorizontal: 3 },
  tagOutline: { borderColor: colors.brand, borderWidth: 1, color: colors.brand, fontSize: 10, paddingHorizontal: 3 },
  price: { color: colors.brand, fontSize: 16, fontWeight: '800' },
  add: { backgroundColor: colors.brand, borderRadius: radius.sm, marginLeft: 'auto', paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  addText: { color: colors.surface, fontWeight: '700' },
  rail: { bottom: 104, gap: spacing[4], position: 'absolute', right: spacing[3] },
  railAction: { alignItems: 'center', gap: spacing[1] },
  railLabel: { color: colors.surface, fontSize: typography.label, fontWeight: '700', textAlign: 'center' },
  commentPanel: { alignItems: 'center', backgroundColor: colors.media, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  commentPreview: { color: '#d1d5db', display: 'none' },
  composer: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[2] },
  input: { backgroundColor: '#262a32', borderRadius: radius.pill, color: colors.surface, flex: 1, height: 42, paddingHorizontal: spacing[3] },
  commentModalRoot: { flex: 1, justifyContent: 'flex-end' },
  commentBackdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1 },
  commentSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '68%', minHeight: 390, paddingHorizontal: spacing[4], paddingTop: spacing[4] },
  commentSheetHeader: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing[3] },
  commentSheetTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  commentSheetSubtitle: { color: colors.muted, marginTop: 2 },
  commentList: { flexGrow: 1, gap: spacing[3], paddingVertical: spacing[3] },
  emptyComments: { color: colors.muted, lineHeight: 20, paddingVertical: spacing[6], textAlign: 'center' },
  commentBubble: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] },
  commentAvatar: { alignItems: 'center', backgroundColor: '#fff1ed', borderRadius: radius.pill, height: 32, justifyContent: 'center', width: 32 },
  commentBody: { backgroundColor: colors.background, borderRadius: radius.lg, flex: 1, padding: spacing[3] },
  commentAuthor: { color: colors.ink, fontSize: typography.label, fontWeight: '700', marginBottom: 3 },
  commentText: { color: colors.ink, lineHeight: 20 },
  sheetComposer: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: spacing[2], paddingTop: spacing[3] },
  sheetInput: { backgroundColor: colors.background, borderRadius: radius.pill, color: colors.ink, flex: 1, height: 44, paddingHorizontal: spacing[3] }
});
