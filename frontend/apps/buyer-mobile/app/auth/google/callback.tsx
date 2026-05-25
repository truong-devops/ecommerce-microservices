import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/theme/tokens';

export default function OAuthColdStartCallbackScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <Text style={styles.title}>Phiên Google Login đã bị ngắt</Text>
      <Text style={styles.copy}>Mở lại đăng nhập Google để hoàn tất xác thực an toàn trên thiết bị này.</Text>
      <Link href="/login" style={styles.link}>
        Quay lại đăng nhập
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1, gap: spacing[4], justifyContent: 'center', padding: spacing[6] },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: '900', textAlign: 'center' },
  copy: { color: colors.muted, fontSize: typography.body, lineHeight: 21, textAlign: 'center' },
  link: { color: colors.brand, fontSize: typography.body, fontWeight: '700', textAlign: 'center' }
});
