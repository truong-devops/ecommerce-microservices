'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { getSellerShopProfile, updateSellerShopProfile } from '@/lib/api/shop-profile';
import { useAuth } from '@/providers/AppProvider';

interface ShopProfileFormState {
  shopName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  phone: string;
  address: string;
  avatarUrl: string;
}

const initialFormState: ShopProfileFormState = {
  shopName: '',
  contactFirstName: '',
  contactLastName: '',
  email: '',
  phone: '',
  address: '',
  avatarUrl: ''
};

export default function ShopProfilePage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [form, setForm] = useState<ShopProfileFormState>(initialFormState);
  const [savedForm, setSavedForm] = useState<ShopProfileFormState>(initialFormState);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const loadProfile = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSaveMessage('');

    try {
      const profile = await getSellerShopProfile(accessToken);
      const nextForm: ShopProfileFormState = {
        shopName: profile.shopName ?? '',
        contactFirstName: profile.contactFirstName ?? '',
        contactLastName: profile.contactLastName ?? '',
        email: profile.email ?? '',
        phone: profile.phone ?? '',
        address: profile.address ?? '',
        avatarUrl: profile.avatarUrl ?? ''
      };

      setForm(nextForm);
      setSavedForm(nextForm);
    } catch (error) {
      if (error instanceof SellerApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Không tải được hồ sơ shop từ API.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }

    void loadProfile();
  }, [ready, accessToken, loadProfile]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken) {
      setErrorMessage('Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.');
      return;
    }

    setIsSaving(true);
    setSaveMessage('');
    setErrorMessage('');

    try {
      const updated = await updateSellerShopProfile(accessToken, {
        shopName: form.shopName,
        contactFirstName: form.contactFirstName,
        contactLastName: form.contactLastName,
        phone: form.phone,
        address: form.address,
        avatarUrl: form.avatarUrl
      });
      const nextForm: ShopProfileFormState = {
        shopName: updated.shopName ?? '',
        contactFirstName: updated.contactFirstName ?? '',
        contactLastName: updated.contactLastName ?? '',
        email: updated.email ?? '',
        phone: updated.phone ?? '',
        address: updated.address ?? '',
        avatarUrl: updated.avatarUrl ?? ''
      };

      setForm(nextForm);
      setSavedForm(nextForm);
      setSaveMessage('Lưu hồ sơ shop thành công.');
    } catch (error) {
      if (error instanceof SellerApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Không thể lưu hồ sơ shop.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!ready) {
    return <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">Đang kiểm tra phiên đăng nhập...</main>;
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Center.</p>
          <Link href="/login" className="mt-5 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Đi đến trang đăng nhập
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen text-slate-900">
      <SellerTopbar email={user.email} role={user.role} onLogout={handleLogout} />

      <div className="flex">
        <SellerSidebar />

        <main className="min-w-0 flex-1 px-3 py-3 lg:px-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <Link href="/" className="hover:text-[#ee4d2d]">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="font-medium text-slate-700">Hồ Sơ Shop</span>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-4 lg:p-6">
            <div className="mb-4 border-b border-slate-200 pb-4">
              <h1 className="text-xl font-semibold text-slate-900">Hồ Sơ Shop</h1>
              <p className="mt-1 text-sm text-slate-500">Cập nhật thông tin cơ bản để khách hàng hiểu rõ hơn về shop của bạn.</p>
            </div>

            {errorMessage ? <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p> : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  Tên shop
                  <input
                    value={form.shopName}
                    onChange={(event) => setForm((previous) => ({ ...previous, shopName: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#ee4d2d]"
                    required
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  Ảnh đại diện (URL)
                  <input
                    value={form.avatarUrl}
                    onChange={(event) => setForm((previous) => ({ ...previous, avatarUrl: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#ee4d2d]"
                    placeholder="https://..."
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block text-sm text-slate-700">
                  Tên người liên hệ
                  <input
                    value={form.contactFirstName}
                    onChange={(event) => setForm((previous) => ({ ...previous, contactFirstName: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#ee4d2d]"
                    required
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  Họ người liên hệ
                  <input
                    value={form.contactLastName}
                    onChange={(event) => setForm((previous) => ({ ...previous, contactLastName: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#ee4d2d]"
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* <label className="block text-sm text-slate-700">
                  Email liên hệ
                  <input
                    type="email"
                    value={form.email}
                    readOnly
                    className="mt-1 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
                  />
                  <span className="mt-1 block text-xs text-slate-500">Email đăng nhập được quản lý ở tài khoản auth, không sửa tại trang này.</span>
                </label> */}
                <label className="block text-sm text-slate-700">
                  Số điện thoại
                  <input
                    value={form.phone}
                    onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#ee4d2d]"
                    required
                  />
                </label>

                <label className="block text-sm text-slate-700">
                  Địa chỉ
                  <input
                    value={form.address}
                    onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#ee4d2d]"
                    required
                  />
                </label>
              </div>

              {saveMessage ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{saveMessage}</p> : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSaving || isLoading}
                  className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#db4729] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? 'Đang lưu...' : isLoading ? 'Đang tải...' : 'Lưu thay đổi'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm(savedForm);
                    setSaveMessage('');
                    setErrorMessage('');
                  }}
                  disabled={isSaving || isLoading}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Hoàn tác thay đổi
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void loadProfile();
                  }}
                  disabled={isSaving}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Tải lại
                </button>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
