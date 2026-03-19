import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthPanel } from './src/components/auth/auth-panel';
import { BuyerHome } from './src/components/home/buyer-home';
import { LanguageCode } from './src/constants/i18n';
import { LoginUser } from './src/types/auth';

const sessionStorageKeys = ['buyerAccessToken', 'buyerRefreshToken', 'buyerUser'] as const;
type AuthMode = 'login' | 'register';

export default function App(): ReactElement {
  const [isBooting, setIsBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState<LoginUser | null>(null);
  const [language, setLanguage] = useState<LanguageCode>('vi');
  const [screenMode, setScreenMode] = useState<'home' | 'auth'>('home');
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  useEffect(() => {
    async function restoreSession(): Promise<void> {
      try {
        const storedUser = await AsyncStorage.getItem('buyerUser');
        const storedLanguage = await AsyncStorage.getItem('buyerLanguage');

        if (storedLanguage === 'vi' || storedLanguage === 'en' || storedLanguage === 'ko') {
          setLanguage(storedLanguage);
        }

        if (!storedUser) {
          setCurrentUser(null);
          return;
        }

        const parsedUser = JSON.parse(storedUser) as LoginUser;
        setCurrentUser(parsedUser);
      } catch {
        setCurrentUser(null);
      } finally {
        setIsBooting(false);
      }
    }

    void restoreSession();
  }, []);

  async function handleLogout(): Promise<void> {
    await AsyncStorage.multiRemove([...sessionStorageKeys]);
    setCurrentUser(null);
    setScreenMode('home');
  }

  function openAuth(mode: AuthMode): void {
    setAuthMode(mode);
    setScreenMode('auth');
  }

  function handleLanguageChange(nextLanguage: LanguageCode): void {
    setLanguage(nextLanguage);
    void AsyncStorage.setItem('buyerLanguage', nextLanguage);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        {isBooting ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#f85a24" />
          </View>
        ) : (
          <>
            {screenMode === 'home' ? (
              <BuyerHome
                user={currentUser}
                onLogout={handleLogout}
                onOpenLogin={() => openAuth('login')}
                onOpenRegister={() => openAuth('register')}
                language={language}
                onLanguageChange={handleLanguageChange}
              />
            ) : (
              <AuthPanel
                initialMode={authMode}
                onBackHome={() => setScreenMode('home')}
                language={language}
                onLanguageChange={handleLanguageChange}
                onLoginSuccess={(user) => {
                  setCurrentUser(user);
                  setScreenMode('home');
                }}
              />
            )}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
