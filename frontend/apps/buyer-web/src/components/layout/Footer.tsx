'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/providers/AppProvider';

interface FooterCopy {
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
}

const paymentMethods = ['VISA', 'Mastercard', 'JCB', 'AMEX', 'COD', 'VNPay', 'MoMo', 'ShopeePay'];
const shippingUnits = ['SPX Express', 'Giao Hàng Nhanh', 'Viettel Post', 'VNPost', 'J&T Express', 'Ninja Van'];
const socialNetworks = [
  { label: 'Facebook', initials: 'f' },
  { label: 'Instagram', initials: 'in' },
  { label: 'LinkedIn', initials: 'li' }
];
const appStores = ['App Store', 'Google Play', 'AppGallery'];

const footerCopy: Record<'vi' | 'en', FooterCopy> = {
  vi: {
    customerServiceTitle: 'CHĂM SÓC KHÁCH HÀNG',
    customerServiceLinks: [
      'Trung Tâm Trợ Giúp',
      'Hướng Dẫn Mua Hàng',
      'Hướng Dẫn Bán Hàng',
      'Thanh Toán & Trả Hàng',
      'Vận Chuyển eMall',
      'Trả Hàng và Hoàn Tiền',
      'Chính Sách Bảo Hành'
    ],
    aboutTitle: 'VỀ EMALL',
    aboutLinks: [
      'Giới Thiệu Về eMall Việt Nam',
      'Tuyển Dụng',
      'Điều Khoản eMall',
      'Chính Sách Bảo Mật',
      'Chính Hãng (eMall Mall)',
      'Kênh Người Bán',
      'Liên Hệ Truyền Thông'
    ],
    paymentTitle: 'THANH TOÁN',
    shippingTitle: 'ĐƠN VỊ VẬN CHUYỂN',
    followTitle: 'THEO DÕI CHÚNG TÔI TRÊN',
    downloadTitle: 'TẢI ỨNG DỤNG EMALL NGAY',
    downloadHint: 'Quét mã để tải ứng dụng',
    copyright: '© 2026 eMall. Tất cả các quyền được bảo lưu.',
    regionLabel: 'Quốc gia & Khu vực:',
    regions: ['Việt Nam', 'Singapore', 'Thái Lan', 'Malaysia', 'Indonesia', 'Philippines', 'Brazil', 'Mexico'],
    legalLinks: ['CHÍNH SÁCH BẢO MẬT', 'QUY CHẾ HOẠT ĐỘNG', 'CHÍNH SÁCH VẬN CHUYỂN', 'CHÍNH SÁCH TRẢ HÀNG VÀ HOÀN TIỀN'],
    companyName: 'Công ty TNHH eMall',
    companyAddress: 'Địa chỉ: Tầng 4-5-6, Tòa nhà Capital Place, số 29 đường Liễu Giai, Phường Ngọc Hà, Thành phố Hà Nội, Việt Nam.',
    companyHotline: 'Tổng đài chăm sóc khách hàng: 1900 1221 - Email: cskh@hotro.emall.vn',
    companyDirector: 'Chịu Trách Nhiệm Quản Lý Nội Dung: Nguyễn Văn A',
    companyTax: 'Mã số doanh nghiệp: 0106773786 do Sở Kế hoạch & Đầu tư TP Hà Nội cấp lần đầu ngày 10/02/2015'
  },
  en: {
    customerServiceTitle: 'CUSTOMER SERVICE',
    customerServiceLinks: ['Help Center', 'Buying Guide', 'Selling Guide', 'Payment & Orders', 'Shipping', 'Returns & Refunds', 'Warranty Policy'],
    aboutTitle: 'ABOUT EMALL',
    aboutLinks: ['About Us', 'Careers', 'Terms of Service', 'Privacy Policy', 'eMall Mall', 'Seller Centre', 'Media Contact'],
    paymentTitle: 'PAYMENT',
    shippingTitle: 'SHIPPING PARTNERS',
    followTitle: 'FOLLOW US ON',
    downloadTitle: 'DOWNLOAD EMALL APP NOW',
    downloadHint: 'Scan QR to download app',
    copyright: '© 2026 eMall. All rights reserved.',
    regionLabel: 'Country & Region:',
    regions: ['Viet Nam', 'Singapore', 'Thailand', 'Malaysia', 'Indonesia', 'Philippines', 'Brazil', 'Mexico'],
    legalLinks: ['PRIVACY POLICY', 'OPERATION REGULATION', 'SHIPPING POLICY', 'RETURN & REFUND POLICY'],
    companyName: 'eMall Company Limited',
    companyAddress: 'Address: Floors 4-5-6, Capital Place Tower, 29 Lieu Giai Street, Ngoc Ha Ward, Ha Noi, Viet Nam.',
    companyHotline: 'Customer care hotline: 1900 1221 - Email: support@emall.vn',
    companyDirector: 'Content Management Representative: Nguyen Van A',
    companyTax: 'Enterprise Registration Certificate: 0106773786 issued by Hanoi DPI on 10/02/2015'
  }
};

function PartnerBadge({ label }: { label: string }) {
  return (
    <div className="flex h-7 items-center justify-center rounded border border-[#e8e8e8] bg-white px-2 text-[11px] font-semibold text-[#555555] shadow-2xs hover:border-[#ee4d2d] hover:text-[#ee4d2d] transition">
      <span className="truncate">{label}</span>
    </div>
  );
}

function FooterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-[#333333]">{title}</h3>
      <div className="mt-3.5">{children}</div>
    </div>
  );
}

