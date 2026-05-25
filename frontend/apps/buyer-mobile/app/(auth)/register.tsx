import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { registerBuyer } from '@/api/auth';
import { PrimaryButton } from '@/components/core/primary-button';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await registerBuyer(email.trim(), password);
      router.replace('/login');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng ký lúc này.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Tạo tài khoản</Text>
        <Text style={styles.subtitle}>Đăng ký tài khoản khách hàng mới</Text>
      </View>
      <View style={styles.form}>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email"
          style={styles.input}
          value={email}
        />
        <TextInput onChangeText={setPassword} placeholder="Mật khẩu" secureTextEntry style={styles.input} value={password} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton disabled={!email.trim() || password.length < 10} loading={loading} onPress={() => void submit()}>
          Đăng ký
        </PrimaryButton>
        <Link href="/login" style={styles.link}>
          Đã có tài khoản? Đăng nhập
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1, padding: spacing[4] },
  header: { gap: spacing[2], marginBottom: spacing[6], marginTop: spacing[6] },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: typography.body },
  form: { gap: spacing[3] },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 50,
    paddingHorizontal: spacing[4]
  },
  error: { color: '#b91c1c', fontSize: typography.body },
  link: { color: colors.brand, fontSize: typography.body, fontWeight: '700', marginTop: spacing[3], textAlign: 'center' }
});
