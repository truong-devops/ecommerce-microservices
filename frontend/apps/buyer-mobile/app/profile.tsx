import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchVietnamProvinces, fetchVietnamWards, type VietnamLocationOption } from '@/api/locations';
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
  const [addressProvince, setAddressProvince] = useState('');
  const [addressProvinceCode, setAddressProvinceCode] = useState('');
  const [addressWard, setAddressWard] = useState('');
  const [addressWardCode, setAddressWardCode] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [provinces, setProvinces] = useState<VietnamLocationOption[]>([]);
  const [wards, setWards] = useState<VietnamLocationOption[]>([]);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setPhone(profile.data.phone);
      setAddress(profile.data.address);
      setAddressProvince(profile.data.addressProvince);
      setAddressProvinceCode(profile.data.addressProvinceCode);
      setAddressWard(profile.data.addressWard);
      setAddressWardCode(profile.data.addressWardCode);
      setDateOfBirth(profile.data.dateOfBirth ?? '');
    }
  }, [profile.data]);

  const provincesQuery = useQuery({ queryKey: ['locations', 'provinces'], queryFn: fetchVietnamProvinces });
  const wardsQuery = useQuery({
    queryKey: ['locations', 'wards', addressProvinceCode],
    queryFn: () => fetchVietnamWards(addressProvinceCode),
    enabled: Boolean(addressProvinceCode)
  });

  useEffect(() => {
    setProvinces(provincesQuery.data ?? []);
  }, [provincesQuery.data]);

  useEffect(() => {
    setWards(wardsQuery.data ?? []);
  }, [wardsQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      updateProfile(session!.accessToken, {
        name,
        phone,
        address,
        addressProvince,
        addressProvinceCode,
        addressWard,
        addressWardCode,
        dateOfBirth: dateOfBirth || null
      }),
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
        <Text style={styles.label}>Tỉnh / thành phố</Text>
        <View style={styles.optionBox}>
          {provincesQuery.isPending ? <Text style={styles.meta}>Đang tải tỉnh/thành phố...</Text> : null}
          {provinces.map((province) => (
            <Pressable
              key={province.code}
              onPress={() => {
                setAddressProvince(province.name);
                setAddressProvinceCode(province.code);
                setAddressWard('');
                setAddressWardCode('');
              }}
              style={[styles.option, addressProvinceCode === province.code && styles.optionSelected]}
            >
              <Text style={[styles.optionText, addressProvinceCode === province.code && styles.optionTextSelected]}>{province.name}</Text>
            </Pressable>
          ))}
          {addressProvince ? <Text style={styles.selectedText}>Đã chọn: {addressProvince}</Text> : null}
        </View>
        <Text style={styles.label}>Phường / xã</Text>
        <View style={styles.optionBox}>
          {!addressProvinceCode ? <Text style={styles.meta}>Chọn tỉnh/thành phố trước</Text> : null}
          {wardsQuery.isPending && addressProvinceCode ? <Text style={styles.meta}>Đang tải phường/xã...</Text> : null}
          {wards.map((ward) => (
            <Pressable
              key={ward.code}
              onPress={() => {
                setAddressWard(ward.name);
                setAddressWardCode(ward.code);
              }}
              style={[styles.option, addressWardCode === ward.code && styles.optionSelected]}
            >
              <Text style={[styles.optionText, addressWardCode === ward.code && styles.optionTextSelected]}>{ward.name}</Text>
            </Pressable>
          ))}
          {addressWard ? <Text style={styles.selectedText}>Đã chọn: {addressWard}</Text> : null}
        </View>
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
  address: { height: 88, paddingVertical: spacing[3] },
  optionBox: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], padding: spacing[3] },
  option: { borderColor: colors.line, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  optionSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  optionText: { color: colors.ink, fontSize: typography.label },
  optionTextSelected: { color: colors.surface, fontWeight: '700' },
  selectedText: { color: colors.brand, fontSize: typography.label, fontWeight: '700', width: '100%' },
  meta: { color: colors.muted, fontSize: typography.label, width: '100%' }
});
