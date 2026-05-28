import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchVietnamProvinces, fetchVietnamWards, type VietnamLocationOption } from '@/api/locations';
import { fetchProfile, updateProfile } from '@/api/profile';
import { useAuth } from '@/auth/auth-context';
import { PrimaryButton } from '@/components/core/primary-button';
import { ScreenState } from '@/components/core/screen-state';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const MAX_VISIBLE_LOCATION_RESULTS = 6;

function normalizeLocationSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchingLocations(options: VietnamLocationOption[], query: string): VietnamLocationOption[] {
  const searchTerm = normalizeLocationSearch(query);
  if (!searchTerm) {
    return [];
  }

  return options
    .filter((option) => normalizeLocationSearch(option.name).includes(searchTerm))
    .slice(0, MAX_VISIBLE_LOCATION_RESULTS);
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
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
  const [provinceSearch, setProvinceSearch] = useState('');
  const [wardSearch, setWardSearch] = useState('');
  const [showProvinceResults, setShowProvinceResults] = useState(false);
  const [showWardResults, setShowWardResults] = useState(false);

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
      setProvinceSearch(profile.data.addressProvince);
      setWardSearch(profile.data.addressWard);
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

  const filteredProvinces = matchingLocations(provinces, provinceSearch);
  const filteredWards = matchingLocations(wards, wardSearch);

  const selectProvince = (province: VietnamLocationOption) => {
    Keyboard.dismiss();
    setAddressProvince(province.name);
    setAddressProvinceCode(province.code);
    setProvinceSearch(province.name);
    setShowProvinceResults(false);
    setAddressWard('');
    setAddressWardCode('');
    setWardSearch('');
    setShowWardResults(false);
  };

  const selectWard = (ward: VietnamLocationOption) => {
    Keyboard.dismiss();
    setAddressWard(ward.name);
    setAddressWardCode(ward.code);
    setWardSearch(ward.name);
    setShowWardResults(false);
  };

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardArea}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing[4] + Math.max(insets.bottom, spacing[3]) }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
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
          <TextInput
            accessibilityLabel="Tìm tỉnh hoặc thành phố"
            clearButtonMode="while-editing"
            editable={!provincesQuery.isPending}
            onChangeText={(value) => {
              setProvinceSearch(value);
              setShowProvinceResults(true);
              if (value.trim() !== addressProvince) {
                setAddressProvince('');
                setAddressProvinceCode('');
                setAddressWard('');
                setAddressWardCode('');
                setWardSearch('');
                setShowWardResults(false);
              }
            }}
            onFocus={() => setShowProvinceResults(true)}
            onSubmitEditing={() => {
              if (filteredProvinces[0]) {
                selectProvince(filteredProvinces[0]);
              } else {
                Keyboard.dismiss();
              }
            }}
            placeholder={provincesQuery.isPending ? 'Đang tải tỉnh/thành phố...' : 'Nhập tên tỉnh / thành phố'}
            returnKeyType="search"
            selectTextOnFocus
            style={styles.input}
            value={provinceSearch}
          />
          {showProvinceResults && provinceSearch.trim() ? (
            <View style={styles.results}>
              {filteredProvinces.length === 0 ? <Text style={styles.meta}>Không tìm thấy tỉnh/thành phố.</Text> : null}
              {filteredProvinces.map((province) => (
                <Pressable
                  accessibilityRole="button"
                  key={province.code}
                  onPress={() => selectProvince(province)}
                  style={[styles.result, addressProvinceCode === province.code && styles.resultSelected]}
                >
                  <Text style={[styles.resultText, addressProvinceCode === province.code && styles.resultTextSelected]}>{province.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.label}>Phường / xã</Text>
          <TextInput
            accessibilityLabel="Tìm phường hoặc xã"
            clearButtonMode="while-editing"
            editable={Boolean(addressProvinceCode) && !wardsQuery.isPending}
            onChangeText={(value) => {
              setWardSearch(value);
              setShowWardResults(true);
              if (value.trim() !== addressWard) {
                setAddressWard('');
                setAddressWardCode('');
              }
            }}
            onFocus={() => setShowWardResults(true)}
            onSubmitEditing={() => {
              if (filteredWards[0]) {
                selectWard(filteredWards[0]);
              } else {
                Keyboard.dismiss();
              }
            }}
            placeholder={
              !addressProvinceCode ? 'Chọn tỉnh/thành phố trước' : wardsQuery.isPending ? 'Đang tải phường/xã...' : 'Nhập tên phường / xã'
            }
            returnKeyType="search"
            selectTextOnFocus
            style={[styles.input, !addressProvinceCode && styles.inputDisabled]}
            value={wardSearch}
          />
          {showWardResults && wardSearch.trim() && addressProvinceCode ? (
            <View style={styles.results}>
              {filteredWards.length === 0 ? <Text style={styles.meta}>Không tìm thấy phường/xã.</Text> : null}
              {filteredWards.map((ward) => (
                <Pressable
                  accessibilityRole="button"
                  key={ward.code}
                  onPress={() => selectWard(ward)}
                  style={[styles.result, addressWardCode === ward.code && styles.resultSelected]}
                >
                  <Text style={[styles.resultText, addressWardCode === ward.code && styles.resultTextSelected]}>{ward.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text style={styles.label}>Ngày sinh (YYYY-MM-DD)</Text>
          <TextInput onChangeText={setDateOfBirth} placeholder="1998-01-01" style={styles.input} value={dateOfBirth} />
          <PrimaryButton loading={save.isPending} onPress={() => save.mutate()}>Lưu thông tin</PrimaryButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  keyboardArea: { flex: 1 },
  content: { gap: spacing[2], padding: spacing[4] },
  back: { color: colors.brand, fontWeight: '700', marginBottom: spacing[2] },
  title: { color: colors.ink, fontSize: typography.title, fontWeight: '900', marginBottom: spacing[3] },
  label: { color: colors.ink, fontSize: typography.body, fontWeight: '700', marginTop: spacing[2] },
  readonly: { color: colors.muted, paddingVertical: spacing[3] },
  input: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, height: 48, paddingHorizontal: spacing[3] },
  inputDisabled: { backgroundColor: colors.line, color: colors.muted },
  address: { height: 88, paddingVertical: spacing[3] },
  results: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.sm, borderWidth: 1, overflow: 'hidden' },
  result: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  resultSelected: { backgroundColor: colors.brandSoft },
  resultText: { color: colors.ink, fontSize: typography.body },
  resultTextSelected: { color: colors.brand, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: typography.label, padding: spacing[3] }
});