function FooterLinkList({ links }: { links: string[] }) {
  return (
    <ul className="space-y-2 text-xs text-[#000000a6]">
      {links.map((item) => (
        <li key={item}>
          <a className="transition hover:text-[#ee4d2d]" href="#">
            {item}
          </a>
        </li>
      ))}
    </ul>
  );
}

function QrCode() {
  return (
    <div className="grid h-[86px] w-[86px] shrink-0 place-items-center rounded border border-[#e8e8e8] bg-white p-1.5 shadow-2xs">
      <div className="grid h-full w-full grid-cols-7 grid-rows-7 gap-[2px]">
        {Array.from({ length: 49 }).map((_, index) => {
          const isCorner =
            index < 14 && index % 7 < 2 ||
            index < 14 && index % 7 > 4 ||
            index > 34 && index % 7 < 2 ||
            [17, 19, 23, 24, 26, 31, 32, 38, 40, 45].includes(index);

          return <span key={index} className={isCorner ? 'bg-[#222222]' : 'bg-[#cccccc]'} />;
        })}
      </div>
    </div>
  );
}

export function Footer() {
  const pathname = usePathname();
  const { locale } = useLanguage();
  const copy = footerCopy[locale];

  if (pathname === '/login') return null;

  return (
    <footer className="border-t-4 border-[#ee4d2d] bg-[#fbfbfb] text-[#333333]">
      {/* 5 Column Link Section */}
      <div className="border-b border-[#e8e8e8]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {/* Column 1: Chăm sóc khách hàng */}
          <FooterSection title={copy.customerServiceTitle}>
            <FooterLinkList links={copy.customerServiceLinks} />
          </FooterSection>

          {/* Column 2: Về eMall */}
          <FooterSection title={copy.aboutTitle}>
            <FooterLinkList links={copy.aboutLinks} />
          </FooterSection>

          {/* Column 3: Thanh toán & Vận chuyển */}
          <div className="space-y-5">
            <FooterSection title={copy.paymentTitle}>
              <div className="grid grid-cols-3 gap-1.5">
                {paymentMethods.map((method) => (
                  <PartnerBadge key={method} label={method} />
                ))}
              </div>
            </FooterSection>

            <FooterSection title={copy.shippingTitle}>
              <div className="grid grid-cols-2 gap-1.5">
                {shippingUnits.map((unit) => (
                  <PartnerBadge key={unit} label={unit} />
                ))}
              </div>
            </FooterSection>
          </div>

          {/* Column 4: Theo dõi eMall */}
          <FooterSection title={copy.followTitle}>
            <ul className="space-y-2.5 text-xs text-[#000000a6]">
              {socialNetworks.map((network) => (
                <li key={network.label}>
                  <a className="inline-flex items-center gap-2 transition hover:text-[#ee4d2d]" href="#">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-[#f0f0f0] text-[10px] font-bold text-[#555555]">
                      {network.initials}
                    </span>
                    <span>{network.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </FooterSection>

          {/* Column 5: Tải ứng dụng */}
          <FooterSection title={copy.downloadTitle}>
            <div className="flex items-start gap-3">
              <QrCode />
              <div className="min-w-0 space-y-1.5">
                <p className="text-[11px] text-[#757575] leading-snug">{copy.downloadHint}</p>
                {appStores.map((store) => (
                  <Link
                    key={store}
                    href="#"
                    className="flex h-6 min-w-[96px] items-center justify-center rounded border border-[#e8e8e8] bg-white px-2 text-[10px] font-semibold text-[#555555] shadow-2xs hover:border-[#ee4d2d] hover:text-[#ee4d2d] transition"
                  >
                    {store}
                  </Link>
                ))}
              </div>
            </div>
          </FooterSection>
        </div>
      </div>

      {/* Copyright & Region Bar */}
      <div className="border-b border-[#e8e8e8] bg-[#fbfbfb]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2.5 px-4 py-4 text-xs text-[#0000008a] lg:flex-row lg:items-center lg:justify-between">
          <p>{copy.copyright}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-[#555555]">{copy.regionLabel}</span>
            {copy.regions.map((region, idx) => (
              <span key={region} className="inline-flex items-center gap-2">
                <span className="hover:text-[#ee4d2d] cursor-pointer">{region}</span>
                {idx < copy.regions.length - 1 && <span className="text-[#cccccc]">|</span>}
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* Bottom Legal Section */}
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 text-center bg-[#fbfbfb]">
        {/* Legal policy links */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold uppercase text-[#0000008a]">
          {copy.legalLinks.map((link) => (
            <a key={link} href="#" className="transition hover:text-[#ee4d2d]">
              {link}
            </a>
          ))}
        </div>

        {/* Registered Stamp */}
        <div className="mt-5 flex items-center justify-center gap-3">
          <span className="inline-flex h-8 items-center justify-center rounded border border-[#ee4d2d] bg-white px-3 text-[11px] font-bold text-[#ee4d2d]">
            ✓ ĐÃ ĐĂNG KÝ BỘ CÔNG THƯƠNG
          </span>
          <span className="inline-flex h-8 items-center justify-center rounded border border-[#ee4d2d] bg-white px-3 text-[11px] font-bold text-[#ee4d2d]">
            CHÍNH HÃNG 100%
          </span>
        </div>

        {/* Company Legal Information */}
        <div className="mx-auto mt-4 max-w-3xl space-y-1 text-xs text-[#000000a6] leading-relaxed">
          <p className="font-bold text-[#333333]">{copy.companyName}</p>
          <p>{copy.companyAddress}</p>
          <p>{copy.companyHotline}</p>
          <p>{copy.companyDirector}</p>
          <p>{copy.companyTax}</p>
          <p className="pt-1 text-[#888888]">© 2026 - Bản quyền thuộc về Công ty TNHH eMall</p>
        </div>
      </div>
    </footer>
  );
}
