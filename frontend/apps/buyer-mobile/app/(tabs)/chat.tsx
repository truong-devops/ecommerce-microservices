import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchConversations } from '@/api/chat';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

function shortDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(value));
}

export default function ChatListScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: () => fetchConversations(session!.accessToken),
    enabled: Boolean(session),
    refetchInterval: 30_000,
  });

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenState title="Đăng nhập để chat với shop" />
        <PrimaryButton onPress={() => router.push('/login')}>Đăng nhập</PrimaryButton>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
        <IconButton accessibilityLabel="Tìm tin nhắn" color={colors.brand} name="search-outline" onPress={() => void conversations.refetch()} />
      </View>
      {conversations.isPending ? <ScreenState title="Đang tải hội thoại..." /> : null}
      {conversations.isError ? <ScreenState title="Không tải được hội thoại" detail={conversations.error.message} /> : null}
      {conversations.data?.length === 0 ? <ScreenState title="Chưa có tin nhắn" detail="Mở chat từ sản phẩm hoặc shop để hỏi người bán." /> : null}
      <ScrollView contentContainerStyle={styles.list}>
        {conversations.data?.map((conversation, index) => {
          const unread = conversation.unread?.buyer ?? 0;
          const sellerLabel = conversation.context?.sellerName || (conversation.sellerId ? `Shop ${conversation.sellerId.slice(0, 8)}` : 'Cửa hàng');
          return (
            <Pressable key={conversation.id} onPress={() => router.push(`/chat/${conversation.id}`)} style={styles.row}>
              <View style={[styles.avatar, index === 0 ? styles.official : null]}>
                <AppIcon color={index === 0 ? colors.surface : colors.brand} name={index === 0 ? 'chatbubbles' : 'storefront-outline'} size={29} />
              </View>
              <View style={styles.body}>
                <View style={styles.topline}>
                  <Text numberOfLines={1} style={styles.shop}>{sellerLabel}</Text>
                  <Text style={styles.date}>{shortDate(conversation.lastMessage?.sentAt ?? conversation.updatedAt)}</Text>
                </View>
                <View style={styles.topline}>
                  <Text numberOfLines={1} style={[styles.preview, unread > 0 ? styles.unreadText : null]}>{conversation.lastMessage?.textPreview || 'Bắt đầu hội thoại'}</Text>
                  {unread > 0 ? <Text style={styles.badge}>{unread}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.surface, flex: 1 },
  header: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: spacing[3] },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: '700', marginLeft: spacing[3] },
  list: { paddingHorizontal: spacing[3] },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing[3], minHeight: 83 },
  avatar: { alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radius.pill, height: 56, justifyContent: 'center', width: 56 },
  official: { backgroundColor: colors.brand },
  body: { borderBottomColor: colors.line, borderBottomWidth: 1, flex: 1, gap: spacing[1], justifyContent: 'center', minHeight: 83 },
  topline: { alignItems: 'center', flexDirection: 'row', gap: spacing[2], justifyContent: 'space-between' },
  shop: { color: colors.ink, flex: 1, fontSize: 16, fontWeight: '600' },
  date: { color: colors.muted, fontSize: typography.label },
  badge: { backgroundColor: colors.brand, borderRadius: radius.pill, color: colors.surface, fontSize: 11, fontWeight: '800', minWidth: 21, paddingVertical: 3, textAlign: 'center' },
  preview: { color: colors.muted, flex: 1, fontSize: typography.body },
  unreadText: { color: colors.brand },
});
