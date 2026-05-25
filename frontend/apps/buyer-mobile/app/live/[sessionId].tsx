import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LiveMessage } from '@frontend/buyer-contracts';
import { resolveRuntimeConfig } from '@/api/config';
import { fetchLiveMessages, fetchLiveSession, trackLiveMetric, trackLiveProductClick } from '@/api/live';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { BuyerLivePlayer } from '@/components/live/buyer-live-player';
import { liveReconnectDelay, liveSocketUrl, mergeLiveMessages, normalizeLiveMessage, resolveLivePlayback } from '@/domain/live';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type SocketStatus = 'connecting' | 'connected' | 'reconnecting';

export default function LiveRoomScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = sessionId ?? '';
  const router = useRouter();
  const client = useQueryClient();
  const { session: authSession } = useAuth();
  const socketRef = useRef<WebSocket | null>(null);
  const measuredSession = useRef('');
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const runtimeConfig = resolveRuntimeConfig();
  const detail = useQuery({
    queryKey: ['live-session', id],
    queryFn: () => fetchLiveSession(id, authSession?.accessToken),
    enabled: Boolean(id),
  });
  const messageKey = ['live-messages', id] as const;
  const messages = useQuery({
    queryKey: messageKey,
    queryFn: () => fetchLiveMessages(id, authSession?.accessToken),
    enabled: Boolean(id),
  });
  const playback = detail.data ? resolveLivePlayback(detail.data.session, runtimeConfig.apiBaseUrl, runtimeConfig.liveHlsBaseUrl) : null;

  useEffect(() => {
    if (!detail.data || !playback || measuredSession.current === id) return;
    measuredSession.current = id;
    const unsupported = playback.capability === 'native-webrtc-required';
    void trackLiveMetric(
      id,
      {
        metricType: unsupported ? 'playback_error' : 'player_ready',
        playbackProtocol: playback.protocol,
        errorCode: unsupported ? 'NATIVE_WEBRTC_REQUIRED' : undefined,
        clientEventId: `buyer-mobile:${id}:${unsupported ? 'native-required' : 'player-ready'}`,
      },
      authSession?.accessToken,
    );
  }, [authSession?.accessToken, detail.data, id, playback]);

  useEffect(() => {
    if (!id) return;
    let stopped = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped) return;
      setStatus(attempts === 0 ? 'connecting' : 'reconnecting');
      const protocols = authSession ? ['live.v1', `access-token.${authSession.accessToken}`] : ['live.v1'];
      const socket = new WebSocket(liveSocketUrl(runtimeConfig.liveWsBaseUrl, id), protocols);
      socketRef.current = socket;
      socket.onopen = () => {
        attempts = 0;
        setStatus('connected');
        socket.send(JSON.stringify({ type: 'live:join' }));
        void messages.refetch();
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as { type?: string; message?: LiveMessage; count?: number };
          if (payload.message) {
            client.setQueryData<LiveMessage[]>(messageKey, (current) => mergeLiveMessages(current ?? [], payload.message!));
          }
          if (payload.type === 'live:viewer:count' && typeof payload.count === 'number') {
            setViewerCount(payload.count);
          }
          if (payload.type === 'live:product:pinned' || payload.type === 'live:product:unpinned' || payload.type === 'live:session:status') {
            void detail.refetch();
          }
        } catch {
          // REST catch-up restores state after malformed or missed events.
        }
      };
      socket.onclose = () => {
        if (!stopped) {
          attempts += 1;
          retryTimer = setTimeout(connect, liveReconnectDelay(attempts));
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [authSession, client, id]);

  const submitMessage = () => {
    if (!authSession) {
      router.push('/login');
      return;
    }
    if (!socketRef.current || status !== 'connected') {
      Alert.alert('Chưa kết nối được live chat');
      return;
    }
    const text = normalizeLiveMessage(draft);
    const clientMessageId = `mobile-${Crypto.randomUUID()}`;
    const optimistic: LiveMessage = {
      messageId: '',
      sessionId: id,
      senderId: authSession.user.id,
      senderRole: authSession.user.role,
      text,
      clientMessageId,
      createdAt: new Date().toISOString(),
    };
    client.setQueryData<LiveMessage[]>(messageKey, (current) => mergeLiveMessages(current ?? [], optimistic));
    socketRef.current.send(JSON.stringify({ type: 'live:message:create', text, clientMessageId }));
    setDraft('');
  };

  if (detail.isPending) return <ScreenState title="Đang tải phòng live..." />;
  if (detail.isError) return <ScreenState title="Không mở được phòng live" detail={detail.error.message} />;
  if (!detail.data || !playback) return <ScreenState title="Phòng live không tồn tại" />;

  const liveState =
    detail.data.session.status === 'PAUSED'
      ? 'paused'
      : detail.data.session.status === 'ENDED'
        ? 'ended'
        : playback.capability === 'playable'
          ? 'playable'
          : 'invalid';

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <IconButton accessibilityLabel="Quay lại" color={colors.surface} name="arrow-back-outline" onPress={() => router.back()} />
          <Text numberOfLines={1} style={styles.title}>{detail.data.session.title}</Text>
          <View style={styles.liveBadge}><AppIcon color={colors.surface} name="radio" size={12} /><Text style={styles.connection}>{status === 'connected' ? 'LIVE' : 'Đang nối...'}</Text></View>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <BuyerLivePlayer
            immersive
            source={playback.source}
            state={liveState}
            pausedLabel="Phiên live đang tạm dừng"
            endedLabel="Phiên live đã kết thúc"
            noPlaybackLabel={playback.capability === 'native-webrtc-required' ? 'Cần native WebRTC player để xem stream này' : 'Stream chưa sẵn sàng'}
          />
          {playback.capability === 'native-webrtc-required' ? (
            <Text style={styles.notice}>Stream đang dùng WHEP/WebRTC. Mobile cần native WebRTC integration trước khi phát production.</Text>
          ) : null}
          <View style={styles.viewer}><AppIcon color={colors.surface} name="eye-outline" size={15} /><Text style={styles.viewerText}>{viewerCount ?? detail.data.session.metricsSnapshot.viewerPeak} đang xem</Text></View>
          <Text style={styles.sectionTitle}>Sản phẩm đang ghim</Text>
          {detail.data.pinnedProducts.length === 0 ? <Text style={styles.empty}>Chưa có sản phẩm được ghim.</Text> : null}
          {detail.data.pinnedProducts.map((product) => (
            <Pressable
              key={product.id}
              onPress={() => {
                void trackLiveProductClick(id, product.productId, authSession?.accessToken);
                router.push(`/products/${product.productId}`);
              }}
              style={styles.product}
            >
              <View style={styles.grow}>
                <Text numberOfLines={1} style={styles.productName}>{product.nameSnapshot}</Text>
                <Text style={styles.price}>{Math.round(product.priceSnapshot).toLocaleString('vi-VN')}đ</Text>
              </View>
              <View style={styles.buyButton}><Text style={styles.buy}>Mua ngay</Text></View>
            </Pressable>
          ))}
          <Text style={styles.sectionTitle}>Live chat</Text>
          {messages.isPending ? <Text style={styles.empty}>Đang tải tin nhắn...</Text> : null}
          {messages.data?.map((message) => (
            <Text key={message.messageId || message.clientMessageId} style={styles.message}>
              <Text style={styles.sender}>{message.senderRole}: </Text>{message.text}
            </Text>
          ))}
        </ScrollView>
        <View style={styles.composer}>
          <TextInput maxLength={1000} onChangeText={setDraft} placeholder="Bạn đang nghĩ gì..." placeholderTextColor="#9ca3af" style={styles.input} value={draft} />
          <PrimaryButton disabled={!draft.trim()} onPress={submitMessage}>Gửi</PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.media, flex: 1 },
  flex: { flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.media, flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  title: { color: colors.surface, flex: 1, fontSize: 16, fontWeight: '800' },
  liveBadge: { alignItems: 'center', backgroundColor: colors.brand, borderRadius: 4, flexDirection: 'row', gap: 3, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  connection: { color: colors.surface, fontSize: typography.label, fontWeight: '900' },
  content: { gap: spacing[3], paddingBottom: spacing[4] },
  notice: { backgroundColor: '#fff7ed', borderRadius: radius.sm, color: '#9a3412', padding: spacing[3] },
  viewer: { alignItems: 'center', backgroundColor: colors.overlay, borderRadius: radius.pill, flexDirection: 'row', gap: spacing[1], marginHorizontal: spacing[3], paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  viewerText: { color: colors.surface, fontSize: typography.label },
  sectionTitle: { color: colors.surface, fontSize: 16, fontWeight: '800', marginHorizontal: spacing[3], marginTop: spacing[2] },
  empty: { color: '#d1d5db', marginHorizontal: spacing[3] },
  product: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, flexDirection: 'row', gap: spacing[2], marginHorizontal: spacing[3], padding: spacing[3] },
  grow: { flex: 1 },
  productName: { color: colors.ink, fontWeight: '700' },
  price: { color: colors.brand, fontWeight: '800' },
  buyButton: { backgroundColor: colors.brand, borderRadius: radius.sm, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  buy: { color: colors.surface, fontWeight: '800' },
  message: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.pill, color: colors.surface, marginHorizontal: spacing[3], padding: spacing[2] },
  sender: { color: '#ffd4ca', fontWeight: '700' },
  composer: { alignItems: 'center', backgroundColor: colors.media, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  input: { backgroundColor: '#252a32', borderRadius: radius.pill, color: colors.surface, flex: 1, height: 44, paddingHorizontal: spacing[3] },
});
