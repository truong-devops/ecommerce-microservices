import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchVietnamProvinces, fetchVietnamWards, type VietnamLocationOption } from '@/api/locations';
import { fetchProfile, updateProfile } from '@/api/profile';
import { useAuth } from '@/auth/auth-context';
import { AppIcon } from '@/components/core/app-icon';
import { IconButton } from '@/components/core/icon-button';
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
  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetchProfile(session!.accessToken),
    enabled: Boolean(session)
  });

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
      Alert.alert('Thành công', 'Đã lưu thông tin hồ sơ của bạn.');
    },
    onError: (error) => Alert.alert('Không lưu được hồ sơ', error.message)
  });

  if (!session) return <ScreenState title="Đăng nhập để sửa hồ sơ" />;
  if (profile.isPending) return <ScreenState title="Đang tải hồ sơ..." />;

  const displayName = name || profile.data?.name || session?.user.email.split('@')[0] || 'U';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Quay lại" color={colors.ink} name="arrow-back-outline" onPress={() => router.back()} />
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle}>Hồ Sơ Của Tôi</Text>
          <Text style={styles.headerSubtitle}>Quản lý thông tin tài khoản</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardArea}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: spacing[4] + Math.max(insets.bottom, spacing[3]) }]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          {/* Avatar Section matching web */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
            <Text style={styles.profileUsername}>{displayName}</Text>
            <Text style={styles.profileEmail}>{profile.data?.email}</Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Tên đăng nhập / Email</Text>
              <View style={styles.readonlyRow}>
                <Text style={styles.readonlyText}>{profile.data?.email}</Text>
                <View style={styles.readonlyBadge}>
                  <Text style={styles.readonlyBadgeText}>Chỉ đọc</Text>
                </View>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Họ và tên</Text>
              <TextInput onChangeText={setName} placeholder="Nhập họ và tên..." placeholderTextColor={colors.muted} style={styles.input} value={name} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Số điện thoại</Text>
              <TextInput keyboardType="phone-pad" onChangeText={setPhone} placeholder="0901234567" placeholderTextColor={colors.muted} style={styles.input} value={phone} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Số nhà, tên đường</Text>
              <TextInput multiline onChangeText={setAddress} placeholder="Nhập địa chỉ nhận hàng chi tiết..." placeholderTextColor={colors.muted} style={[styles.input, styles.address]} value={address} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Tỉnh / Thành phố</Text>
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
                placeholderTextColor={colors.muted}
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
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phường / Xã</Text>
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
                placeholderTextColor={colors.muted}
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
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Ngày sinh (YYYY-MM-DD)</Text>
              <TextInput onChangeText={setDateOfBirth} placeholder="1998-01-01" placeholderTextColor={colors.muted} style={styles.input} value={dateOfBirth} />
            </View>

            <View style={{ marginTop: spacing[3] }}>
              <PrimaryButton loading={save.isPending} onPress={() => save.mutate()}>
                Lưu thay đổi
              </PrimaryButton>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2]
  },
  headerTitleCol: { alignItems: 'center', flex: 1 },
  headerTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  headerSubtitle: { color: colors.muted, fontSize: 11, marginTop: 1 },
  keyboardArea: { flex: 1 },
  content: { gap: spacing[3], padding: spacing[3] },
  avatarSection: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing[1],
    paddingVertical: spacing[5]
  },
  avatarCircle: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    height: 72,
    justifyContent: 'center',
    marginBottom: spacing[1],
    width: 72
  },
  avatarInitial: { color: colors.surface, fontSize: 32, fontWeight: '800' },
  profileUsername: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  profileEmail: { color: colors.muted, fontSize: 13 },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[4]
  },
  fieldGroup: { gap: 6 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  readonlyRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingVertical: 12
  },
  readonlyText: { color: colors.ink, fontSize: 14 },
  readonlyBadge: {
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  readonlyBadgeText: { color: '#475569', fontSize: 11, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    height: 46,
    paddingHorizontal: spacing[3]
  },
  inputDisabled: { backgroundColor: '#f1f5f9', color: colors.muted },
  address: { height: 78, paddingVertical: spacing[2], textAlignVertical: 'top' },
  results: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: 2,
    overflow: 'hidden'
  },
  result: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  resultSelected: { backgroundColor: colors.brandSoft },
  resultText: { color: colors.ink, fontSize: typography.body },
  resultTextSelected: { color: colors.brand, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: typography.label, padding: spacing[3] }
});
