'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import type { BuyerGender } from '@/lib/api/types';
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
  gender: BuyerGender;
  dateOfBirth: string;
  avatarUrl: string;
}

type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

type NoticeState =
  | {
      type: 'success' | 'error';
      message: string;
    }
  | null;

interface ValidationMessages {
  nameRequired: string;
  nameTooLong: string;
  phoneRequired: string;
  phoneInvalid: string;
  addressTooLong: string;
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
    name: values.name.trim(),
    phone: values.phone.trim(),
    address: values.address.trim(),
    gender: normalizeGender(values.gender),
    dateOfBirth: normalizeDateOfBirth(values.dateOfBirth),
    avatarUrl: values.avatarUrl.trim()
  };
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

  if (values.address.length > MAX_ADDRESS_LENGTH) {
    errors.address = messages.addressTooLong;
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
    gender: 'unspecified',
    dateOfBirth: '',
    avatarUrl: ''
  });
  const [initialValues, setInitialValues] = useState<ProfileFormValues>({
    name: '',
    phone: '',
    address: '',
    gender: 'unspecified',
    dateOfBirth: '',
    avatarUrl: ''
  });
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [notice, setNotice] = useState<NoticeState>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!user) {
      router.replace('/login');
      return;
    }

    const nextValues: ProfileFormValues = {
      name: user.name,
      phone: user.phone,
      address: user.address,
      gender: normalizeGender(user.gender),
      dateOfBirth: normalizeDateOfBirth(user.dateOfBirth),
      avatarUrl: user.avatarUrl ?? ''
    };

    setFormValues(nextValues);
    setInitialValues(nextValues);
    setErrors({});
    setNotice(null);
  }, [ready, router, user]);

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.account.loading}</div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-app-bg text-slate-700">{text.account.protectedHint}</div>
    );
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
          order: 'Đơn Mua',
          voucher: 'Kho Voucher',
          xu: 'Shopee Xu',
          username: 'Tên đăng nhập',
          fullName: 'Tên',
          email: 'Email',
          emailReadonly: 'Chỉ đọc',
          phone: 'Số điện thoại',
          address: 'Địa chỉ',
          gender: 'Giới tính',
          genderMale: 'Nam',
          genderFemale: 'Nữ',
          genderOther: 'Khác',
          genderUnspecified: 'Không muốn trả lời',
          dateOfBirth: 'Ngày sinh',
          avatarUrl: 'URL ảnh đại diện',
          memberSince: 'Ngày tham gia',
          save: 'Lưu',
          saving: 'Đang lưu...',
          noChanges: 'Không có thay đổi để lưu.',
          validationNameRequired: 'Vui lòng nhập tên.',
          validationNameTooLong: 'Tên không được vượt quá 200 ký tự.',
          validationPhoneRequired: 'Vui lòng nhập số điện thoại.',
          validationPhoneInvalid: 'Số điện thoại không đúng định dạng quốc tế.',
          validationAddressTooLong: 'Địa chỉ không được vượt quá 255 ký tự.',
          validationGenderInvalid: 'Giới tính không hợp lệ.',
          validationDateOfBirthInvalid: 'Ngày sinh phải theo định dạng YYYY-MM-DD.',
          validationDateOfBirthFuture: 'Ngày sinh không được ở tương lai.',
          validationAvatarUrlInvalid: 'URL ảnh đại diện phải là http(s) hợp lệ.',
          validationAvatarUrlTooLong: 'URL ảnh đại diện không được vượt quá 500 ký tự.',
          fixValidation: 'Vui lòng sửa các trường đang báo lỗi trước khi lưu.',
          supportTitle: 'DỊCH VỤ KHÁCH HÀNG',
          companyTitle: 'MARKET VIỆT NAM',
          paymentTitle: 'THANH TOÁN',
          socialTitle: 'THEO DÕI MARKET',
          appTitle: 'TẢI ỨNG DỤNG MARKET'
        }
      : {
          profileTitle: 'My Profile',
          profileSubtitle: 'Manage your profile information for account security',
          editProfile: 'Edit Profile',
          notification: 'Notifications',
          account: 'My Account',
          profile: 'Profile',
          order: 'My Orders',
          voucher: 'Vouchers',
          xu: 'Rewards',
          username: 'Username',
          fullName: 'Name',
          email: 'Email',
          emailReadonly: 'Read only',
          phone: 'Phone',
          address: 'Address',
          gender: 'Gender',
          genderMale: 'Male',
          genderFemale: 'Female',
          genderOther: 'Other',
          genderUnspecified: 'Prefer not to say',
          dateOfBirth: 'Date of birth',
          avatarUrl: 'Avatar URL',
          memberSince: 'Member since',
          save: 'Save',
          saving: 'Saving...',
          noChanges: 'No changes to save.',
          validationNameRequired: 'Please enter your name.',
          validationNameTooLong: 'Name must be at most 200 characters.',
          validationPhoneRequired: 'Please enter your phone number.',
          validationPhoneInvalid: 'Phone number must be in international format.',
          validationAddressTooLong: 'Address must be at most 255 characters.',
          validationGenderInvalid: 'Gender is invalid.',
          validationDateOfBirthInvalid: 'Date of birth must be in YYYY-MM-DD format.',
          validationDateOfBirthFuture: 'Date of birth cannot be in the future.',
          validationAvatarUrlInvalid: 'Avatar URL must be a valid http(s) URL.',
          validationAvatarUrlTooLong: 'Avatar URL must be at most 500 characters.',
          fixValidation: 'Please fix invalid fields before saving.',
          supportTitle: 'CUSTOMER SERVICE',
          companyTitle: 'MARKET VIET NAM',
          paymentTitle: 'PAYMENT',
          socialTitle: 'FOLLOW MARKET',
          appTitle: 'DOWNLOAD APP'
        };

  const normalizedCurrent = normalizeFormValues(formValues);
  const normalizedInitial = normalizeFormValues(initialValues);
  const hasChanges =
    normalizedCurrent.name !== normalizedInitial.name ||
    normalizedCurrent.phone !== normalizedInitial.phone ||
    normalizedCurrent.address !== normalizedInitial.address ||
    normalizedCurrent.gender !== normalizedInitial.gender ||
    normalizedCurrent.dateOfBirth !== normalizedInitial.dateOfBirth ||
    normalizedCurrent.avatarUrl !== normalizedInitial.avatarUrl;

  const isSaveDisabled = isSaving || !hasChanges;

  const avatarPreviewUrl =
    normalizedCurrent.avatarUrl && isValidHttpUrl(normalizedCurrent.avatarUrl) ? normalizedCurrent.avatarUrl : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextValues = normalizeFormValues(formValues);
    const nextErrors = validateProfileForm(nextValues, {
      nameRequired: accountLabels.validationNameRequired,
      nameTooLong: accountLabels.validationNameTooLong,
      phoneRequired: accountLabels.validationPhoneRequired,
      phoneInvalid: accountLabels.validationPhoneInvalid,
      addressTooLong: accountLabels.validationAddressTooLong,
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
  const avatarLetter = (normalizedCurrent.name.trim()[0] ?? user.email[0] ?? 'B').toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900">
      <Header keywords={trendingKeywords} />

      <main className="mx-auto w-full max-w-[1200px] px-3 pb-10 pt-5 md:px-4 md:pb-12 md:pt-6">
        <section className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-sm bg-transparent">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-lg font-semibold text-white">
                {avatarLetter}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{username}</p>
                <p className="text-sm text-slate-500">{accountLabels.editProfile}</p>
              </div>
            </div>

            <nav className="space-y-5 py-5 text-[15px]">
              <div className="space-y-2">
                <button type="button" className="block text-left font-medium text-slate-900">
                  {accountLabels.notification}
                </button>
                <button type="button" className="block text-left font-medium text-slate-900">
                  {accountLabels.account}
                </button>
                <div className="space-y-1 pl-4 text-[14px] text-slate-600">
                  <p className="font-semibold text-brand-500">{accountLabels.profile}</p>
                  <p>Ngân hàng</p>
                  <p>Địa Chỉ</p>
                  <p>Đổi Mật Khẩu</p>
                  <p>Cài Đặt Thông Báo</p>
                  <p>Những Thiết Lập Riêng Tư</p>
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

          <article className="rounded-sm border border-slate-200 bg-white px-4 py-5 md:px-8 md:py-6">
            <h1 className="text-[30px] font-semibold text-slate-900">{accountLabels.profileTitle}</h1>
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
                    className={`rounded-sm px-3 py-2 text-sm ${
                      notice.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}
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
                <div
                  className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 bg-cover bg-center text-3xl font-semibold text-white"
                  style={avatarPreviewUrl ? { backgroundImage: `url(${avatarPreviewUrl})` } : undefined}
                >
                  {avatarPreviewUrl ? null : avatarLetter}
                </div>

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
                  {errors.avatarUrl ? <p className="mt-1 text-xs text-red-600">{errors.avatarUrl}</p> : null}
                </label>
              </div>
            </div>
          </article>
        </section>
      </main>

      <footer className="border-t-4 border-brand-500 bg-white">
        <section className="mx-auto grid w-full max-w-[1200px] gap-8 px-3 py-8 md:grid-cols-2 md:px-4 lg:grid-cols-5 lg:gap-6">
          <div>
            <h2 className="text-sm font-bold text-slate-800">{accountLabels.supportTitle}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Trung Tâm Trợ Giúp</li>
              <li>Market Blog</li>
              <li>Hướng Dẫn Mua Hàng</li>
              <li>Chính Sách Trả Hàng</li>
              <li>Liên Hệ</li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{accountLabels.companyTitle}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Về Market</li>
              <li>Tuyển Dụng</li>
              <li>Điều Khoản</li>
              <li>Chính Sách Bảo Mật</li>
              <li>Kênh Người Bán</li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{accountLabels.paymentTitle}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {['VISA', 'Mastercard', 'JCB', 'Amex', 'SPay', 'COD'].map((item) => (
                <span
                  key={item}
                  className="rounded-sm border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{accountLabels.socialTitle}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Facebook</li>
              <li>Instagram</li>
              <li>LinkedIn</li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">{accountLabels.appTitle}</h2>
            <div className="mt-3 flex items-center gap-3">
              <div className="grid h-20 w-20 place-items-center border border-slate-200 bg-slate-100 text-[11px] font-medium text-slate-500">
                QR
              </div>
              <div className="space-y-2">
                <span className="block rounded-sm border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                  App Store
                </span>
                <span className="block rounded-sm border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                  Google Play
                </span>
                <span className="block rounded-sm border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                  AppGallery
                </span>
              </div>
            </div>
          </div>
        </section>
      </footer>
    </div>
  );
}
