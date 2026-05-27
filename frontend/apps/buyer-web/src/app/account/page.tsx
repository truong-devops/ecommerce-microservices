'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { BuyerGender } from '@/lib/api/types';
import { getVietnamProvinces, getVietnamWards, type VietnamLocationOption } from '@/lib/api/locations';
import { Header } from '@/components/layout/Header';
import { useAuth, useLanguage } from '@/providers/AppProvider';

const trendingKeywords = [
  'Sim Vina U1500',
  'Apple iPhone 15',
  'Giấy In Nhiệt A7',
  'Balo Vải Lãng Chính Hãng',
  'iPhone 15 Pro 128gb',
  'Sim U1500 Vinaphone'
];

const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FULL_NAME_LENGTH = 200;
const MAX_ADDRESS_LENGTH = 255;
const MAX_AVATAR_URL_LENGTH = 500;
const VALID_GENDERS: BuyerGender[] = ['male', 'female', 'other', 'unspecified'];

interface ProfileFormValues {
  name: string;
  phone: string;
  address: string;
  addressProvince: string;
  addressProvinceCode: string;
  addressWard: string;
  addressWardCode: string;
  gender: BuyerGender;
  dateOfBirth: string;
  avatarUrl: string;
}

type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

type NoticeState = {
  type: 'success' | 'error';
  message: string;
} | null;

interface ValidationMessages {
  nameRequired: string;
  nameTooLong: string;
  phoneRequired: string;
  phoneInvalid: string;
  addressRequired: string;
  addressTooLong: string;
  addressProvinceRequired: string;
  addressWardRequired: string;
  genderInvalid: string;
  dateOfBirthInvalid: string;
  dateOfBirthFuture: string;
  avatarUrlInvalid: string;
  avatarUrlTooLong: string;
}

