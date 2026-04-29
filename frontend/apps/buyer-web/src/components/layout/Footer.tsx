'use client';

import Link from 'next/link';
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

const paymentMethods = ['VISA', 'Master', 'JCB', 'AMEX', 'SPay', 'COD', 'VNPay', 'MoMo'];
const shippingUnits = ['SPX', 'GHN', 'Viettel Post', 'VNPost', 'J&T', 'Ninja Van', 'Best'];
const socialNetworks = ['Facebook', 'Instagram', 'LinkedIn'];
const appStores = ['App Store', 'Google Play', 'AppGallery'];

const footerCopy: Record<'vi' | 'en', FooterCopy> = {
  vi: {
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
    copyright: '(c) 2026 E-Mall. Tất cả quyền được bảo lưu.',
    regionLabel: 'Quốc gia và Khu vực:',
    regions: ['Viet Nam', 'Singapore', 'Indonesia', 'Thailand', 'Malaysia', 'Philippines', 'Brazil', 'Mexico'],
    legalLinks: ['CHÍNH SÁCH BẢO MẬT', 'QUY CHẾ HOẠT ĐỘNG', 'CHÍNH SÁCH VẬN CHUYỂN', 'CHÍNH SÁCH TRẢ HÀNG VÀ HOÀN TIỀN'],
    companyName: 'Công ty TNHH E-Mall',
    companyAddress: 'Địa chỉ: Tầng 4-5-6, Tòa nhà Capital Place, số 29 đường Liễu Giai, Phường Ngọc Hà, Thành phố Hà Nội, Việt Nam',
    companyHotline: 'Chăm sóc khách hàng: Gọi tổng đài miễn phí hoặc trò chuyện với E-Mall ngay trên Trung tâm trợ giúp',
    companyDirector: 'Chịu trách nhiệm quản lý nội dung: Nguyễn Văn A',
    companyTax: 'Mã số doanh nghiệp: 0106773786 do Sở Kế hoạch và Đầu tư TP Hà Nội cấp lần đầu ngày 10/02/2015'
  },
  en: {
    customerServiceTitle: 'CUSTOMER SERVICE',
    customerServiceLinks: ['Help Center', 'Buying Guide', 'Selling Guide', 'Payment', 'Shipping', 'Returns & Refunds', 'Warranty Policy'],
    aboutTitle: 'E-MALL VIET NAM',
    aboutLinks: ['About Us', 'Careers', 'Terms of Service', 'Privacy Policy', 'Seller Centre', 'Media Contact'],
    paymentTitle: 'PAYMENT',
    shippingTitle: 'SHIPPING PARTNERS',
    followTitle: 'FOLLOW E-MALL',
    downloadTitle: 'DOWNLOAD E-MALL APP',
    copyright: '(c) 2026 E-Mall. All rights reserved.',
    regionLabel: 'Country & Region:',
    regions: ['Viet Nam', 'Singapore', 'Indonesia', 'Thailand', 'Malaysia', 'Philippines', 'Brazil', 'Mexico'],
    legalLinks: ['PRIVACY POLICY', 'OPERATION REGULATION', 'SHIPPING POLICY', 'RETURN & REFUND POLICY'],
    companyName: 'E-Mall Company Limited',
    companyAddress: 'Address: Floors 4-5-6, Capital Place Tower, 29 Lieu Giai Street, Ngoc Ha Ward, Ha Noi, Viet Nam',
    companyHotline: 'Customer care: Toll-free hotline or chat with E-Mall directly in Help Center',
    companyDirector: 'Content management representative: Nguyen Van A',
    companyTax: 'Enterprise registration no: 0106773786 issued by Hanoi DPI on 10/02/2015'
  }
};

function LogoBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-8 min-w-[72px] items-center justify-center rounded-sm border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700">
      {label}
    </span>
  );
}

export function Footer() {
  const { locale } = useLanguage();
  const copy = footerCopy[locale];

  return (
    <footer className="border-t border-slate-200 bg-[#f5f5f5] text-slate-700">
      <div className="border-b border-slate-200 bg-[#fafafa]">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-3 py-10 md:grid-cols-2 md:px-4 lg:grid-cols-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{copy.customerServiceTitle}</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {copy.customerServiceLinks.map((item) => (
                <li key={item}>
                  <a className="transition hover:text-brand-600" href="#">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900">{copy.aboutTitle}</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {copy.aboutLinks.map((item) => (
                <li key={item}>
                  <a className="transition hover:text-brand-600" href="#">
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-bold text-slate-900">{copy.paymentTitle}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {paymentMethods.map((method) => (
                  <LogoBadge key={method} label={method} />
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-bold text-slate-900">{copy.shippingTitle}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {shippingUnits.map((unit) => (
                  <LogoBadge key={unit} label={unit} />
                ))}
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900">{copy.followTitle}</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {socialNetworks.map((network) => (
                <li key={network}>
                  <a className="inline-flex items-center gap-2 transition hover:text-brand-600" href="#">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold">
                      {network[0]}
                    </span>
                    {network}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-bold text-slate-900">{copy.downloadTitle}</h2>
            <div className="mt-4 flex items-center gap-3">
              <div className="grid h-24 w-24 place-items-center rounded-sm border border-slate-200 bg-white">
                <div className="h-16 w-16 rounded-[2px] bg-[radial-gradient(circle,_#111_21%,_transparent_22%)] bg-[length:8px_8px]" />
              </div>
              <div className="space-y-2">
                {appStores.map((store) => (
                  <Link
                    key={store}
                    href="#"
                    className="block rounded-sm border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-500 hover:text-brand-600"
                  >
                    {store}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-[#fafafa]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-3 py-6 text-sm text-slate-500 md:flex-row md:items-center md:justify-between md:px-4">
          <p>{copy.copyright}</p>
          <p>
            {copy.regionLabel} {copy.regions.join(' | ')}
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-3 py-8 text-center md:px-4">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
          {copy.legalLinks.map((link) => (
            <a key={link} href="#" className="transition hover:text-brand-600">
              {link}
            </a>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex h-10 min-w-[120px] items-center justify-center rounded-sm border border-red-300 bg-white px-3 text-xs font-bold text-red-500">
            ĐÃ ĐĂNG KÝ
          </span>
          <span className="inline-flex h-10 min-w-[120px] items-center justify-center rounded-sm border border-red-300 bg-white px-3 text-xs font-bold text-red-500">
            BỘ CÔNG THƯƠNG
          </span>
          <span className="inline-flex h-10 min-w-[42px] items-center justify-center rounded-full border border-red-300 bg-white text-xs font-bold text-red-500">
            V
          </span>
        </div>

        <div className="mt-5 space-y-1 text-sm text-slate-500">
          <p>{copy.companyName}</p>
          <p>{copy.companyAddress}</p>
          <p>{copy.companyHotline}</p>
          <p>{copy.companyDirector}</p>
          <p>{copy.companyTax}</p>
        </div>
      </div>
    </footer>
  );
}
