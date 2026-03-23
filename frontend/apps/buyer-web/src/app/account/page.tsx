'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { useAuth, useLanguage } from '@/providers/AppProvider';

type ProfileGender = 'male' | 'female' | 'other';

const trendingKeywords = [
  'Sim Vina U1500',
  'Apple iPhone 15',
  'Giấy In Nhiệt A7',
  'Balo Vải Lãng Chính Hãng',
  'iPhone 15 Pro 128gb',
  'Sim U1500 Vinaphone'
];

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

export default function AccountPage() {
  const router = useRouter();
  const { text, locale } = useLanguage();
  const { ready, user, updateProfile } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState<ProfileGender>('male');
  const [birthday, setBirthday] = useState('');
  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!user) {
      router.replace('/login');
      return;
    }

    setName(user.name);
    setPhone(user.phone);
    setAddress(user.address);
    setNotice('');
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');
    setIsSaving(true);

    const result = await updateProfile({ name, phone, address });
    if (result.ok && result.message) {
      setNotice(result.message);
    } else if (!result.ok && result.message) {
      setNotice(result.message);
    }
    setIsSaving(false);
  };

  const handleLogout = () => {
    router.push('/logout');
  };

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
          phone: 'Số điện thoại',
          gender: 'Giới tính',
          birthDate: 'Ngày sinh',
          male: 'Nam',
          female: 'Nữ',
          other: 'Khác',
          change: 'Thay Đổi',
          save: 'Lưu',
          chooseImage: 'Chọn Ảnh',
          uploadHint: 'Dung lượng file tối đa 1 MB',
          uploadType: 'Định dạng: .JPEG, .PNG',
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
          phone: 'Phone',
          gender: 'Gender',
          birthDate: 'Birth date',
          male: 'Male',
          female: 'Female',
          other: 'Other',
          change: 'Change',
          save: 'Save',
          chooseImage: 'Choose Image',
          uploadHint: 'Maximum file size 1 MB',
          uploadType: 'Format: .JPEG, .PNG',
          supportTitle: 'CUSTOMER SERVICE',
          companyTitle: 'MARKET VIET NAM',
          paymentTitle: 'PAYMENT',
          socialTitle: 'FOLLOW MARKET',
          appTitle: 'DOWNLOAD APP'
        };

  const username = user.email.split('@')[0] ?? user.name;
  const avatarLetter = (user.name.trim()[0] ?? user.email[0] ?? 'B').toUpperCase();

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

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm text-slate-500">{accountLabels.fullName}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="h-11 w-full rounded-sm border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                    required
                  />
                </label>

                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm text-slate-500">{accountLabels.email}</p>
                  <p className="text-sm text-slate-700">
                    {maskEmail(user.email)}{' '}
                    <button type="button" className="font-medium text-brand-600 hover:underline">
                      {accountLabels.change}
                    </button>
                  </p>
                </div>

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm text-slate-500">{accountLabels.phone}</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="h-11 w-full rounded-sm border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                    required
                  />
                </label>

                <label className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-start">
                  <span className="pt-2 text-sm text-slate-500">{text.account.address}</span>
                  <textarea
                    rows={3}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="w-full rounded-sm border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </label>

                <fieldset className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <legend className="text-sm text-slate-500">{accountLabels.gender}</legend>
                  <div className="flex items-center gap-5 pt-1">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="gender"
                        checked={gender === 'male'}
                        onChange={() => setGender('male')}
                        className="h-4 w-4 border-slate-300 text-brand-500 focus:ring-brand-500"
                      />
                      {accountLabels.male}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="gender"
                        checked={gender === 'female'}
                        onChange={() => setGender('female')}
                        className="h-4 w-4 border-slate-300 text-brand-500 focus:ring-brand-500"
                      />
                      {accountLabels.female}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="gender"
                        checked={gender === 'other'}
                        onChange={() => setGender('other')}
                        className="h-4 w-4 border-slate-300 text-brand-500 focus:ring-brand-500"
                      />
                      {accountLabels.other}
                    </label>
                  </div>
                </fieldset>

                <div className="grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center">
                  <p className="text-sm text-slate-500">{accountLabels.birthDate}</p>
                  <p className="text-sm text-slate-700">
                    {birthday || formatMemberDate(user.createdAt, locale)}{' '}
                    <button
                      type="button"
                      onClick={() => setBirthday('**/**/2003')}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {accountLabels.change}
                    </button>
                  </p>
                </div>

                {notice ? <p className="rounded-sm bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p> : null}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="h-11 min-w-[110px] rounded-sm bg-brand-500 px-6 text-sm font-semibold text-white transition hover:bg-brand-600"
                  >
                    {accountLabels.save}
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
                <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 text-3xl font-semibold text-white">
                  {avatarLetter}
                </div>
                <button
                  type="button"
                  className="mt-4 rounded-sm border border-slate-300 px-6 py-2 text-sm text-slate-700 transition hover:border-slate-400"
                >
                  {accountLabels.chooseImage}
                </button>
                <p className="mt-4 text-center text-sm text-slate-500">{accountLabels.uploadHint}</p>
                <p className="text-center text-sm text-slate-500">{accountLabels.uploadType}</p>
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
