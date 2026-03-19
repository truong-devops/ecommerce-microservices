import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { loginUser, registerUser } from '../../services/auth-service';
import { LoginUser, RegisterRole } from '../../types/auth';
import { authStyles } from '../../styles/auth-styles';

type AuthMode = 'login' | 'register';
type NoticeType = 'success' | 'error' | 'idle';

interface NoticeState {
  type: NoticeType;
  message: string;
}

interface AuthPanelProps {
  onLoginSuccess?: (user: LoginUser) => void;
}

const initialNotice: NoticeState = {
  type: 'idle',
  message: ''
};

export function AuthPanel({ onLoginSuccess }: AuthPanelProps): ReactElement {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(initialNotice);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMfaCode, setLoginMfaCode] = useState('');

  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerRole, setRegisterRole] = useState<RegisterRole>('CUSTOMER');

  const ctaLabel = useMemo(() => (mode === 'login' ? 'ĐĂNG NHẬP' : 'TẠO TÀI KHOẢN'), [mode]);

  async function handleLoginSubmit(): Promise<void> {
    setIsLoading(true);
    setNotice(initialNotice);

    try {
      const response = await loginUser({
        email: loginEmail.trim(),
        password: loginPassword,
        mfaCode: loginMfaCode.trim() || undefined
      });

      await AsyncStorage.multiSet([
        ['buyerAccessToken', response.accessToken],
        ['buyerRefreshToken', response.refreshToken],
        ['buyerUser', JSON.stringify(response.user)]
      ]);

      onLoginSuccess?.(response.user);
    } catch (error) {
      setNotice({
        type: 'error',
        message: (error as Error).message
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegisterSubmit(): Promise<void> {
    setIsLoading(true);
    setNotice(initialNotice);

    if (registerPassword !== registerConfirmPassword) {
      setIsLoading(false);
      setNotice({
        type: 'error',
        message: 'Confirm password does not match.'
      });
      return;
    }

    try {
      const response = await registerUser({
        email: registerEmail.trim(),
        password: registerPassword,
        role: registerRole
      });

      const verificationMessage = response.verifyToken
        ? `Dev verification token: ${response.verifyToken}`
        : 'Please verify your email before login.';

      setNotice({
        type: 'success',
        message: `Registered ${response.email} (${response.role}). ${verificationMessage}`
      });

      setMode('login');
      setLoginEmail(registerEmail.trim());
      setLoginPassword('');
      setLoginMfaCode('');
    } catch (error) {
      setNotice({
        type: 'error',
        message: (error as Error).message
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={authStyles.scrollContainer}>
      <View style={authStyles.page}>
        <View style={authStyles.topHeader}>
          <View style={authStyles.topBrand}>
            <View style={authStyles.topBrandIcon}>
              <Text style={authStyles.topBrandIconText}>D&T</Text>
            </View>
            <Text style={authStyles.topBrandName}>D&T</Text>
            <Text style={authStyles.topBrandSub}>{mode === 'register' ? 'Đăng ký' : 'Đăng nhập'}</Text>
          </View>
          <Text style={authStyles.topHelp}>Bạn cần giúp đỡ?</Text>
        </View>

        <View style={authStyles.hero}>
          <View style={isDesktop ? authStyles.heroContentDesktop : authStyles.heroContentMobile}>
            <View style={isDesktop ? authStyles.promoDesktop : authStyles.promoMobile}>
              <View style={authStyles.promoLogoBag}>
                <Text style={authStyles.promoLogoText}>D&T</Text>
              </View>
              <Text style={authStyles.promoBrand}>D&T</Text>
              <Text style={authStyles.promoCaption}>Nền tảng thương mại điện tử yêu thích cho khách hàng Việt Nam.</Text>
            </View>

            <View style={[authStyles.panel, isDesktop ? authStyles.panelDesktop : authStyles.panelMobile]}>
              <Text style={authStyles.badge}>{mode === 'register' ? 'Đăng ký' : 'Đăng nhập'}</Text>

              <View style={authStyles.modeTabs}>
                <Pressable
                  style={[authStyles.modeButton, mode === 'login' ? authStyles.modeButtonActive : undefined]}
                  onPress={() => {
                    setMode('login');
                    setNotice(initialNotice);
                  }}
                >
                  <Text style={[authStyles.modeButtonText, mode === 'login' ? authStyles.modeButtonTextActive : undefined]}>Đăng nhập</Text>
                </Pressable>
                <Pressable
                  style={[authStyles.modeButton, mode === 'register' ? authStyles.modeButtonActive : undefined]}
                  onPress={() => {
                    setMode('register');
                    setNotice(initialNotice);
                  }}
                >
                  <Text style={[authStyles.modeButtonText, mode === 'register' ? authStyles.modeButtonTextActive : undefined]}>
                    Đăng ký
                  </Text>
                </Pressable>
              </View>

              {mode === 'login' ? (
                <View style={authStyles.form}>
                  <Text style={authStyles.label}>Email</Text>
                  <TextInput
                    style={authStyles.input}
                    placeholder="buyer@example.com"
                    placeholderTextColor="#c58b77"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                  />

                  <Text style={authStyles.label}>Password</Text>
                  <TextInput
                    style={authStyles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="#c58b77"
                    secureTextEntry
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                  />

                  <Text style={authStyles.label}>MFA Code (optional)</Text>
                  <TextInput
                    style={authStyles.input}
                    placeholder="Only for admin roles"
                    placeholderTextColor="#c58b77"
                    keyboardType="numeric"
                    maxLength={6}
                    value={loginMfaCode}
                    onChangeText={setLoginMfaCode}
                  />

                  <Pressable style={authStyles.submitButton} onPress={handleLoginSubmit} disabled={isLoading}>
                    {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={authStyles.submitButtonText}>{ctaLabel}</Text>}
                  </Pressable>
                </View>
              ) : (
                <View style={authStyles.form}>
                  <Text style={authStyles.label}>Email</Text>
                  <TextInput
                    style={authStyles.input}
                    placeholder="new-account@example.com"
                    placeholderTextColor="#c58b77"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={registerEmail}
                    onChangeText={setRegisterEmail}
                  />

                  <Text style={authStyles.label}>Password (min 10 chars)</Text>
                  <TextInput
                    style={authStyles.input}
                    placeholder="Strong password"
                    placeholderTextColor="#c58b77"
                    secureTextEntry
                    value={registerPassword}
                    onChangeText={setRegisterPassword}
                  />

                  <Text style={authStyles.label}>Confirm Password</Text>
                  <TextInput
                    style={authStyles.input}
                    placeholder="Re-enter password"
                    placeholderTextColor="#c58b77"
                    secureTextEntry
                    value={registerConfirmPassword}
                    onChangeText={setRegisterConfirmPassword}
                  />

                  <Text style={authStyles.label}>Role</Text>
                  <View style={authStyles.roleRow}>
                    <Pressable
                      style={[authStyles.roleButton, registerRole === 'CUSTOMER' ? authStyles.roleButtonActive : undefined]}
                      onPress={() => setRegisterRole('CUSTOMER')}
                    >
                      <Text style={authStyles.roleButtonText}>Customer</Text>
                    </Pressable>
                    <Pressable
                      style={[authStyles.roleButton, registerRole === 'SELLER' ? authStyles.roleButtonActive : undefined]}
                      onPress={() => setRegisterRole('SELLER')}
                    >
                      <Text style={authStyles.roleButtonText}>Seller</Text>
                    </Pressable>
                  </View>

                  <Pressable style={authStyles.submitButton} onPress={handleRegisterSubmit} disabled={isLoading}>
                    {isLoading ? <ActivityIndicator color="#ffffff" /> : <Text style={authStyles.submitButtonText}>{ctaLabel}</Text>}
                  </Pressable>
                </View>
              )}

              {notice.type !== 'idle' ? (
                <View style={[authStyles.notice, notice.type === 'success' ? authStyles.noticeSuccess : authStyles.noticeError]}>
                  <Text style={authStyles.noticeText}>{notice.message}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
