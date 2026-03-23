import AsyncStorage from '@react-native-async-storage/async-storage';
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

interface PasswordEyeProps {
  visible: boolean;
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

function PasswordEyeIcon({ visible }: PasswordEyeProps): ReactElement {
  return (
    <View style={authStyles.eyeIcon}>
      <View style={authStyles.eyeOutline}>
        <View style={authStyles.eyePupil} />
      </View>
      {!visible ? <View style={authStyles.eyeSlash} /> : null}
    </View>
  );
}

export function AuthPanel({
  initialMode = 'login',
  onLoginSuccess,
  onBackHome,
  language,
  onLanguageChange
}: AuthPanelProps): ReactElement {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isMobile = width < 768;
  const isNarrow = width < 420;
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
        <View style={[authStyles.topHeader, isMobile ? authStyles.topHeaderMobile : undefined]}>
          <View style={authStyles.topBrand}>
            <View style={[authStyles.topBrandIcon, isMobile ? authStyles.topBrandIconMobile : undefined]}>
              <Text style={[authStyles.topBrandIconText, isMobile ? authStyles.topBrandIconTextMobile : undefined]}>eMall</Text>
            </View>
            <Text style={[authStyles.topBrandName, isMobile ? authStyles.topBrandNameMobile : undefined]}>eMall</Text>
            <Text style={[authStyles.topBrandSub, isMobile ? authStyles.topBrandSubMobile : undefined]}>
              {mode === 'register' ? locale.auth.register : locale.auth.login}
            </Text>
          </View>

          <View style={[authStyles.topActions, isMobile ? authStyles.topActionsMobile : undefined]}>
            <View style={authStyles.languageWrap}>
              <Pressable style={[authStyles.languageButton, isMobile ? authStyles.languageButtonMobile : undefined]} onPress={() => setIsLanguageMenuOpen((prev) => !prev)}>
                <Text style={authStyles.languageButtonText}>{currentLanguageLabel}</Text>
              </Pressable>
              {isLanguageMenuOpen ? (
                <View style={[authStyles.languageMenu, isMobile ? authStyles.languageMenuMobile : undefined]}>
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
              <Text style={[authStyles.topHelp, isMobile ? authStyles.topHelpMobile : undefined]}>{locale.auth.backHome}</Text>
            </Pressable>
          </View>
        </View>

        <View style={[authStyles.hero, isMobile ? authStyles.heroMobile : undefined]}>
          <View style={isDesktop ? authStyles.heroContentDesktop : authStyles.heroContentMobile}>
            <View style={[isDesktop ? authStyles.promoDesktop : authStyles.promoMobile, isMobile ? authStyles.promoMobileCompact : undefined]}>
              <View style={[authStyles.promoLogoBag, isMobile ? authStyles.promoLogoBagMobile : undefined]}>
                <Text style={[authStyles.promoLogoText, isMobile ? authStyles.promoLogoTextMobile : undefined]}>eMall</Text>
              </View>
              <Text style={[authStyles.promoBrand, isMobile ? authStyles.promoBrandMobile : undefined]}>eMall</Text>
              <Text style={[authStyles.promoCaption, isMobile ? authStyles.promoCaptionMobile : undefined]}>{locale.auth.headline}</Text>
              <View style={[authStyles.valueList, isMobile ? authStyles.valueListMobile : undefined]}>
                {locale.auth.valueProps.map((item) => (
                  <View key={item} style={authStyles.valueItem}>
                    <Text style={authStyles.valueIcon}>*</Text>
                    <Text style={[authStyles.valueText, isMobile ? authStyles.valueTextMobile : undefined]}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={[
                authStyles.panel,
                isDesktop ? authStyles.panelDesktop : authStyles.panelMobile,
                isMobile ? authStyles.panelMobileCompact : undefined
              ]}
            >
              <View style={[authStyles.panelAccent, isMobile ? authStyles.panelAccentMobile : undefined]} />
              <Text style={[authStyles.badge, isMobile ? authStyles.badgeMobile : undefined]}>
                {mode === 'login' ? locale.auth.signInTitle : locale.auth.createAccountTitle}
              </Text>
              <Text style={[authStyles.panelSubtitle, isMobile ? authStyles.panelSubtitleMobile : undefined]}>{locale.auth.panelSubtitle}</Text>
              <View style={[authStyles.modeTabs, isMobile ? authStyles.modeTabsMobile : undefined]}>
                <Pressable
                  style={[
                    authStyles.modeButton,
                    isMobile ? authStyles.modeButtonMobile : undefined,
                    mode === 'login' ? authStyles.modeButtonActive : undefined
                  ]}
                  onPress={() => {
                    setMode('login');
                    setNotice(initialNotice);
                  }}
                >
                  <Text
                    style={[
                      authStyles.modeButtonText,
                      isMobile ? authStyles.modeButtonTextMobile : undefined,
                      mode === 'login' ? authStyles.modeButtonTextActive : undefined
                    ]}
                  >
                    {locale.auth.loginTab}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    authStyles.modeButton,
                    isMobile ? authStyles.modeButtonMobile : undefined,
                    mode === 'register' ? authStyles.modeButtonActive : undefined
                  ]}
                  onPress={() => {
                    setMode('register');
                    setNotice(initialNotice);
                  }}
                >
                  <Text
                    style={[
                      authStyles.modeButtonText,
                      isMobile ? authStyles.modeButtonTextMobile : undefined,
                      mode === 'register' ? authStyles.modeButtonTextActive : undefined
                    ]}
                  >
                    {locale.auth.registerTab}
                  </Text>
                </Pressable>
              </View>

              {mode === 'login' ? (
                <Pressable style={[authStyles.qrCard, isMobile ? authStyles.qrCardMobile : undefined]} onPress={handleQrLoginDemo}>
                  <View style={authStyles.qrCardBody}>
                    <Text style={authStyles.qrTitle}>{locale.auth.qrLoginTitle}</Text>
                    <Text style={[authStyles.qrHint, isMobile ? authStyles.qrHintMobile : undefined]}>{locale.auth.qrLoginHint}</Text>
                  </View>
                  <View style={authStyles.qrAction}>
                    <Text style={authStyles.qrGlyph}>#</Text>
                    <Text style={authStyles.qrActionText}>{locale.auth.qrLoginAction}</Text>
                  </View>
                </Pressable>
              ) : null}

              {mode === 'login' ? (
                <View style={[authStyles.form, isMobile ? authStyles.formMobile : undefined]}>
                  <Text style={[authStyles.label, isMobile ? authStyles.labelMobile : undefined]}>{locale.auth.email}</Text>
                  <TextInput
                    style={[authStyles.input, isMobile ? authStyles.inputMobile : undefined]}
                    placeholder="buyer@example.com"
                    placeholderTextColor="#c58b77"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                  />

                  <Text style={[authStyles.label, isMobile ? authStyles.labelMobile : undefined]}>{locale.auth.password}</Text>
                  <View style={authStyles.passwordWrap}>
                    <TextInput
                      style={[authStyles.input, authStyles.passwordInput, isMobile ? authStyles.inputMobile : undefined]}
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
                      <PasswordEyeIcon visible={showLoginPassword} />
                    </Pressable>
                  </View>

                  <Pressable style={[authStyles.submitButton, isMobile ? authStyles.submitButtonMobile : undefined]} onPress={handleLoginSubmit} disabled={isSubmitting}>
                    {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={authStyles.submitButtonText}>{ctaLabel}</Text>}
                  </Pressable>
                  <Text style={[authStyles.forgotText, isMobile ? authStyles.forgotTextMobile : undefined]}>{locale.auth.forgotPassword}</Text>

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

                  <View style={[authStyles.socialDivider, isMobile ? authStyles.socialDividerMobile : undefined]}>
                    <View style={authStyles.socialLine} />
                    <Text style={authStyles.socialDividerText}>{locale.auth.socialOr}</Text>
                    <View style={authStyles.socialLine} />
                  </View>

                  <View style={[authStyles.socialRow, isNarrow ? authStyles.socialRowNarrow : undefined]}>
                    <Pressable
                      style={[authStyles.socialButton, isNarrow ? authStyles.socialButtonNarrow : undefined]}
                      onPress={() => handleSocialLoginDemo(locale.auth.socialFacebook)}
                    >
                      <Text style={[authStyles.socialGlyph, authStyles.socialGlyphFacebook]}>f</Text>
                      <Text style={authStyles.socialButtonText}>{locale.auth.socialFacebook}</Text>
                    </Pressable>
                    <Pressable
                      style={[authStyles.socialButton, isNarrow ? authStyles.socialButtonNarrow : undefined]}
                      onPress={() => handleSocialLoginDemo(locale.auth.socialGoogle)}
                    >
                      <Text style={[authStyles.socialGlyph, authStyles.socialGlyphGoogle]}>G</Text>
                      <Text style={authStyles.socialButtonText}>{locale.auth.socialGoogle}</Text>
                    </Pressable>
                    <Pressable
                      style={[authStyles.socialButton, isNarrow ? authStyles.socialButtonNarrow : undefined]}
                      onPress={() => handleSocialLoginDemo(locale.auth.socialApple)}
                    >
                      <Text style={[authStyles.socialGlyph, authStyles.socialGlyphApple]}>A</Text>
                      <Text style={authStyles.socialButtonText}>{locale.auth.socialApple}</Text>
                    </Pressable>
                  </View>

                  <Text style={authStyles.securityNote}>{locale.auth.securityNote}</Text>
                  <Text style={authStyles.agreementText}>{locale.auth.agreement}</Text>
                </View>
              ) : (
                <View style={[authStyles.form, isMobile ? authStyles.formMobile : undefined]}>
                  <Text style={[authStyles.label, isMobile ? authStyles.labelMobile : undefined]}>{locale.auth.email}</Text>
                  <TextInput
                    style={[authStyles.input, isMobile ? authStyles.inputMobile : undefined]}
                    placeholder="new-account@example.com"
                    placeholderTextColor="#c58b77"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={registerEmail}
                    onChangeText={setRegisterEmail}
                  />

                  <Text style={[authStyles.label, isMobile ? authStyles.labelMobile : undefined]}>{locale.auth.passwordRule}</Text>
                  <View style={authStyles.passwordWrap}>
                    <TextInput
                      style={[authStyles.input, authStyles.passwordInput, isMobile ? authStyles.inputMobile : undefined]}
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
                      <PasswordEyeIcon visible={showRegisterPassword} />
                    </Pressable>
                  </View>

                  <Text style={[authStyles.label, isMobile ? authStyles.labelMobile : undefined]}>{locale.auth.confirmPassword}</Text>
                  <View style={authStyles.passwordWrap}>
                    <TextInput
                      style={[authStyles.input, authStyles.passwordInput, isMobile ? authStyles.inputMobile : undefined]}
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
                      <PasswordEyeIcon visible={showRegisterConfirmPassword} />
                    </Pressable>
                  </View>

                  <Text style={[authStyles.label, isMobile ? authStyles.labelMobile : undefined]}>{locale.auth.role}</Text>
                  <View style={[authStyles.roleRow, isMobile ? authStyles.roleRowMobile : undefined]}>
                    <Pressable
                      style={[
                        authStyles.roleButton,
                        isMobile ? authStyles.roleButtonMobile : undefined,
                        registerRole === 'CUSTOMER' ? authStyles.roleButtonActive : undefined
                      ]}
                      onPress={() => setRegisterRole('CUSTOMER')}
                    >
                      <Text style={authStyles.roleButtonText}>{locale.auth.roleCustomer}</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        authStyles.roleButton,
                        isMobile ? authStyles.roleButtonMobile : undefined,
                        registerRole === 'SELLER' ? authStyles.roleButtonActive : undefined
                      ]}
                      onPress={() => setRegisterRole('SELLER')}
                    >
                      <Text style={authStyles.roleButtonText}>{locale.auth.roleSeller}</Text>
                    </Pressable>
                  </View>

                  <Pressable style={[authStyles.submitButton, isMobile ? authStyles.submitButtonMobile : undefined]} onPress={handleRegisterSubmit} disabled={isSubmitting}>
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
                <View
                  style={[
                    authStyles.notice,
                    isMobile ? authStyles.noticeMobile : undefined,
                    notice.type === 'success' ? authStyles.noticeSuccess : authStyles.noticeError
                  ]}
                >
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