function maskEmail(email: string): string {
  const [localPart = '', domain = ''] = email.split('@');
  if (!localPart || !domain) {
    return email;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] ?? ''}***@${domain}`;
  }

  return `${localPart.slice(0, 2)}${'*'.repeat(Math.max(4, localPart.length - 2))}@${domain}`;
}

function formatMemberDate(value: string, locale: 'vi' | 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--/--/----';
  }

  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function normalizeGender(value: string | null | undefined): BuyerGender {
  if (typeof value !== 'string') {
    return 'unspecified';
  }

  const normalized = value.trim().toLowerCase();
  return (VALID_GENDERS.find((gender) => gender === normalized) ?? 'unspecified') as BuyerGender;
}

function normalizeDateOfBirth(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeFormValues(values: ProfileFormValues): ProfileFormValues {
  return {
    name: collapseRepeatedName(values.name),
    phone: values.phone.trim(),
    address: values.address.trim(),
    addressProvince: values.addressProvince.trim(),
    addressProvinceCode: values.addressProvinceCode.trim(),
    addressWard: values.addressWard.trim(),
    addressWardCode: values.addressWardCode.trim(),
    gender: normalizeGender(values.gender),
    dateOfBirth: normalizeDateOfBirth(values.dateOfBirth),
    avatarUrl: values.avatarUrl.trim()
  };
}

function collapseRepeatedName(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter((item) => item.length > 0);

  if (parts.length < 2 || parts.length % 2 !== 0) {
    return parts.join(' ');
  }

  const middle = parts.length / 2;
  const left = parts.slice(0, middle).join(' ');
  const right = parts.slice(middle).join(' ');

  return left.toLowerCase() === right.toLowerCase() ? left : parts.join(' ');
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function isFutureDate(value: string): boolean {
  const selectedDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(selectedDate.getTime())) {
    return false;
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return selectedDate.getTime() > todayUtc;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateProfileForm(values: ProfileFormValues, messages: ValidationMessages): ProfileFormErrors {
  const errors: ProfileFormErrors = {};

  if (!values.name) {
    errors.name = messages.nameRequired;
  } else if (values.name.length > MAX_FULL_NAME_LENGTH) {
    errors.name = messages.nameTooLong;
  }

  if (!values.phone) {
    errors.phone = messages.phoneRequired;
  } else if (!PHONE_PATTERN.test(values.phone)) {
    errors.phone = messages.phoneInvalid;
  }

  const hasDeliveryAddress = Boolean(values.address || values.addressProvince || values.addressWard);
  if (hasDeliveryAddress && !values.address) {
    errors.address = messages.addressRequired;
  } else if (values.address.length > MAX_ADDRESS_LENGTH) {
    errors.address = messages.addressTooLong;
  }
  if (hasDeliveryAddress && (!values.addressProvince || !values.addressProvinceCode)) {
    errors.addressProvince = messages.addressProvinceRequired;
  }
  if (hasDeliveryAddress && (!values.addressWard || !values.addressWardCode)) {
    errors.addressWard = messages.addressWardRequired;
  }

  if (!VALID_GENDERS.includes(values.gender)) {
    errors.gender = messages.genderInvalid;
  }

  if (values.dateOfBirth) {
    if (!isValidDateOnly(values.dateOfBirth)) {
      errors.dateOfBirth = messages.dateOfBirthInvalid;
    } else if (isFutureDate(values.dateOfBirth)) {
      errors.dateOfBirth = messages.dateOfBirthFuture;
    }
  }

  if (values.avatarUrl) {
    if (values.avatarUrl.length > MAX_AVATAR_URL_LENGTH) {
      errors.avatarUrl = messages.avatarUrlTooLong;
    } else if (!isValidHttpUrl(values.avatarUrl)) {
      errors.avatarUrl = messages.avatarUrlInvalid;
    }
  }

  return errors;
}

function hasAnyValidationError(errors: ProfileFormErrors): boolean {
  return Object.values(errors).some((value) => typeof value === 'string' && value.length > 0);
}

export default function AccountPage() {
  const router = useRouter();
  const { text, locale } = useLanguage();
  const { ready, user, updateProfile } = useAuth();

  const [formValues, setFormValues] = useState<ProfileFormValues>({
    name: '',
    phone: '',
    address: '',
    addressProvince: '',
    addressProvinceCode: '',
    addressWard: '',
    addressWardCode: '',
    gender: 'unspecified',
    dateOfBirth: '',
    avatarUrl: ''
  });
  const [initialValues, setInitialValues] = useState<ProfileFormValues>({
    name: '',
    phone: '',
    address: '',
    addressProvince: '',
    addressProvinceCode: '',
    addressWard: '',
    addressWardCode: '',
    gender: 'unspecified',
    dateOfBirth: '',
    avatarUrl: ''
  });
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [notice, setNotice] = useState<NoticeState>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [provinces, setProvinces] = useState<VietnamLocationOption[]>([]);
  const [wards, setWards] = useState<VietnamLocationOption[]>([]);
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(false);
  const [isLoadingWards, setIsLoadingWards] = useState(false);
  const [locationError, setLocationError] = useState('');
  const initializedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!user) {
      initializedUserIdRef.current = null;
      router.replace('/login');
      return;
    }

    if (initializedUserIdRef.current === user.id) {
      return;
    }

    const nextValues: ProfileFormValues = {
      name: collapseRepeatedName(user.name),
      phone: user.phone,
      address: user.address,
      addressProvince: user.addressProvince,
      addressProvinceCode: user.addressProvinceCode,
      addressWard: user.addressWard,
      addressWardCode: user.addressWardCode,
      gender: normalizeGender(user.gender),
      dateOfBirth: normalizeDateOfBirth(user.dateOfBirth),
      avatarUrl: user.avatarUrl ?? ''
    };

    setFormValues(nextValues);
    setInitialValues(nextValues);
    setErrors({});
    setNotice(null);
    initializedUserIdRef.current = user.id;
  }, [ready, router, user]);

  useEffect(() => {
    if (!ready || !user) {
      return;
    }

    let active = true;
    setIsLoadingProvinces(true);
    setLocationError('');
    void getVietnamProvinces()
      .then((data) => {
        if (active) {
          setProvinces(data);
        }
      })
      .catch(() => {
        if (active) {
          setLocationError(locale === 'vi' ? 'Không thể tải danh sách tỉnh/thành phố.' : 'Cannot load provinces.');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingProvinces(false);
        }
      });

    return () => {
      active = false;
    };
  }, [locale, ready, user]);

  useEffect(() => {
    const provinceCode = formValues.addressProvinceCode;
    if (!provinceCode) {
      setWards([]);
      setIsLoadingWards(false);
      return;
    }

    let active = true;
    setIsLoadingWards(true);
    setLocationError('');
    void getVietnamWards(provinceCode)
      .then((data) => {
        if (active) {
          setWards(data);
        }
      })
      .catch(() => {
        if (active) {
          setWards([]);
          setLocationError(locale === 'vi' ? 'Không thể tải danh sách phường/xã.' : 'Cannot load wards.');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingWards(false);
        }
      });

    return () => {
      active = false;
    };
  }, [formValues.addressProvinceCode, locale]);

  if (!ready) {
    return <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.account.loading}</div>;
  }

  if (!user) {
    return <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.account.protectedHint}</div>;
  }

  const accountLabels =
    locale === 'vi'
      ? {
          profileTitle: 'Hồ Sơ Của Tôi',
          profileSubtitle: 'Quản lý thông tin hồ sơ để bảo mật tài khoản',
          editProfile: 'Sửa Hồ Sơ',
          notification: 'Thông Báo',
          account: 'Tài Khoản Của Tôi',
          profile: 'Hồ Sơ',
          bank: 'Ngân hàng',
          addressBook: 'Địa chỉ',
          changePassword: 'Đổi mật khẩu',
          notificationSettings: 'Cài đặt thông báo',
          privacySettings: 'Thiết lập riêng tư',
          order: 'Đơn Mua',
          voucher: 'Kho Voucher',
          xu: 'eMall Xu',
          username: 'Tên đăng nhập',
          fullName: 'Tên',
          email: 'Email',
          emailReadonly: 'Chỉ đọc',
          phone: 'Số điện thoại',
          address: 'Số nhà, tên đường',
          addressProvince: 'Tỉnh / thành phố',
          addressWard: 'Phường / xã',
          selectProvince: 'Chọn tỉnh / thành phố',
          selectWard: 'Chọn phường / xã',
          loadingLocations: 'Đang tải...',
          gender: 'Giới tính',
          genderMale: 'Nam',
          genderFemale: 'Nữ',
          genderOther: 'Khác',
          genderUnspecified: 'Không muốn trả lời',
          dateOfBirth: 'Ngày sinh',
          avatarUrl: 'Liên kết ảnh đại diện',
          avatarHint: 'Dán liên kết ảnh http(s). Bỏ trống nếu muốn dùng chữ cái đại diện.',
          avatarClear: 'Xóa ảnh',
          memberSince: 'Ngày tham gia',
          save: 'Lưu',
          saving: 'Đang lưu...',
          noChanges: 'Không có thay đổi để lưu.',
          validationNameRequired: 'Vui lòng nhập tên.',
          validationNameTooLong: 'Tên không được vượt quá 200 ký tự.',
          validationPhoneRequired: 'Vui lòng nhập số điện thoại.',
          validationPhoneInvalid: 'Số điện thoại không đúng định dạng quốc tế.',
          validationAddressRequired: 'Vui lòng nhập số nhà, tên đường.',
          validationAddressTooLong: 'Địa chỉ không được vượt quá 255 ký tự.',
          validationAddressProvinceRequired: 'Vui lòng chọn tỉnh/thành phố.',
          validationAddressWardRequired: 'Vui lòng chọn phường/xã.',
          validationGenderInvalid: 'Giới tính không hợp lệ.',
          validationDateOfBirthInvalid: 'Ngày sinh phải theo định dạng YYYY-MM-DD.',
          validationDateOfBirthFuture: 'Ngày sinh không được ở tương lai.',
          validationAvatarUrlInvalid: 'URL ảnh đại diện phải là http(s) hợp lệ.',
          validationAvatarUrlTooLong: 'URL ảnh đại diện không được vượt quá 500 ký tự.',
          fixValidation: 'Vui lòng sửa các trường đang báo lỗi trước khi lưu.'
        }
      : {
          profileTitle: 'My Profile',
          profileSubtitle: 'Manage your profile information for account security',
          editProfile: 'Edit Profile',
          notification: 'Notifications',
          account: 'My Account',
          profile: 'Profile',
          bank: 'Bank accounts',
          addressBook: 'Addresses',
          changePassword: 'Change password',
          notificationSettings: 'Notification settings',
          privacySettings: 'Privacy settings',
          order: 'My Orders',
          voucher: 'Vouchers',
          xu: 'Rewards',
          username: 'Username',
          fullName: 'Name',
          email: 'Email',
          emailReadonly: 'Read only',
          phone: 'Phone',
          address: 'Street address',
          addressProvince: 'Province / city',
          addressWard: 'Ward / commune',
          selectProvince: 'Select province / city',
          selectWard: 'Select ward / commune',
          loadingLocations: 'Loading...',
          gender: 'Gender',
          genderMale: 'Male',
          genderFemale: 'Female',
          genderOther: 'Other',
          genderUnspecified: 'Prefer not to say',
          dateOfBirth: 'Date of birth',
          avatarUrl: 'Avatar link',
          avatarHint: 'Paste an http(s) image link. Leave empty to use your initial.',
          avatarClear: 'Remove photo',
          memberSince: 'Member since',
          save: 'Save',
          saving: 'Saving...',
          noChanges: 'No changes to save.',
          validationNameRequired: 'Please enter your name.',
          validationNameTooLong: 'Name must be at most 200 characters.',
          validationPhoneRequired: 'Please enter your phone number.',
          validationPhoneInvalid: 'Phone number must be in international format.',
          validationAddressRequired: 'Please enter your street address.',
          validationAddressTooLong: 'Address must be at most 255 characters.',
          validationAddressProvinceRequired: 'Please select a province or city.',
          validationAddressWardRequired: 'Please select a ward or commune.',
          validationGenderInvalid: 'Gender is invalid.',
          validationDateOfBirthInvalid: 'Date of birth must be in YYYY-MM-DD format.',
          validationDateOfBirthFuture: 'Date of birth cannot be in the future.',
          validationAvatarUrlInvalid: 'Avatar URL must be a valid http(s) URL.',
          validationAvatarUrlTooLong: 'Avatar URL must be at most 500 characters.',
          fixValidation: 'Please fix invalid fields before saving.'
        };

  const normalizedCurrent = normalizeFormValues(formValues);
  const normalizedInitial = normalizeFormValues(initialValues);
  const hasChanges =
    normalizedCurrent.name !== normalizedInitial.name ||
    normalizedCurrent.phone !== normalizedInitial.phone ||
    normalizedCurrent.address !== normalizedInitial.address ||
    normalizedCurrent.addressProvince !== normalizedInitial.addressProvince ||
    normalizedCurrent.addressProvinceCode !== normalizedInitial.addressProvinceCode ||
    normalizedCurrent.addressWard !== normalizedInitial.addressWard ||
    normalizedCurrent.addressWardCode !== normalizedInitial.addressWardCode ||
    normalizedCurrent.gender !== normalizedInitial.gender ||
    normalizedCurrent.dateOfBirth !== normalizedInitial.dateOfBirth ||
    normalizedCurrent.avatarUrl !== normalizedInitial.avatarUrl;

  const isSaveDisabled = isSaving || !hasChanges;

  const avatarPreviewUrl = normalizedCurrent.avatarUrl && isValidHttpUrl(normalizedCurrent.avatarUrl) ? normalizedCurrent.avatarUrl : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextValues = normalizeFormValues(formValues);
    const nextErrors = validateProfileForm(nextValues, {
      nameRequired: accountLabels.validationNameRequired,
      nameTooLong: accountLabels.validationNameTooLong,
      phoneRequired: accountLabels.validationPhoneRequired,
      phoneInvalid: accountLabels.validationPhoneInvalid,
      addressRequired: accountLabels.validationAddressRequired,
      addressTooLong: accountLabels.validationAddressTooLong,
      addressProvinceRequired: accountLabels.validationAddressProvinceRequired,
      addressWardRequired: accountLabels.validationAddressWardRequired,
      genderInvalid: accountLabels.validationGenderInvalid,
      dateOfBirthInvalid: accountLabels.validationDateOfBirthInvalid,
      dateOfBirthFuture: accountLabels.validationDateOfBirthFuture,
      avatarUrlInvalid: accountLabels.validationAvatarUrlInvalid,
      avatarUrlTooLong: accountLabels.validationAvatarUrlTooLong
    });

    setFormValues(nextValues);
    setErrors(nextErrors);

    if (hasAnyValidationError(nextErrors)) {
      setNotice({
        type: 'error',
        message: accountLabels.fixValidation
      });
      return;
    }

    if (!hasChanges) {
      setNotice({
        type: 'error',
        message: accountLabels.noChanges
      });
      return;
    }

    setNotice(null);
    setIsSaving(true);

    const result = await updateProfile({
      ...nextValues,
      dateOfBirth: nextValues.dateOfBirth || null,
      avatarUrl: nextValues.avatarUrl || null
    });

    if (result.ok) {
      setInitialValues(nextValues);
      setNotice({
        type: 'success',
        message: result.message ?? text.account.saveSuccess
      });
    } else {
      setNotice({
        type: 'error',
        message: result.message ?? text.account.saveFailed
      });
    }

    setIsSaving(false);
  };

  const handleLogout = () => {
    router.push('/logout');
  };

  const username = user.email.split('@')[0] ?? user.name;
  const displayName = normalizedCurrent.name.trim() || username;
  const avatarLetter = (normalizedCurrent.name.trim()[0] ?? user.email[0] ?? 'B').toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900">
      <Header keywords={trendingKeywords} />

      <main className="mx-auto w-full max-w-[1200px] px-3 pb-10 pt-5 md:px-4 md:pb-12 md:pt-6">
        <section className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-2xl bg-white p-4 shadow-card lg:rounded-sm lg:bg-transparent lg:p-0 lg:shadow-none">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-4 lg:pb-5">
              <AvatarPreview src={avatarPreviewUrl} letter={avatarLetter} className="h-12 w-12 text-lg" />
              <div>
                <p className="max-w-[150px] truncate text-sm font-semibold text-slate-900">{displayName}</p>
                <p className="text-sm text-slate-500">{accountLabels.editProfile}</p>
              </div>
            </div>

            <nav className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label="Account shortcuts">
              <span className="shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white">{accountLabels.profile}</span>
              <Link href="/orders" className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700">
                {accountLabels.order}
              </Link>
              <button type="button" className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700">
                {accountLabels.voucher}
              </button>
              <button type="button" className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700">
                {accountLabels.xu}
              </button>
            </nav>

            <nav className="hidden space-y-5 py-5 text-[15px] lg:block">
              <div className="space-y-2">
                <button type="button" className="block text-left font-medium text-slate-900">
                  {accountLabels.notification}
                </button>
                <button type="button" className="block text-left font-medium text-slate-900">
                  {accountLabels.account}
                </button>
                <div className="space-y-1 pl-4 text-[14px] text-slate-600">
                  <p className="font-semibold text-brand-500">{accountLabels.profile}</p>
                  <p>{accountLabels.bank}</p>
                  <p>{accountLabels.addressBook}</p>
                  <p>{accountLabels.changePassword}</p>
                  <p>{accountLabels.notificationSettings}</p>
                  <p>{accountLabels.privacySettings}</p>
                </div>
              </div>
              <div className="space-y-2 font-medium text-slate-900">
                <Link href="/orders" className="block text-left">
                  {accountLabels.order}
                </Link>
                <button type="button" className="block text-left">
                  {accountLabels.voucher}
                </button>
                <button type="button" className="block text-left">
                  {accountLabels.xu}
                </button>
              </div>
            </nav>
          </aside>

          <article className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm md:px-8 md:py-6 lg:rounded-sm lg:shadow-none">
            <h1 className="text-3xl font-semibold text-slate-900 md:text-[30px]">{accountLabels.profileTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{accountLabels.profileSubtitle}</p>
            <div className="mt-5 border-t border-slate-200 pt-5" />

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
              <form onSubmit={handleSubmit} className="space-y-5 border-slate-200 lg:border-r lg:pr-8">
                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm text-slate-500">{accountLabels.username}</p>
                  <p className="text-sm">{username}</p>
                </div>

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                  <span className="pt-2 text-sm text-slate-500">{accountLabels.fullName}</span>
                  <div>
                    <input
                      type="text"
                      value={formValues.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFormValues((previous) => ({ ...previous, name: value }));
                        setErrors((previous) => ({ ...previous, name: undefined }));
                        setNotice(null);
                      }}
                      className="h-11 w-full rounded-sm border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      maxLength={MAX_FULL_NAME_LENGTH}
                      required
                    />
                    {errors.name ? <p className="mt-1 text-xs text-red-600">{errors.name}</p> : null}
                  </div>
                </label>

                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm text-slate-500">{accountLabels.email}</p>
                  <p className="text-sm text-slate-700">
                    {maskEmail(user.email)} <span className="font-medium text-slate-400">({accountLabels.emailReadonly})</span>
                  </p>
                </div>

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                  <span className="pt-2 text-sm text-slate-500">{accountLabels.phone}</span>
                  <div>
                    <input
                      type="tel"
                      value={formValues.phone}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFormValues((previous) => ({ ...previous, phone: value }));
                        setErrors((previous) => ({ ...previous, phone: undefined }));
                        setNotice(null);
                      }}
                      className="h-11 w-full rounded-sm border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      required
                    />
                    {errors.phone ? <p className="mt-1 text-xs text-red-600">{errors.phone}</p> : null}
                  </div>
                </label>

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                  <span className="pt-2 text-sm text-slate-500">{accountLabels.address}</span>
                  <div>
                    <textarea
                      rows={3}
                      value={formValues.address}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFormValues((previous) => ({ ...previous, address: value }));
                        setErrors((previous) => ({ ...previous, address: undefined }));
                        setNotice(null);
                      }}
                      className="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      maxLength={MAX_ADDRESS_LENGTH}
                    />
                    {errors.address ? <p className="mt-1 text-xs text-red-600">{errors.address}</p> : null}
                  </div>
                </label>

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                  <span className="pt-2 text-sm text-slate-500">{accountLabels.addressProvince}</span>
                  <div>
                    <select
                      value={formValues.addressProvinceCode}
                      disabled={isLoadingProvinces}
                      onChange={(event) => {
                        const code = event.target.value;
                        const selected = provinces.find((province) => province.code === code);
                        setFormValues((previous) => ({
                          ...previous,
                          addressProvinceCode: code,
                          addressProvince: selected?.name ?? '',
                          addressWardCode: '',
                          addressWard: ''
                        }));
                        setErrors((previous) => ({ ...previous, addressProvince: undefined, addressWard: undefined }));
                        setNotice(null);
                      }}
                      className="h-11 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
                    >
                      <option value="">{isLoadingProvinces ? accountLabels.loadingLocations : accountLabels.selectProvince}</option>
                      {provinces.map((province) => (
                        <option key={province.code} value={province.code}>
                          {province.name}
                        </option>
                      ))}
                    </select>
                    {errors.addressProvince ? <p className="mt-1 text-xs text-red-600">{errors.addressProvince}</p> : null}
                  </div>
                </label>

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                  <span className="pt-2 text-sm text-slate-500">{accountLabels.addressWard}</span>
                  <div>
                    <select
                      value={formValues.addressWardCode}
                      disabled={!formValues.addressProvinceCode || isLoadingWards}
                      onChange={(event) => {
                        const code = event.target.value;
                        const selected = wards.find((ward) => ward.code === code);
                        setFormValues((previous) => ({
                          ...previous,
                          addressWardCode: code,
                          addressWard: selected?.name ?? ''
                        }));
                        setErrors((previous) => ({ ...previous, addressWard: undefined }));
                        setNotice(null);
                      }}
                      className="h-11 w-full rounded-sm border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none disabled:bg-slate-100"
                    >
                      <option value="">{isLoadingWards ? accountLabels.loadingLocations : accountLabels.selectWard}</option>
                      {wards.map((ward) => (
                        <option key={ward.code} value={ward.code}>
                          {ward.name}
                        </option>
                      ))}
                    </select>
                    {errors.addressWard ? <p className="mt-1 text-xs text-red-600">{errors.addressWard}</p> : null}
                    {locationError ? <p className="mt-1 text-xs text-red-600">{locationError}</p> : null}
                  </div>
                </label>

                <fieldset className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                  <legend className="pt-2 text-sm text-slate-500">{accountLabels.gender}</legend>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="gender"
                          value="male"
                          checked={formValues.gender === 'male'}
                          onChange={() => {
                            setFormValues((previous) => ({ ...previous, gender: 'male' }));
                            setErrors((previous) => ({ ...previous, gender: undefined }));
                            setNotice(null);
                          }}
                          className="h-4 w-4 border-slate-300 text-brand-500 focus:ring-brand-500"
                        />
                        {accountLabels.genderMale}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="gender"
                          value="female"
                          checked={formValues.gender === 'female'}
                          onChange={() => {
                            setFormValues((previous) => ({ ...previous, gender: 'female' }));
                            setErrors((previous) => ({ ...previous, gender: undefined }));
                            setNotice(null);
                          }}
                          className="h-4 w-4 border-slate-300 text-brand-500 focus:ring-brand-500"
                        />
                        {accountLabels.genderFemale}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="gender"
                          value="other"
                          checked={formValues.gender === 'other'}
                          onChange={() => {
                            setFormValues((previous) => ({ ...previous, gender: 'other' }));
                            setErrors((previous) => ({ ...previous, gender: undefined }));
                            setNotice(null);
                          }}
                          className="h-4 w-4 border-slate-300 text-brand-500 focus:ring-brand-500"
                        />
                        {accountLabels.genderOther}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="gender"
                          value="unspecified"
                          checked={formValues.gender === 'unspecified'}
                          onChange={() => {
                            setFormValues((previous) => ({ ...previous, gender: 'unspecified' }));
                            setErrors((previous) => ({ ...previous, gender: undefined }));
                            setNotice(null);
                          }}
                          className="h-4 w-4 border-slate-300 text-brand-500 focus:ring-brand-500"
                        />
                        {accountLabels.genderUnspecified}
                      </label>
                    </div>
                    {errors.gender ? <p className="mt-1 text-xs text-red-600">{errors.gender}</p> : null}
                  </div>
                </fieldset>

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                  <span className="pt-2 text-sm text-slate-500">{accountLabels.dateOfBirth}</span>
                  <div>
                    <input
                      type="date"
                      value={formValues.dateOfBirth}
                      max={today}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFormValues((previous) => ({ ...previous, dateOfBirth: value }));
                        setErrors((previous) => ({ ...previous, dateOfBirth: undefined }));
                        setNotice(null);
                      }}
                      className="h-11 w-full rounded-sm border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                    />
                    {errors.dateOfBirth ? <p className="mt-1 text-xs text-red-600">{errors.dateOfBirth}</p> : null}
                  </div>
                </label>

                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm text-slate-500">{accountLabels.memberSince}</p>
                  <p className="text-sm text-slate-700">{formatMemberDate(user.createdAt, locale)}</p>
                </div>

                {notice ? (
                  <p
                    className={`rounded-sm px-3 py-2 text-sm ${notice.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}
                  >
                    {notice.message}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSaveDisabled}
                    className={`h-11 min-w-[110px] rounded-sm px-6 text-sm font-semibold text-white transition ${
                      isSaveDisabled ? 'cursor-not-allowed bg-slate-300' : 'bg-brand-500 hover:bg-brand-600'
                    }`}
                  >
                    {isSaving ? accountLabels.saving : accountLabels.save}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="h-11 rounded-sm border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-brand-500 hover:text-brand-500"
                  >
                    {text.account.logout}
                  </button>
                </div>
              </form>

              <div className="flex flex-col items-center border-t border-slate-200 pt-6 lg:border-t-0 lg:pt-2">
                <AvatarPreview src={avatarPreviewUrl} letter={avatarLetter} className="h-24 w-24 text-3xl" />

                <label className="mt-4 w-full text-sm text-slate-700">
                  <span className="mb-2 block text-center text-slate-500">{accountLabels.avatarUrl}</span>
                  <input
                    type="url"
                    value={formValues.avatarUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFormValues((previous) => ({ ...previous, avatarUrl: value }));
                      setErrors((previous) => ({ ...previous, avatarUrl: undefined }));
                      setNotice(null);
                    }}
                    placeholder="https://..."
                    className="h-11 w-full rounded-sm border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                  <span className="mt-2 block text-center text-xs text-slate-400">{accountLabels.avatarHint}</span>
                  {errors.avatarUrl ? <p className="mt-1 text-xs text-red-600">{errors.avatarUrl}</p> : null}
                </label>
                {formValues.avatarUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFormValues((previous) => ({ ...previous, avatarUrl: '' }));
                      setErrors((previous) => ({ ...previous, avatarUrl: undefined }));
                      setNotice(null);
                    }}
                    className="mt-3 h-9 rounded-sm border border-slate-300 px-3 text-sm text-slate-600 hover:border-brand-500 hover:text-brand-500"
                  >
                    {accountLabels.avatarClear}
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function AvatarPreview({ src, letter, className = '' }: { src: string | null; letter: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const imageSrc = src && !failed ? src : null;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div
      className={`grid place-items-center overflow-hidden rounded-full bg-gradient-to-br from-amber-500 to-orange-600 font-semibold text-white ${className}`}
    >
      {imageSrc ? (
        <Image
          src={imageSrc}
          alt=""
          width={96}
          height={96}
          unoptimized
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{letter}</span>
      )}
    </div>
  );
}
