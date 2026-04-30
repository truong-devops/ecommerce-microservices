'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import { getSellerShopDecor, updateSellerShopDecor } from '@/lib/api/shop-decor';
import type { SellerShopDecor } from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

interface ShopDecorForm {
  shopName: string;
  slogan: string;
  logoUrl: string;
  bannerUrl: string;
  accentColor: string;
  navItems: string;
  introTitle: string;
  introDescription: string;
  featuredCategories: string;
}

const initialForm: ShopDecorForm = {
  shopName: '',
  slogan: '',
  logoUrl: '',
  bannerUrl: '',
  accentColor: '#ee4d2d',
  navItems: '',
  introTitle: '',
  introDescription: '',
  featuredCategories: ''
};

const BUYER_WEB_BASE_URL = process.env.NEXT_PUBLIC_BUYER_WEB_BASE_URL ?? 'http://localhost:8888';

export default function ShopDecorPage() {
  const router = useRouter();
  const { ready, user, accessToken, logout } = useAuth();

  const [form, setForm] = useState<ShopDecorForm>(initialForm);
  const [savedForm, setSavedForm] = useState<ShopDecorForm>(initialForm);
  const [sellerId, setSellerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const loadDecor = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const decor = await getSellerShopDecor(accessToken);
      const next = toForm(decor);
      setForm(next);
      setSavedForm(next);
      setSellerId(decor.sellerId);
    } catch (loadError) {
      if (loadError instanceof SellerApiClientError) {
        setError(loadError.message);
      } else {
        setError('Không tải được dữ liệu trang trí shop.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }

    void loadDecor();
  }, [ready, accessToken, loadDecor]);

  const previewNavItems = useMemo(() => toTagList(form.navItems), [form.navItems]);
  const previewCategories = useMemo(() => toTagList(form.featuredCategories), [form.featuredCategories]);
  const publicShopHref = sellerId ? `${BUYER_WEB_BASE_URL}/shops/${encodeURIComponent(sellerId)}` : '#';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setError('Phiên đăng nhập không hợp lệ.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const updated = await updateSellerShopDecor(accessToken, {
        shopName: form.shopName,
        slogan: form.slogan,
        logoUrl: form.logoUrl,
        bannerUrl: form.bannerUrl,
        accentColor: form.accentColor,
        navItems: toTagList(form.navItems),
        introTitle: form.introTitle,
        introDescription: form.introDescription,
        featuredCategories: toTagList(form.featuredCategories)
      });

      const next = toForm(updated);
      setForm(next);
      setSavedForm(next);
      setSellerId(updated.sellerId);
      setMessage('Đã lưu thiết kế shop.');
    } catch (saveError) {
      if (saveError instanceof SellerApiClientError) {
        setError(saveError.message);
      } else {
        setError('Không thể lưu thiết kế shop.');
      }
    } finally {
      setSaving(false);
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
            <span className="font-medium text-slate-700">Trang Trí Shop</span>
          </div>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <article className="rounded-md border border-slate-200 bg-white p-4 lg:p-5">
              <div className="mb-4 border-b border-slate-200 pb-3">
                <h1 className="text-xl font-semibold">Thiết kế Shop</h1>
                <p className="mt-1 text-sm text-slate-500">Chỉnh nhanh giao diện shop mà người mua nhìn thấy khi bấm vào tên shop từ trang sản phẩm.</p>
              </div>

              {error ? <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
              {message ? <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

              <form onSubmit={handleSubmit} className="space-y-3">
                <InputRow label="Tên shop" value={form.shopName} onChange={(value) => setForm((p) => ({ ...p, shopName: value }))} />
                <InputRow label="Slogan" value={form.slogan} onChange={(value) => setForm((p) => ({ ...p, slogan: value }))} />
                <InputRow label="Logo URL" value={form.logoUrl} onChange={(value) => setForm((p) => ({ ...p, logoUrl: value }))} />
                <InputRow label="Banner URL" value={form.bannerUrl} onChange={(value) => setForm((p) => ({ ...p, bannerUrl: value }))} />

                <label className="block text-sm">
                  Màu chủ đạo
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={form.accentColor}
                      onChange={(event) => setForm((p) => ({ ...p, accentColor: event.target.value }))}
                      className="h-10 w-12 rounded border border-slate-300 bg-white p-1"
                    />
                    <input
                      value={form.accentColor}
                      onChange={(event) => setForm((p) => ({ ...p, accentColor: event.target.value }))}
                      className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm"
                    />
                  </div>
                </label>

                <InputRow
                  label="Menu shop (phân tách dấu phẩy)"
                  value={form.navItems}
                  onChange={(value) => setForm((p) => ({ ...p, navItems: value }))}
                />
                <InputRow label="Tiêu đề giới thiệu" value={form.introTitle} onChange={(value) => setForm((p) => ({ ...p, introTitle: value }))} />

                <label className="block text-sm">
                  Mô tả giới thiệu
                  <textarea
                    rows={3}
                    value={form.introDescription}
                    onChange={(event) => setForm((p) => ({ ...p, introDescription: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>

                <InputRow
                  label="Nhóm sản phẩm nổi bật (phân tách dấu phẩy)"
                  value={form.featuredCategories}
                  onChange={(value) => setForm((p) => ({ ...p, featuredCategories: value }))}
                />

                <div className="pt-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={loading || saving}
                      className="rounded-md bg-[#ee4d2d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
                    >
                      {saving ? 'Đang lưu...' : 'Lưu trang trí'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForm(savedForm);
                        setError('');
                        setMessage('');
                      }}
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                    >
                      Hoàn tác
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void loadDecor();
                      }}
                      className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                    >
                      Tải lại
                    </button>
                    <Link
                      href={publicShopHref}
                      target="_blank"
                      className="rounded-md border border-[#ee4d2d] px-4 py-2 text-sm font-semibold text-[#ee4d2d]"
                    >
                      Mở trang shop người mua
                    </Link>
                  </div>
                </div>
              </form>
            </article>

            <article className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-700">Preview trang shop</h2>
              </div>

              <div className="min-h-[620px] bg-slate-50">
                <div className="h-3" style={{ backgroundColor: normalizeColor(form.accentColor) }} />

                <div className="relative px-4 py-4">
                  {form.bannerUrl ? (
                    <img src={form.bannerUrl} alt={form.shopName || 'Shop banner'} className="h-40 w-full rounded-md object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center rounded-md bg-slate-200 text-sm text-slate-600">Banner preview</div>
                  )}

                  <div className="-mt-10 grid gap-3 rounded-md bg-white/95 p-4 shadow-lg backdrop-blur md:grid-cols-[88px_minmax(0,1fr)]">
                    {form.logoUrl ? (
                      <img src={form.logoUrl} alt={form.shopName || 'Shop logo'} className="h-20 w-20 rounded-full border border-slate-200 object-cover" />
                    ) : (
                      <div className="grid h-20 w-20 place-items-center rounded-full bg-slate-100 text-xs text-slate-500">LOGO</div>
                    )}
                    <div>
                      <h3 className="text-xl font-semibold">{form.shopName || 'Tên shop'}</h3>
                      <p className="text-sm text-slate-600">{form.slogan || 'Slogan shop'}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>Người theo dõi: 12.4k</span>
                        <span>•</span>
                        <span>Đánh giá: 4.9/5</span>
                        <span>•</span>
                        <span>Phản hồi chat: 98%</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                    {previewNavItems.map((item) => (
                      <span key={item} className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 shadow-sm">
                        {item}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 rounded-md bg-white p-4">
                    <h4 className="text-lg font-semibold">{form.introTitle || 'Tiêu đề giới thiệu'}</h4>
                    <p className="mt-1 text-sm text-slate-600">{form.introDescription || 'Mô tả ngắn về shop của bạn sẽ hiển thị ở đây.'}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {previewCategories.map((category) => (
                        <span
                          key={category}
                          className="rounded-md px-3 py-1 text-xs font-medium text-white"
                          style={{ backgroundColor: normalizeColor(form.accentColor) }}
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}

function toForm(decor: SellerShopDecor): ShopDecorForm {
  return {
    shopName: decor.shopName,
    slogan: decor.slogan,
    logoUrl: decor.logoUrl,
    bannerUrl: decor.bannerUrl,
    accentColor: decor.accentColor,
    navItems: decor.navItems.join(', '),
    introTitle: decor.introTitle,
    introDescription: decor.introDescription,
    featuredCategories: decor.featuredCategories.join(', ')
  };
}

function toTagList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : '#ee4d2d';
}

function InputRow({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm" />
    </label>
  );
}
