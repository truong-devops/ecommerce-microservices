import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { languageOptions, LanguageCode, localePacks } from '../../constants/i18n';
import { loginUser, registerUser, verifyEmail } from '../../services/auth-service';
import { LoginResponse, LoginUser, RegisterRole } from '../../types/auth';
import { authStyles } from '../../styles/auth-styles';

type AuthMode = 'login' | 'register';
type NoticeType = 'success' | 'error' | 'idle';

interface NoticeState {
  type: NoticeType;
  message: string;
}

interface AuthPanelProps {
  initialMode?: AuthMode;
  onLoginSuccess?: (user: LoginUser) => void;
  onBackHome?: () => void;
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
}

const initialNotice: NoticeState = {
  type: 'idle',
  message: ''
};

export function AuthPanel({
  initialMode = 'login',
  onLoginSuccess,
  onBackHome,
  language,
  onLanguageChange
}: AuthPanelProps): ReactElement {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(initialNotice);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [registerRole, setRegisterRole] = useState<RegisterRole>('CUSTOMER');

  const locale = localePacks[language];

  useEffect(() => {
    setMode(initialMode);
    setNotice(initialNotice);
  }, [initialMode]);

  const ctaLabel = useMemo(
    () => (mode === 'login' ? locale.auth.submitLogin : locale.auth.submitRegister),
    [locale.auth.submitLogin, locale.auth.submitRegister, mode]
  );

  const currentLanguageLabel = useMemo(
    () => languageOptions.find((item) => item.code === language)?.label ?? 'Tieng Viet',
    [language]
  );

  async function persistSession(response: LoginResponse): Promise<void> {
    await AsyncStorage.multiSet([
      ['buyerAccessToken', response.accessToken],
      ['buyerRefreshToken', response.refreshToken],
      ['buyerUser', JSON.stringify(response.user)]
    ]);
  }

  async function handleLoginSubmit(): Promise<void> {
    setIsSubmitting(true);
    setNotice(initialNotice);

    try {
      const response = await loginUser({
        email: loginEmail.trim(),
        password: loginPassword
      });

      await persistSession(response);
      onLoginSuccess?.(response.user);
    } catch (error) {
      setNotice({
        type: 'error',
        message: (error as Error).message
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegisterSubmit(): Promise<void> {
    setIsSubmitting(true);
    setNotice(initialNotice);

    if (registerPassword !== registerConfirmPassword) {
      setIsSubmitting(false);
      setNotice({
        type: 'error',
        message: locale.auth.mismatchPassword
      });
      return;
    }

    try {
      const response = await registerUser({
        email: registerEmail.trim(),
        password: registerPassword,
        role: registerRole
      });

      let registerMessage = `${locale.auth.registerSuccessPrefix} ${response.email} (${response.role}).`;

      if (response.emailVerificationRequired) {
        if (response.verifyToken) {
          try {
            await verifyEmail({ token: response.verifyToken });
            registerMessage = `${registerMessage} ${locale.auth.verifySuccess}`;
          } catch (verifyError) {
            registerMessage = `${registerMessage} ${locale.auth.verifyAutoFailedPrefix}: ${(verifyError as Error).message}`;
          }
        } else {
          registerMessage = `${registerMessage} ${locale.auth.verifyEmailNotice}`;
        }
      }

      setNotice({
        type: 'success',
        message: registerMessage
      });

      setMode('login');
      setLoginEmail(registerEmail.trim());
      setLoginPassword('');
    } catch (error) {
      setNotice({
        type: 'error',
        message: (error as Error).message
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleQrLoginDemo(): void {
    setNotice({
      type: 'success',
      message: locale.auth.qrDemoNotice
    });
  }

  function handleSocialLoginDemo(provider: string): void {
    setNotice({
      type: 'success',
      message: `${locale.auth.socialDemoPrefix} ${provider} (demo UI).`
    });
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
            <Text style={authStyles.topBrandSub}>{mode === 'register' ? locale.auth.register : locale.auth.login}</Text>
          </View>

          <View style={authStyles.topActions}>
            <View style={authStyles.languageWrap}>
              <Pressable style={authStyles.languageButton} onPress={() => setIsLanguageMenuOpen((prev) => !prev)}>
                <Text style={authStyles.languageButtonText}>{currentLanguageLabel}</Text>
              </Pressable>
              {isLanguageMenuOpen ? (
                <View style={authStyles.languageMenu}>
                  {languageOptions.map((option) => (
                    <Pressable
                      key={option.code}
                      style={[authStyles.languageMenuItem, option.code === language ? authStyles.languageMenuItemActive : undefined]}
                      onPress={() => {
                        onLanguageChange(option.code);
                        setIsLanguageMenuOpen(false);
                      }}
                    >
                      <Text style={authStyles.languageMenuText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            <Pressable onPress={onBackHome}>
              <Text style={authStyles.topHelp}>{locale.auth.backHome}</Text>
            </Pressable>
          </View>
        </View>

        <View style={authStyles.hero}>
          <View style={isDesktop ? authStyles.heroContentDesktop : authStyles.heroContentMobile}>
            <View style={isDesktop ? authStyles.promoDesktop : authStyles.promoMobile}>
              <View style={authStyles.promoLogoBag}>
                <Text style={authStyles.promoLogoText}>D&T</Text>
              </View>
              <Text style={authStyles.promoBrand}>D&T</Text>
              <Text style={authStyles.promoCaption}>{locale.auth.headline}</Text>
              <View style={authStyles.valueList}>
                {locale.auth.valueProps.map((item) => (
                  <View key={item} style={authStyles.valueItem}>
                    <Text style={authStyles.valueIcon}>*</Text>
                    <Text style={authStyles.valueText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={[authStyles.panel, isDesktop ? authStyles.panelDesktop : authStyles.panelMobile]}>
              <View style={authStyles.panelAccent} />
              <Text style={authStyles.badge}>{mode === 'login' ? locale.auth.signInTitle : locale.auth.createAccountTitle}</Text>
              <Text style={authStyles.panelSubtitle}>{locale.auth.panelSubtitle}</Text>
              <View style={authStyles.modeTabs}>
                <Pressable
                  style={[authStyles.modeButton, mode === 'login' ? authStyles.modeButtonActive : undefined]}
                  onPress={() => {
                    setMode('login');
                    setNotice(initialNotice);
                  }}
                >
                  <Text style={[authStyles.modeButtonText, mode === 'login' ? authStyles.modeButtonTextActive : undefined]}>
                    {locale.auth.loginTab}
                  </Text>
                </Pressable>
                <Pressable
                  style={[authStyles.modeButton, mode === 'register' ? authStyles.modeButtonActive : undefined]}
                  onPress={() => {
                    setMode('register');
                    setNotice(initialNotice);
                  }}
                >
                  <Text style={[authStyles.modeButtonText, mode === 'register' ? authStyles.modeButtonTextActive : undefined]}>
                    {locale.auth.registerTab}
                  </Text>
                </Pressable>
              </View>

              {mode === 'login' ? (
                <Pressable style={authStyles.qrCard} onPress={handleQrLoginDemo}>
                  <View style={authStyles.qrCardBody}>
                    <Text style={authStyles.qrTitle}>{locale.auth.qrLoginTitle}</Text>
                    <Text style={authStyles.qrHint}>{locale.auth.qrLoginHint}</Text>
                  </View>
                  <View style={authStyles.qrAction}>
                    <Ionicons name="qr-code-outline" size={18} color="#f85a24" />
                    <Text style={authStyles.qrActionText}>{locale.auth.qrLoginAction}</Text>
                  </View>
                </Pressable>
              ) : null}

              {mode === 'login' ? (
                <View style={authStyles.form}>
                  <Text style={authStyles.label}>{locale.auth.email}</Text>
                  <TextInput
                    style={authStyles.input}
                    placeholder="buyer@example.com"
                    placeholderTextColor="#c58b77"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                  />

                  <Text style={authStyles.label}>{locale.auth.password}</Text>
                  <View style={authStyles.passwordWrap}>
                    <TextInput
                      style={[authStyles.input, authStyles.passwordInput]}
                      placeholder={locale.auth.passwordPlaceholder}
                      placeholderTextColor="#c58b77"
                      secureTextEntry={!showLoginPassword}
                      value={loginPassword}
                      onChangeText={setLoginPassword}
                    />
                    <Pressable
                      style={authStyles.passwordToggle}
                      onPress={() => setShowLoginPassword((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel={showLoginPassword ? locale.auth.hidePassword : locale.auth.showPassword}
                    >
                      <Ionicons name={showLoginPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#e45522" />
                    </Pressable>
                  </View>

                  <Pressable style={authStyles.submitButton} onPress={handleLoginSubmit} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={authStyles.submitButtonText}>{ctaLabel}</Text>}
                  </Pressable>
                  <Text style={authStyles.forgotText}>{locale.auth.forgotPassword}</Text>

                  <View style={authStyles.switchRow}>
                    <Text style={authStyles.switchText}>{locale.auth.noAccountPrefix}</Text>
                    <Pressable
                      onPress={() => {
                        setMode('register');
                        setNotice(initialNotice);
                      }}
                    >
                      <Text style={authStyles.switchAction}>{locale.auth.noAccountAction}</Text>
                    </Pressable>
                  </View>

                  <View style={authStyles.socialDivider}>
                    <View style={authStyles.socialLine} />
                    <Text style={authStyles.socialDividerText}>{locale.auth.socialOr}</Text>
                    <View style={authStyles.socialLine} />
                  </View>

                  <View style={authStyles.socialRow}>
                    <Pressable style={authStyles.socialButton} onPress={() => handleSocialLoginDemo(locale.auth.socialFacebook)}>
                      <Ionicons name="logo-facebook" size={16} color="#1877f2" />
                      <Text style={authStyles.socialButtonText}>{locale.auth.socialFacebook}</Text>
                    </Pressable>
                    <Pressable style={authStyles.socialButton} onPress={() => handleSocialLoginDemo(locale.auth.socialGoogle)}>
                      <Ionicons name="logo-google" size={16} color="#ea4335" />
                      <Text style={authStyles.socialButtonText}>{locale.auth.socialGoogle}</Text>
                    </Pressable>
                    <Pressable style={authStyles.socialButton} onPress={() => handleSocialLoginDemo(locale.auth.socialApple)}>
                      <Ionicons name="logo-apple" size={16} color="#111111" />
                      <Text style={authStyles.socialButtonText}>{locale.auth.socialApple}</Text>
                    </Pressable>
                  </View>

                  <Text style={authStyles.securityNote}>{locale.auth.securityNote}</Text>
                  <Text style={authStyles.agreementText}>{locale.auth.agreement}</Text>
                </View>
              ) : (
                <View style={authStyles.form}>
                  <Text style={authStyles.label}>{locale.auth.email}</Text>
                  <TextInput
                    style={authStyles.input}
                    placeholder="new-account@example.com"
                    placeholderTextColor="#c58b77"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={registerEmail}
                    onChangeText={setRegisterEmail}
                  />

                  <Text style={authStyles.label}>{locale.auth.passwordRule}</Text>
                  <View style={authStyles.passwordWrap}>
                    <TextInput
                      style={[authStyles.input, authStyles.passwordInput]}
                      placeholder={locale.auth.passwordPlaceholder}
                      placeholderTextColor="#c58b77"
                      secureTextEntry={!showRegisterPassword}
                      value={registerPassword}
                      onChangeText={setRegisterPassword}
                    />
                    <Pressable
                      style={authStyles.passwordToggle}
                      onPress={() => setShowRegisterPassword((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel={showRegisterPassword ? locale.auth.hidePassword : locale.auth.showPassword}
                    >
                      <Ionicons name={showRegisterPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#e45522" />
                    </Pressable>
                  </View>

                  <Text style={authStyles.label}>{locale.auth.confirmPassword}</Text>
                  <View style={authStyles.passwordWrap}>
                    <TextInput
                      style={[authStyles.input, authStyles.passwordInput]}
                      placeholder={locale.auth.confirmPasswordPlaceholder}
                      placeholderTextColor="#c58b77"
                      secureTextEntry={!showRegisterConfirmPassword}
                      value={registerConfirmPassword}
                      onChangeText={setRegisterConfirmPassword}
                    />
                    <Pressable
                      style={authStyles.passwordToggle}
                      onPress={() => setShowRegisterConfirmPassword((prev) => !prev)}
                      accessibilityRole="button"
                      accessibilityLabel={showRegisterConfirmPassword ? locale.auth.hidePassword : locale.auth.showPassword}
                    >
                      <Ionicons name={showRegisterConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#e45522" />
                    </Pressable>
                  </View>

                  <Text style={authStyles.label}>{locale.auth.role}</Text>
                  <View style={authStyles.roleRow}>
                    <Pressable
                      style={[authStyles.roleButton, registerRole === 'CUSTOMER' ? authStyles.roleButtonActive : undefined]}
                      onPress={() => setRegisterRole('CUSTOMER')}
                    >
                      <Text style={authStyles.roleButtonText}>{locale.auth.roleCustomer}</Text>
                    </Pressable>
                    <Pressable
                      style={[authStyles.roleButton, registerRole === 'SELLER' ? authStyles.roleButtonActive : undefined]}
                      onPress={() => setRegisterRole('SELLER')}
                    >
                      <Text style={authStyles.roleButtonText}>{locale.auth.roleSeller}</Text>
                    </Pressable>
                  </View>

                  <Pressable style={authStyles.submitButton} onPress={handleRegisterSubmit} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={authStyles.submitButtonText}>{ctaLabel}</Text>}
                  </Pressable>

                  <View style={authStyles.switchRow}>
                    <Text style={authStyles.switchText}>{locale.auth.hasAccountPrefix}</Text>
                    <Pressable
                      onPress={() => {
                        setMode('login');
                        setNotice(initialNotice);
                      }}
                    >
                      <Text style={authStyles.switchAction}>{locale.auth.hasAccountAction}</Text>
                    </Pressable>
                  </View>
                  <Text style={authStyles.securityNote}>{locale.auth.securityNote}</Text>
                  <Text style={authStyles.agreementText}>{locale.auth.agreement}</Text>
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
