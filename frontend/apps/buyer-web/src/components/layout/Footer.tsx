'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/providers/AppProvider';

interface FooterCopy {
  brandLine: string;
  supportLine: string;
  customerServiceTitle: string;
  customerServiceLinks: string[];
  aboutTitle: string;
  aboutLinks: string[];
  paymentTitle: string;
  shippingTitle: string;
  followTitle: string;
  downloadTitle: string;
  downloadHint: string;
  copyright: string;
  regionLabel: string;
  regions: string[];
  legalLinks: string[];
  companyName: string;
  companyAddress: string;
  companyHotline: string;
  companyDirector: string;
  companyTax: string;
  highlights: string[];
}

const paymentMethods = ['VISA', 'Master', 'JCB', 'AMEX', 'SPay', 'COD', 'VNPay', 'MoMo'];
const shippingUnits = ['SPX', 'GHN', 'Viettel Post', 'VNPost', 'J&T', 'Ninja Van', 'Best'];
const socialNetworks = [
  { label: 'Facebook', initials: 'F' },
  { label: 'Instagram', initials: 'I' },
  { label: 'LinkedIn', initials: 'L' }
];
const appStores = ['App Store', 'Google Play', 'AppGallery'];

const footerCopy: Record<'vi' | 'en', FooterCopy> = {
  vi: {
    brandLine: 'E-Mall',
    supportLine: 'Mua sắm trực tuyến tiện lợi, giao hàng nhanh và hỗ trợ người mua tại Việt Nam.',
    customerServiceTitle: 'DỊCH VỤ KHÁCH HÀNG',
    customerServiceLinks: [
      'Trung Tâm Trợ Giúp',
      'Hướng Dẫn Mua Hàng',
      'Hướng Dẫn Bán Hàng',
      'Thanh Toán',
      'Vận Chuyển',
      'Trả Hàng và Hoàn Tiền',
      'Chính Sách Bảo Hành'
    ],
    aboutTitle: 'E-MALL VIỆT NAM',
    aboutLinks: [
      'Giới Thiệu',
      'Tuyển Dụng',
      'Điều Khoản E-Mall',
      'Chính Sách Bảo Mật',
      'Kênh Người Bán',
      'Liên Hệ Truyền Thông'
    ],
    paymentTitle: 'THANH TOÁN',
    shippingTitle: 'ĐƠN VỊ VẬN CHUYỂN',
    followTitle: 'THEO DÕI E-MALL',
    downloadTitle: 'TẢI ỨNG DỤNG E-MALL',
    downloadHint: 'Quét mã để mua sắm nhanh hơn',
    copyright: '(c) 2026 E-Mall. Tất cả quyền được bảo lưu.',
    regionLabel: 'Quốc gia và Khu vực:',
    regions: ['Viet Nam', 'Singapore', 'Indonesia', 'Thailand', 'Malaysia', 'Philippines', 'Brazil', 'Mexico'],
    legalLinks: ['CHÍNH SÁCH BẢO MẬT', 'QUY CHẾ HOẠT ĐỘNG', 'CHÍNH SÁCH VẬN CHUYỂN', 'CHÍNH SÁCH TRẢ HÀNG VÀ HOÀN TIỀN'],
    companyName: 'Công ty TNHH E-Mall',
    companyAddress: 'Địa chỉ: Tầng 4-5-6, Tòa nhà Capital Place, số 29 đường Liễu Giai, Phường Ngọc Hà, Thành phố Hà Nội, Việt Nam',
    companyHotline: 'Chăm sóc khách hàng: Gọi tổng đài miễn phí hoặc trò chuyện với E-Mall ngay trên Trung tâm trợ giúp',
    companyDirector: 'Chịu trách nhiệm quản lý nội dung: Nguyễn Văn A',
    companyTax: 'Mã số doanh nghiệp: 0106773786 do Sở Kế hoạch và Đầu tư TP Hà Nội cấp lần đầu ngày 10/02/2015',
    highlights: ['Đổi trả minh bạch', 'Thanh toán an toàn', 'Hỗ trợ người mua']
  },
  en: {
    brandLine: 'E-Mall',
    supportLine: 'Convenient online shopping, fast delivery, and buyer support across Viet Nam.',
    customerServiceTitle: 'CUSTOMER SERVICE',
    customerServiceLinks: ['Help Center', 'Buying Guide', 'Selling Guide', 'Payment', 'Shipping', 'Returns & Refunds', 'Warranty Policy'],
    aboutTitle: 'E-MALL VIET NAM',
    aboutLinks: ['About Us', 'Careers', 'Terms of Service', 'Privacy Policy', 'Seller Centre', 'Media Contact'],
    paymentTitle: 'PAYMENT',
    shippingTitle: 'SHIPPING PARTNERS',
    followTitle: 'FOLLOW E-MALL',
    downloadTitle: 'DOWNLOAD E-MALL APP',
    downloadHint: 'Scan to shop faster',
    copyright: '(c) 2026 E-Mall. All rights reserved.',
    regionLabel: 'Country & Region:',
    regions: ['Viet Nam', 'Singapore', 'Indonesia', 'Thailand', 'Malaysia', 'Philippines', 'Brazil', 'Mexico'],
    legalLinks: ['PRIVACY POLICY', 'OPERATION REGULATION', 'SHIPPING POLICY', 'RETURN & REFUND POLICY'],
    companyName: 'E-Mall Company Limited',
    companyAddress: 'Address: Floors 4-5-6, Capital Place Tower, 29 Lieu Giai Street, Ngoc Ha Ward, Ha Noi, Viet Nam',
    companyHotline: 'Customer care: Toll-free hotline or chat with E-Mall directly in Help Center',
    companyDirector: 'Content management representative: Nguyen Van A',
    companyTax: 'Enterprise registration no: 0106773786 issued by Hanoi DPI on 10/02/2015',
    highlights: ['Transparent returns', 'Secure payments', 'Buyer support']
  }
};

function LogoBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-8 min-w-[76px] items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 shadow-sm shadow-slate-200/70 transition hover:border-brand-200 hover:text-brand-600">
      {label}
    </span>
  );
}

function FooterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-black uppercase tracking-[0.08em] text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FooterLinkList({ links }: { links: string[] }) {
  return (
    <ul className="space-y-2.5 text-sm leading-5 text-slate-600">
      {links.map((item) => (
        <li key={item}>
          <a className="transition hover:text-brand-600" href="#">
            {item}
          </a>
        </li>
      ))}
    </ul>
  );
}

function StoreButton({ label }: { label: string }) {
  return (
    <Link
      href="#"
      className="flex h-9 min-w-[116px] items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm shadow-slate-200/70 transition hover:border-brand-300 hover:text-brand-600"
    >
      {label}
    </Link>
  );
}

function QrCode() {
  return (
    <div className="grid h-[104px] w-[104px] shrink-0 place-items-center rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
      <div className="grid h-[74px] w-[74px] grid-cols-7 grid-rows-7 gap-[3px]">
        {Array.from({ length: 49 }).map((_, index) => {
          const isCorner =
            index < 14 && index % 7 < 2 ||
            index < 14 && index % 7 > 4 ||
            index > 34 && index % 7 < 2 ||
            [17, 19, 23, 24, 26, 31, 32, 38, 40, 45].includes(index);

          return <span key={index} className={isCorner ? 'rounded-[1px] bg-slate-900' : 'rounded-[1px] bg-slate-300'} />;
        })}
      </div>
    </div>
  );
}

export function Footer() {
  const { locale } = useLanguage();
  const copy = footerCopy[locale];

  return (
    <footer className="border-t border-brand-500 bg-slate-50 text-slate-700">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-lg font-black text-white">m</span>
              <span className="text-xl font-black tracking-tight text-slate-950">{copy.brandLine}</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy.supportLine}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
            {copy.highlights.map((item, index) => (
              <div key={item} className="flex min-h-[64px] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-black text-brand-600">
                  {index + 1}
                </span>
                <span className="text-sm font-bold leading-5 text-slate-800">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.15fr_0.9fr_1.25fr]">
          <FooterSection title={copy.customerServiceTitle}>
            <FooterLinkList links={copy.customerServiceLinks} />
          </FooterSection>

          <FooterSection title={copy.aboutTitle}>
            <FooterLinkList links={copy.aboutLinks} />
          </FooterSection>

          <div className="space-y-7">
            <FooterSection title={copy.paymentTitle}>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <LogoBadge key={method} label={method} />
                ))}
              </div>
            </FooterSection>

            <FooterSection title={copy.shippingTitle}>
              <div className="grid grid-cols-2 gap-2">
                {shippingUnits.map((unit) => (
                  <LogoBadge key={unit} label={unit} />
                ))}
              </div>
            </FooterSection>
          </div>

          <FooterSection title={copy.followTitle}>
            <ul className="space-y-3 text-sm text-slate-600">
              {socialNetworks.map((network) => (
                <li key={network.label}>
                  <a className="inline-flex items-center gap-3 transition hover:text-brand-600" href="#">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-black text-slate-700 shadow-sm ring-1 ring-slate-200">
                      {network.initials}
                    </span>
                    <span>{network.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </FooterSection>

          <FooterSection title={copy.downloadTitle}>
            <div className="flex items-start gap-4">
              <QrCode />
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-medium leading-5 text-slate-500">{copy.downloadHint}</p>
                {appStores.map((store) => (
                  <StoreButton key={store} label={store} />
                ))}
              </div>
            </div>
          </FooterSection>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-5 text-sm text-slate-500 lg:flex-row lg:items-center lg:justify-between">
          <p className="font-medium">{copy.copyright}</p>
          <p className="leading-6">
            <span className="font-semibold text-slate-600">{copy.regionLabel}</span> {copy.regions.join(' | ')}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
          {copy.legalLinks.map((link) => (
            <a key={link} href="#" className="transition hover:text-brand-600">
              {link}
            </a>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex h-10 min-w-[124px] items-center justify-center rounded-md border border-brand-200 bg-white px-3 text-xs font-black text-brand-600">
            ĐÃ ĐĂNG KÝ
          </span>
          <span className="inline-flex h-10 min-w-[138px] items-center justify-center rounded-md border border-brand-200 bg-white px-3 text-xs font-black text-brand-600">
            BỘ CÔNG THƯƠNG
          </span>
          <span className="inline-flex h-10 min-w-[42px] items-center justify-center rounded-full border border-brand-200 bg-white text-xs font-black text-brand-600">
            V
          </span>
        </div>

        <div className="mx-auto mt-5 max-w-4xl space-y-1 text-sm leading-6 text-slate-500">
          <p className="font-semibold text-slate-600">{copy.companyName}</p>
          <p>{copy.companyAddress}</p>
          <p>{copy.companyHotline}</p>
          <p>{copy.companyDirector}</p>
          <p>{copy.companyTax}</p>
        </div>
      </div>
    </footer>
  );
}
