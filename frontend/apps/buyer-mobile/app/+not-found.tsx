import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFound() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Không tìm thấy màn hình</Text>
      <Link href="/" style={styles.link}>
        Về trang chủ
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  link: { color: '#f45132', fontSize: 16, fontWeight: '700' },
  screen: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  title: { color: '#202124', fontSize: 20, fontWeight: '800' }
});
