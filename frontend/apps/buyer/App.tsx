import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthPanel } from './src/components/auth/auth-panel';
import { BuyerHome } from './src/components/home/buyer-home';
import { LoginUser } from './src/types/auth';

const sessionStorageKeys = ['buyerAccessToken', 'buyerRefreshToken', 'buyerUser'] as const;

export default function App(): ReactElement {
  const [isBooting, setIsBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState<LoginUser | null>(null);

  useEffect(() => {
    async function restoreSession(): Promise<void> {
      try {
        const storedUser = await AsyncStorage.getItem('buyerUser');
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
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        {isBooting ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#f85a24" />
          </View>
        ) : currentUser ? (
          <BuyerHome user={currentUser} onLogout={handleLogout} />
        ) : (
          <AuthPanel onLoginSuccess={setCurrentUser} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
