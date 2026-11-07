import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type ViewToken
} from 'react-native';
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

export default function VideoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ videoId?: string }>();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { dispatch } = useCart();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAppActive, setAppActive] = useState(AppState.currentState === 'active');
  const [pageHeight, setPageHeight] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [commentsOpen, setCommentsOpen] = useState(false);
  const commentInputRef = useRef<TextInput>(null);
  const trackedStarts = useRef(new Set<string>());
  const trackedQualified = useRef(new Set<string>());
  const initialVideoApplied = useRef(false);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;
  const videos = useQuery({ queryKey: ['videos'], queryFn: fetchVideos });
  const activeVideo = videos.data?.[activeIndex];
  const comments = useQuery({
    queryKey: ['video-comments', activeVideo?.videoId],
    queryFn: () => fetchVideoComments(activeVideo!.videoId),
    enabled: Boolean(activeVideo)
  });
  const canPlayVideo = isFocused && isAppActive;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

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
      void trackVideoEvent(activeVideo.videoId, 'view-started', {
        clientEventId: videoEventId(activeVideo.videoId, 'view-started')
      });
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
    mutationFn: async ({
      videoId,
      text,
      clientCommentId
    }: {
      videoId: string;
      text: string;
      clientCommentId: string;
    }) => {
      if (!session) throw new Error('Đăng nhập để bình luận');
      return createVideoComment(session.accessToken, videoId, text, clientCommentId);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<BuyerVideoComment[]>(['video-comments', created.videoId], (current) =>
        mergeVideoComments(current ?? [], created)
      );
      setDraft('');
    },
    onError: (error) => Alert.alert('Không gửi được bình luận', error.message)
  });

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<BuyerVideo>[] }) => {
    const index = viewableItems.find((item) => item.isViewable)?.index;
    if (typeof index === 'number') {
      setActiveIndex(index);
      setPausedByUser(false);
    }
  }).current;

  const handleListLayout = (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height > 0 && height !== pageHeight) {
      setPageHeight(height);
    }
  };

  const openComments = () => {
    setCommentsOpen(true);
    setTimeout(() => commentInputRef.current?.focus(), 120);
  };

  const submitComment = () => {
    if (!activeVideo) return;
    comment.mutate({
      videoId: activeVideo.videoId,
      text: normalizeVideoComment(draft),
      clientCommentId: `mobile-${Crypto.randomUUID()}`
    });
  };

  if (videos.isPending) return <ScreenState title="Đang tải video..." />;
  if (videos.isError) return <ScreenState title="Không tải được video" detail={videos.error.message} />;
  if (!videos.data?.length) return <ScreenState title="Chưa có video mua sắm" />;

  return (
    <View style={styles.safeArea}>
      {/* Top Header */}
      <View style={[styles.topbar, { top: insets.top + spacing[2] }]}>
        <View style={styles.topbarSpacer} />
        <View style={styles.tabs}>
          <View style={styles.tabTarget}>
            <Text style={styles.activeTab}>Video</Text>
          </View>
          <Pressable
            accessibilityLabel="Mở livestream"
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => router.push('/live')}
            style={styles.tabTarget}
          >
            <Text style={styles.tab}>Live</Text>
          </Pressable>
          <View style={styles.tabTarget}>
            <Text style={styles.tab}>Cho bạn</Text>
          </View>
        </View>
        <CartLink color={colors.surface} />
      </View>

      {/* Sound toggle */}
      <Pressable
        accessibilityLabel={soundEnabled ? 'Tắt âm thanh video' : 'Bật âm thanh video'}
        accessibilityRole="button"
        hitSlop={12}
        onPress={() => setSoundEnabled((value) => !value)}
        style={[styles.soundToggle, { top: insets.top + 54 }]}
      >
        <AppIcon color={colors.surface} name={soundEnabled ? 'volume-high' : 'volume-mute'} size={20} />
        <Text style={styles.soundText}>{soundEnabled ? 'Đang bật tiếng' : 'Bật tiếng'}</Text>
      </Pressable>

      {/* Pause/Play center toggle */}
      <Pressable
        accessibilityLabel={pausedByUser ? 'Phát video' : 'Dừng video'}
        accessibilityRole="button"
        hitSlop={14}
        onPress={() => setPausedByUser((value) => !value)}
        style={styles.pauseToggle}
      >
        <AppIcon color={colors.surface} name={pausedByUser ? 'play' : 'pause'} size={30} />
      </Pressable>

      <FlatList
        decelerationRate="fast"
        data={videos.data}
        initialNumToRender={1}
        keyExtractor={(item) => item.videoId}
        maxToRenderPerBatch={2}
        onLayout={handleListLayout}
        onViewableItemsChanged={onViewableItemsChanged}
        pagingEnabled
        removeClippedSubviews
        style={styles.videoList}
        windowSize={3}
        renderItem={({ item, index }) => (
          <View style={[styles.page, pageHeight > 0 ? { height: pageHeight } : null]}>
            <BuyerVideoPlayer
              active={canPlayVideo && !pausedByUser && index === activeIndex}
              muted={!soundEnabled}
              noMediaLabel="Video chưa sẵn sàng"
              source={selectVideoPlaybackSource(item)}
            />

            {/* Shopee Video badge inside video player top-left */}
            <View style={[styles.videoBadgeRow, { top: insets.top + 56 }]}>
              <View style={styles.shopeeVideoBadge}>
                <Text style={styles.shopeeVideoBadgeText}>Shopee Video</Text>
              </View>
              <Text style={styles.videoViewCount}>{item.metrics.viewStartedCount ?? item.metrics.qualifiedViewCount ?? 0} lượt xem</Text>
            </View>

            {/* Bottom Overlay: Shop info + Pinned products + Title */}
            <View style={styles.overlay}>
              {/* Shop profile bar */}
              <View style={styles.creator}>
                <View style={styles.shopAvatar}>
                  <Text style={styles.shopAvatarText}>
                    {item.seller.shopName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.shop}>
                  {item.seller.shopName}
                </Text>
                <Pressable
                  onPress={() => router.push(`/shops/${item.seller.sellerId}`)}
                  style={styles.shopBtn}
                >
                  <Text style={styles.shopBtnText}>Xem Shop</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push(`/chat?sellerId=${item.seller.sellerId}` as any)}
                  style={styles.chatBtn}
                >
                  <AppIcon color={colors.surface} name="chatbubble-ellipses-outline" size={13} />
                  <Text style={styles.chatBtnText}>Chat</Text>
                </Pressable>
              </View>

              {/* Pinned products overlay */}
              <View style={styles.products}>
                {item.products.slice(0, 2).map((product) => (
                  <View key={product.productId} style={styles.product}>
                    {product.image ? (
                      <Image
                        source={{ uri: normalizeRemoteAssetUrl(product.image, process.env.EXPO_PUBLIC_API_BASE_URL) }}
                        style={styles.productImage}
                      />
                    ) : null}
                    <Pressable
                      onPress={() => {
                        void trackVideoEvent(item.videoId, 'product-clicked', {
                          productId: product.productId,
                          clientEventId: videoEventId(item.videoId, 'product-clicked', product.productId)
                        });
                        router.push(`/products/${product.productId}`);
                      }}
                      style={styles.productInfo}
                    >
                      <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
                      <View style={styles.productTags}>
                        <Text style={styles.tag}>Mall</Text>
                        <Text style={styles.tagOutline}>Voucher</Text>
                      </View>
                      <Text style={styles.price}>{Math.round(product.price).toLocaleString('vi-VN')}đ</Text>
                    </Pressable>
                    <Pressable
                      disabled={buyNow.isPending}
                      hitSlop={8}
                      onPress={() => buyNow.mutate({ video: item, productId: product.productId })}
                      style={styles.add}
                    >
                      <Text style={styles.addText}>Mua ngay</Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
            </View>

            {/* Right Action Rail */}
            <View style={styles.rail}>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  const next = new Set(likes);
                  next.has(item.videoId) ? next.delete(item.videoId) : next.add(item.videoId);
                  setLikes(next);
                  void AsyncStorage.setItem(LIKES_KEY, JSON.stringify([...next]));
                }}
                style={styles.railAction}
              >
                <AppIcon
                  color={likes.has(item.videoId) ? colors.brand : colors.surface}
                  name={likes.has(item.videoId) ? 'heart' : 'heart-outline'}
                  size={32}
                />
                <Text style={styles.railLabel}>{likes.has(item.videoId) ? 'Đã thích' : 'Thích'}</Text>
              </Pressable>

              <Pressable hitSlop={10} onPress={openComments} style={styles.railAction}>
                <AppIcon color={colors.surface} name="chatbubble-outline" size={30} />
                <Text style={styles.railLabel}>{item.metrics.commentCount ?? 0}</Text>
              </Pressable>

              <Pressable
                hitSlop={10}
                onPress={() =>
                  void Share.share({
                    message: Linking.createURL('/video', { queryParams: { videoId: item.videoId } })
                  })
                }
                style={styles.railAction}
              >
                <AppIcon color={colors.surface} name="arrow-redo-outline" size={30} />
                <Text style={styles.railLabel}>Chia sẻ</Text>
              </Pressable>
            </View>
          </View>
        )}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Bottom quick comment panel */}
      <View style={[styles.commentPanel, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
        <View style={styles.composer}>
          <TextInput
            ref={commentInputRef}
            maxLength={1000}
            onChangeText={setDraft}
            placeholder="Bạn đang nghĩ gì..."
            placeholderTextColor="#d1d5db"
            style={styles.input}
            value={draft}
          />
          <PrimaryButton
            disabled={!draft.trim()}
            loading={comment.isPending}
            onPress={submitComment}
          >
            Gửi
          </PrimaryButton>
        </View>
      </View>

      {/* Comment Modal Sheet */}
      <Modal animationType="slide" onRequestClose={() => setCommentsOpen(false)} transparent visible={commentsOpen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.commentModalRoot}>
          <Pressable onPress={() => setCommentsOpen(false)} style={styles.commentBackdrop} />
          <View style={[styles.commentSheet, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
            <View style={styles.commentSheetHeader}>
              <View>
                <Text style={styles.commentSheetTitle}>Bình luận</Text>
                <Text style={styles.commentSheetSubtitle}>{comments.data?.length ?? 0} bình luận trong video</Text>
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
              ListEmptyComponent={<Text style={styles.emptyComments}>Chưa có bình luận. Hãy là người đầu tiên trao đổi ở video này.</Text>}
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
              <TextInput
                ref={commentInputRef}
                maxLength={1000}
                onChangeText={setDraft}
                placeholder="Nhập bình luận..."
                placeholderTextColor={colors.muted}
                style={styles.sheetInput}
                value={draft}
              />
              <PrimaryButton disabled={!draft.trim()} loading={comment.isPending} onPress={submitComment}>
                Gửi
              </PrimaryButton>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.media, flex: 1 },
  topbar: {
    alignItems: 'center',
    flexDirection: 'row',
    left: spacing[3],
    position: 'absolute',
    right: spacing[3],
    zIndex: 5
  },
  topbarSpacer: { width: 28 },
  soundToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    position: 'absolute',
    right: spacing[3],
    zIndex: 6
  },
  soundText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  pauseToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderRadius: radius.pill,
    height: 58,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -29,
    marginTop: -29,
    position: 'absolute',
    top: '48%',
    width: 58,
    zIndex: 6
  },
  videoList: { flex: 1 },
  tabs: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[3], justifyContent: 'center' },
  tabTarget: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing[1] },
  tab: { color: '#e5e7eb', fontSize: 16, fontWeight: '600', paddingBottom: spacing[2] },
  activeTab: {
    borderBottomColor: colors.surface,
    borderBottomWidth: 2,
    color: colors.surface,
    fontSize: 17,
    fontWeight: '800',
    paddingBottom: spacing[2]
  },
  page: { backgroundColor: colors.media, flex: 1, position: 'relative' },
  videoBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    left: spacing[3],
    position: 'absolute',
    zIndex: 5
  },
  shopeeVideoBadge: {
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 3
  },
  shopeeVideoBadgeText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  videoViewCount: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  overlay: { bottom: 50, gap: spacing[2], left: spacing[3], position: 'absolute', right: 72 },
  creator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    maxWidth: '100%'
  },
  shopAvatar: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  shopAvatarText: { color: colors.brand, fontSize: 14, fontWeight: '800' },
  shop: { color: colors.surface, flexShrink: 1, fontWeight: '800', maxWidth: 120 },
  shopBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing[2],
    paddingVertical: 4
  },
  shopBtnText: { color: colors.surface, fontSize: 11, fontWeight: '700' },
  chatBtn: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: spacing[2],
    paddingVertical: 4
  },
  chatBtnText: { color: colors.surface, fontSize: 11, fontWeight: '700' },
  title: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  products: { gap: spacing[2] },
  product: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[2],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4
  },
  productImage: { backgroundColor: colors.line, borderRadius: radius.sm, height: 56, width: 56 },
  productInfo: { flex: 1, gap: 2 },
  productName: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  productTags: { flexDirection: 'row', gap: spacing[1] },
  tag: { backgroundColor: colors.brand, color: colors.surface, fontSize: 9, fontWeight: '700', paddingHorizontal: 3 },
  tagOutline: { borderColor: colors.brand, borderWidth: 1, color: colors.brand, fontSize: 9, paddingHorizontal: 3 },
  price: { color: colors.brand, fontSize: 15, fontWeight: '800' },
  add: {
    backgroundColor: colors.brand,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
    paddingVertical: 8
  },
  addText: { color: colors.surface, fontSize: 12, fontWeight: '700' },
  rail: { bottom: 140, gap: spacing[4], position: 'absolute', right: spacing[3] },
  railAction: { alignItems: 'center', gap: spacing[1] },
  railLabel: { color: colors.surface, fontSize: typography.label, fontWeight: '700', textAlign: 'center' },
  commentPanel: {
    alignItems: 'center',
    backgroundColor: colors.media,
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[3]
  },
  composer: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[2] },
  input: {
    backgroundColor: '#262a32',
    borderRadius: radius.pill,
    color: colors.surface,
    flex: 1,
    height: 42,
    paddingHorizontal: spacing[3]
  },
  commentModalRoot: { flex: 1, justifyContent: 'flex-end' },
  commentBackdrop: { backgroundColor: 'rgba(0,0,0,0.45)', flex: 1 },
  commentSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '68%',
    minHeight: 390,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4]
  },
  commentSheetHeader: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing[3]
  },
  commentSheetTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  commentSheetSubtitle: { color: colors.muted, marginTop: 2 },
  commentList: { flexGrow: 1, gap: spacing[3], paddingVertical: spacing[3] },
  emptyComments: { color: colors.muted, lineHeight: 20, paddingVertical: spacing[6], textAlign: 'center' },
  commentBubble: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing[2] },
  commentAvatar: {
    alignItems: 'center',
    backgroundColor: '#fff1ed',
    borderRadius: radius.pill,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  commentBody: { backgroundColor: colors.background, borderRadius: radius.lg, flex: 1, padding: spacing[3] },
  commentAuthor: { color: colors.ink, fontSize: typography.label, fontWeight: '700', marginBottom: 3 },
  commentText: { color: colors.ink, lineHeight: 20 },
  sheetComposer: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing[2],
    paddingTop: spacing[3]
  },
  sheetInput: {
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    color: colors.ink,
    flex: 1,
    height: 44,
    paddingHorizontal: spacing[3]
  }
});
