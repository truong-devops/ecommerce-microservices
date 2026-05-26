import * as WebBrowser from 'expo-web-browser';
import { Link, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveRuntimeConfig } from '@/api/config';
import { useAuth } from '@/auth/auth-context';
import { buildMobileGoogleAuthorizeUrl, extractOauthTicket, MOBILE_OAUTH_CALLBACK_URL } from '@/auth/oauth-contract';
import { createPkcePair } from '@/auth/oauth';
import { PrimaryButton } from '@/components/core/primary-button';
import { colors, radius, spacing, typography } from '@/theme/tokens';

WebBrowser.maybeCompleteAuthSession();

interface GoogleAuthRequest {
  url: string;
  verifier: string;
}

export default function LoginScreen() {
  const { completeGoogleLogin, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState<'password' | 'google' | null>(null);
  const [error, setError] = useState('');
  const [googleAuthRequest, setGoogleAuthRequest] = useState<GoogleAuthRequest | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    void WebBrowser.warmUpAsync().catch(() => undefined);
    void buildGoogleAuthRequest().then((request) => {
      if (!isMountedRef.current) {
        return;
      }

      setGoogleAuthRequest(request);
      void prepareAndroidCustomTab(request.url);
    });

    return () => {
      isMountedRef.current = false;
      void WebBrowser.coolDownAsync().catch(() => undefined);
    };
  }, []);

  const submitPassword = async () => {
    setLoading('password');
    setError('');
    try {
      await signIn(email, password);
      router.replace('/account');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(null);
    }
  };

  const submitGoogle = async () => {
    setLoading('google');
    setError('');
    try {
      const request = googleAuthRequest ?? (await buildGoogleAuthRequest());
      setGoogleAuthRequest(null);

      const result = await WebBrowser.openAuthSessionAsync(request.url, MOBILE_OAUTH_CALLBACK_URL);
      if (result.type !== 'success') {
        return;
      }
      await completeGoogleLogin(extractOauthTicket(result.url), request.verifier);
      router.replace('/account');
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      void buildGoogleAuthRequest().then((nextRequest) => {
        if (!isMountedRef.current) {
          return;
        }

        setGoogleAuthRequest(nextRequest);
        void prepareAndroidCustomTab(nextRequest.url);
      });
      if (isMountedRef.current) {
        setLoading(null);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Đăng nhập</Text>
        <Text style={styles.subtitle}>Mua sắm và theo dõi đơn hàng trên DT Commerce</Text>
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
        <PrimaryButton disabled={!email.trim() || !password} loading={loading === 'password'} onPress={() => void submitPassword()}>
          Đăng nhập
        </PrimaryButton>
        <PrimaryButton loading={loading === 'google'} onPress={() => void submitGoogle()} variant="outline">
          Tiếp tục với Google
        </PrimaryButton>
        <Link href="/register" style={styles.link}>
          Chưa có tài khoản? Đăng ký
        </Link>
        <Link href="/" style={styles.secondaryLink}>
          Trở lại trang chủ
        </Link>
      </View>
    </SafeAreaView>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể đăng nhập lúc này.';
}

async function buildGoogleAuthRequest(): Promise<GoogleAuthRequest> {
  const pkce = await createPkcePair();
  return {
    url: buildMobileGoogleAuthorizeUrl(resolveRuntimeConfig().apiBaseUrl, pkce.challenge),
    verifier: pkce.verifier
  };
}

async function prepareAndroidCustomTab(url: string): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await WebBrowser.mayInitWithUrlAsync(url).catch(() => undefined);
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
  link: { color: colors.brand, fontSize: typography.body, fontWeight: '700', marginTop: spacing[3], textAlign: 'center' },
  secondaryLink: { color: colors.muted, fontSize: typography.body, textAlign: 'center' }
});
