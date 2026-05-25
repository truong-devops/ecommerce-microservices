import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchProfile, updateProfile } from '@/api/profile';
import { useAuth } from '@/auth/auth-context';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function ProfileScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const { session } = useAuth();
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => fetchProfile(session!.accessToken), enabled: Boolean(session) });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setPhone(profile.data.phone);
      setAddress(profile.data.address);
      setDateOfBirth(profile.data.dateOfBirth ?? '');
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => updateProfile(session!.accessToken, { name, phone, address, dateOfBirth: dateOfBirth || null }),
    onSuccess: (data) => {
      client.setQueryData(['profile'], data);
      Alert.alert('Đã lưu hồ sơ');
    },
    onError: (error) => Alert.alert('Không lưu được hồ sơ', error.message)
  });

  if (!session) return <ScreenState title="Đăng nhập để sửa hồ sơ" />;
  if (profile.isPending) return <ScreenState title="Đang tải hồ sơ..." />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text onPress={() => router.back()} style={styles.back}>Quay lại</Text>
        <Text style={styles.title}>Hồ sơ cá nhân</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.readonly}>{profile.data?.email}</Text>
        <Text style={styles.label}>Họ tên</Text>
        <TextInput onChangeText={setName} style={styles.input} value={name} />
        <Text style={styles.label}>Số điện thoại quốc tế</Text>
        <TextInput keyboardType="phone-pad" onChangeText={setPhone} placeholder="+84901234567" style={styles.input} value={phone} />
        <Text style={styles.label}>Địa chỉ giao hàng</Text>
        <TextInput multiline onChangeText={setAddress} style={[styles.input, styles.address]} value={address} />
        <Text style={styles.label}>Ngày sinh (YYYY-MM-DD)</Text>
        <TextInput onChangeText={setDateOfBirth} placeholder="1998-01-01" style={styles.input} value={dateOfBirth} />
        <PrimaryButton loading={save.isPending} onPress={() => save.mutate()}>Lưu thông tin</PrimaryButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  content: { gap: spacing[2], padding: spacing[4] },
  back: { color: colors.brand, fontWeight: '700', marginBottom: spacing[2] },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: '900', marginBottom: spacing[3] },
  label: { color: colors.ink, fontSize: typography.body, fontWeight: '700', marginTop: spacing[2] },
  readonly: { color: colors.muted, paddingVertical: spacing[3] },
  input: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, height: 48, paddingHorizontal: spacing[3] },
  address: { height: 88, paddingVertical: spacing[3] }
});
