'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SidebarItem {
  label: string;
  href?: string;
}

interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

const sections: SidebarSection[] = [
  {
    title: 'Quản Lý Đơn Hàng',
    items: [
      { label: 'Tất cả', href: '/orders/all' },
      { label: 'Giao Hàng Loạt', href: '/orders/bulk-shipping' },
      { label: 'Bàn Giao Đơn Hàng', href: '/orders/handover' },
      { label: 'Đơn Trả hàng/Hoàn tiền hoặc Đơn hủy', href: '/orders/returns' },
      { label: 'Cài Đặt Vận Chuyển', href: '/orders/shipping-settings' }
    ]
  },
  {
    title: 'Quản Lý Sản Phẩm',
    items: [
      { label: 'Tất Cả Sản Phẩm', href: '/products/all' },
      { label: 'Thêm Sản Phẩm', href: '/products/new' },
      { label: 'Công cụ Tối ưu AI', href: '/products/ai-tools' }
    ]
  },
  {
    title: 'Kênh Marketing',
    items: [
      { label: 'Kênh Marketing' },
      { label: 'Đấu Giá Rẻ Vô Địch' },
      { label: 'Dịch Vụ Hiển Thị Shopee' },
      { label: 'Tăng Đơn Cùng KOL' },
      { label: 'Video Shop', href: '/marketing/videos' },
      { label: 'Live & Video', href: '/marketing/live-video' },
      { label: 'Khuyến Mãi của Shop' },
      { label: 'Flash Sale Của Shop' },
      { label: 'Mã Giảm Giá Của Shop' },
      { label: 'Chương Trình Shopee' }
    ]
  },
  {
    title: 'Chăm sóc khách hàng',
    items: [
      { label: 'Quản lý Chat', href: '/customer-care/chat' },
      { label: 'Quản lý Đánh Giá', href: '/customer-care/reviews' }
    ]
  },
  {
    title: 'Tài Chính',
    items: [
      { label: 'Doanh Thu', href: '/finance/revenue' },
      { label: 'Số dư eMall', href: '/finance/balance' },
      { label: 'Tài Khoản Ngân Hàng', href: '/finance/bank-account' }
    ]
  },
  {
    title: 'Dữ Liệu',
    items: [{ label: 'Phân Tích Bán Hàng', href: '/data/sales-analytics' }, { label: 'Hiệu Quả Hoạt Động' }]
  },
  {
    title: 'Quản Lý Shop',
    items: [
      { label: 'Hồ Sơ Shop', href: '/shop/profile' },
      { label: 'Trang Trí Shop', href: '/shop/decor' },
      { label: 'Thiết Lập Shop' },
      { label: 'Quản lý các khiếu nại' },
      { label: 'Nhiệm Vụ Người Bán' }
    ]
  }
];

export function SellerSidebar() {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => getInitialExpandedSections(pathname));

  useEffect(() => {
    const activeSectionTitle = getActiveSectionTitle(pathname);
    if (!activeSectionTitle) {
      return;
    }

    setExpandedSections((previous) => {
      if (previous[activeSectionTitle]) {
        return previous;
      }

      return {
        ...previous,
        [activeSectionTitle]: true
      };
    });
  }, [pathname]);

  const toggleSection = (title: string) => {
    setExpandedSections((previous) => ({
      ...previous,
      [title]: !previous[title]
    }));
  };

  return (
    <aside className="hidden w-[232px] shrink-0 border-r border-[#e8e8e8] bg-white lg:block">
      <div className="sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto px-2 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-3">
            {section.items.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  toggleSection(section.title);
                }}
                className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#757575] hover:text-[#ee4d2d] transition"
              >
                <span>{section.title}</span>
                <span className="text-[10px] text-[#999999]">{expandedSections[section.title] ? '▲' : '▼'}</span>
              </button>
            ) : (
              <button type="button" className="w-full rounded px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-[#757575] hover:text-[#ee4d2d]">
                {section.title}
              </button>
            )}

            {section.items.length > 0 && expandedSections[section.title] ? (
              <ul className="mt-0.5 space-y-0.5">
                {section.items.map((item) => {
                  const isActive = isItemActive(pathname, item.href);
                  const itemClassName = [
                    'block w-full border-l-[3px] px-3 py-1.5 text-left text-xs transition rounded-r',
                    isActive
                      ? 'border-[#ee4d2d] bg-[#fef6f5] font-semibold text-[#ee4d2d]'
                      : 'border-transparent text-[#333333] hover:bg-[#fafafa] hover:text-[#ee4d2d]'
                  ].join(' ');

                  return (
                    <li key={item.label}>
                      {item.href ? (
                        <Link href={item.href} aria-current={isActive ? 'page' : undefined} className={itemClassName}>
                          {item.label}
                        </Link>
                      ) : (
                        <button type="button" className={itemClassName}>
                          {item.label}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </aside>
  );
}

function isItemActive(pathname: string, href?: string): boolean {
  if (!href) {
    return false;
  }

  if (href === '/') {
    return pathname === '/';
  }

  return pathname.startsWith(href);
}

function getInitialExpandedSections(pathname: string): Record<string, boolean> {
  const initialState = Object.fromEntries(sections.map((section) => [section.title, false])) as Record<string, boolean>;
  const activeSectionTitle = getActiveSectionTitle(pathname);

  if (activeSectionTitle) {
    initialState[activeSectionTitle] = true;
  } else {
    initialState['Quản Lý Đơn Hàng'] = true;
  }

  return initialState;
}

function getActiveSectionTitle(pathname: string): string | null {
  for (const section of sections) {
    if (section.items.some((item) => isItemActive(pathname, item.href))) {
      return section.title;
    }
  }

  return null;
}
