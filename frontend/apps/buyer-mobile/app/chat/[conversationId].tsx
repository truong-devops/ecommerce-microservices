import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BuyerChatMessage } from '@frontend/buyer-contracts';
import { fetchMessages, markConversationRead, sendMessage } from '@/api/chat';
import { resolveRuntimeConfig } from '@/api/config';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { chatWebSocketUrl, mergeChatMessages, normalizeChatText, reconnectDelay } from '@/domain/chat';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type SocketStatus = 'connecting' | 'connected' | 'reconnecting';

export default function ChatConversationScreen() {
  const insets = useSafeAreaInsets();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const { session } = useAuth();
  const id = conversationId ?? '';
  const queryKey = ['messages', id];
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const messages = useQuery({ queryKey, queryFn: () => fetchMessages(session!.accessToken, id), enabled: Boolean(session && id) });
  const send = useMutation({
    mutationFn: ({ text, clientMessageId }: { text: string; clientMessageId: string }) =>
      sendMessage(session!.accessToken, id, text, clientMessageId),
    onSuccess: (saved) => client.setQueryData<BuyerChatMessage[]>(queryKey, (current) => mergeChatMessages(current ?? [], [saved])),
    onError: (error, variables) => {
      client.setQueryData<BuyerChatMessage[]>(queryKey, (current) => (current ?? []).filter((message) => message.clientMessageId !== variables.clientMessageId));
      Alert.alert('Không gửi được tin nhắn', error.message);
    }
  });
  const submitMessage = () => {
    const text = normalizeChatText(draft);
    const clientMessageId = `mobile-${Crypto.randomUUID()}`;
    const optimistic: BuyerChatMessage = {
      id: '',
      conversationId: id,
      seq: (messages.data?.at(-1)?.seq ?? 0) + 1,
      clientMessageId,
      senderId: session!.user.id,
      senderRole: session!.user.role,
      text,
      sentAt: new Date().toISOString()
    };
    client.setQueryData<BuyerChatMessage[]>(queryKey, (current) => mergeChatMessages(current ?? [], [optimistic]));
    setDraft('');
    send.mutate({ text, clientMessageId });
  };

  useEffect(() => {
    if (!session || !id) return;
    let socket: WebSocket | null = null;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const connect = () => {
      if (stopped) return;
      setStatus(attempts === 0 ? 'connecting' : 'reconnecting');
      socket = new WebSocket(
        chatWebSocketUrl(resolveRuntimeConfig().chatWsBaseUrl, id),
        ['chat.v1', `access-token.${session.accessToken}`]
      );
      socket.onopen = () => {
        attempts = 0;
        setStatus('connected');
        void messages.refetch();
        void markConversationRead(session.accessToken, id);
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as { message?: BuyerChatMessage };
          if (payload.message) {
            client.setQueryData<BuyerChatMessage[]>(queryKey, (current) => mergeChatMessages(current ?? [], [payload.message!]));
          }
        } catch {
          // Ignore malformed events and rely on REST catch-up after reconnect.
        }
      };
      socket.onclose = () => {
        if (!stopped) {
          attempts += 1;
          retryTimer = setTimeout(connect, reconnectDelay(attempts));
        }
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [client, id, session]);

  if (!session) return <ScreenState title="Đăng nhập để xem chat" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.header}>
          <IconButton accessibilityLabel="Quay lại" color={colors.brand} name="arrow-back-outline" onPress={() => router.back()} />
          <View style={styles.identity}><View style={styles.avatar}><AppIcon color={colors.brand} name="storefront-outline" size={21} /></View><Text style={styles.title}>Cửa hàng</Text></View>
          <Text style={styles.status}>{status === 'connected' ? '' : 'Đang nối...'}</Text>
        </View>
        {messages.isPending ? <ScreenState title="Đang tải tin nhắn..." /> : null}
        <ScrollView contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled">
          {messages.data?.map((message) => {
            const mine = message.senderId === session.user.id;
            return (
              <View key={message.id || message.clientMessageId} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={mine ? styles.mineText : styles.text}>{message.text}</Text>
              </View>
            );
          })}
        </ScrollView>
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          <AppIcon color={colors.muted} name="add-circle-outline" size={27} />
          <TextInput maxLength={2000} onChangeText={setDraft} placeholder="Nhập tin nhắn" style={styles.input} value={draft} />
          <PrimaryButton disabled={!draft.trim()} loading={send.isPending} onPress={submitMessage}>Gửi</PrimaryButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  header: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', gap: spacing[2], padding: spacing[2] },
  identity: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing[2] },
  avatar: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, height: 34, justifyContent: 'center', width: 34 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  status: { color: colors.muted, fontSize: typography.label, minWidth: 74 },
  messages: { flexGrow: 1, gap: spacing[2], justifyContent: 'flex-end', padding: spacing[4] },
  bubble: { borderRadius: radius.md, maxWidth: '80%', padding: spacing[3] },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  mineText: { color: colors.surface },
  text: { color: colors.ink },
  composer: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: spacing[2], padding: spacing[3] },
  input: { backgroundColor: colors.background, borderRadius: radius.pill, flex: 1, height: 45, paddingHorizontal: spacing[3] }
});
