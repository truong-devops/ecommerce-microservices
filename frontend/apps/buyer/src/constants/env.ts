import { Platform } from 'react-native';

const platformDefaultApiBaseUrl = Platform.select({
  android: 'http://10.0.2.2:8080',
  default: 'http://localhost:8080'
});

export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? platformDefaultApiBaseUrl ?? 'http://localhost:8080').replace(
  /\/$/,
  ''
);
