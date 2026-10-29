'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

interface SidebarItem {
  label: string;
  href?: string;
}

interface SidebarSection {
  title: string;
  icon: ReactNode;
  items: SidebarItem[];
}

const sections: SidebarSection[] = [
  {
    title: 'Quản Lý Đơn Hàng',
    icon: (
      <svg className="h-4 w-4 shrink-0 text-[#757575]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    items: [
      { label: 'Tất cả đơn hàng', href: '/orders/all' },
      { label: 'Giao Hàng Loạt', href: '/orders/bulk-shipping' },
      { label: 'Bàn Giao Đơn Hàng', href: '/orders/handover' },
      { label: 'Trả Hàng / Hoàn Tiền', href: '/orders/returns' },
      { label: 'Cài Đặt Vận Chuyển', href: '/orders/shipping-settings' }
    ]
  },
  {
    title: 'Quản Lý Sản Phẩm',
    icon: (
      <svg className="h-4 w-4 shrink-0 text-[#757575]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    items: [
      { label: 'Tất Cả Sản Phẩm', href: '/products/all' },
      { label: 'Thêm Sản Phẩm Mới', href: '/products/new' },
      { label: 'Công Cụ Tối Ưu AI', href: '/products/ai-tools' }
    ]
  },
  {
    title: 'Kênh Marketing',
    icon: (
      <svg className="h-4 w-4 shrink-0 text-[#757575]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
    items: [
      { label: 'Video Shop', href: '/marketing/videos' },
      { label: 'Live & Video', href: '/marketing/live-video' },
      { label: 'Khuyến Mãi của Shop' },
      { label: 'Flash Sale Của Shop' },
      { label: 'Mã Giảm Giá Của Shop' }
    ]
  },
  {
    title: 'Chăm Sóc Khách Hàng',
    icon: (
      <svg className="h-4 w-4 shrink-0 text-[#757575]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
    items: [
      { label: 'Quản Lý Chat', href: '/customer-care/chat' },
      { label: 'Quản Lý Đánh Giá', href: '/customer-care/reviews' }
    ]
  },
  {
    title: 'Tài Chính',
    icon: (
      <svg className="h-4 w-4 shrink-0 text-[#757575]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    items: [
      { label: 'Doanh Thu', href: '/finance/revenue' },
      { label: 'Số Dư eMall', href: '/finance/balance' },
      { label: 'Tài Khoản Ngân Hàng', href: '/finance/bank-account' }
    ]
  },
  {
    title: 'Dữ Liệu',
    icon: (
      <svg className="h-4 w-4 shrink-0 text-[#757575]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    items: [
      { label: 'Phân Tích Bán Hàng', href: '/data/sales-analytics' }
    ]
  },
  {
    title: 'Quản Lý Shop',
    icon: (
      <svg className="h-4 w-4 shrink-0 text-[#757575]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    items: [
      { label: 'Hồ Sơ Shop', href: '/shop/profile' },
      { label: 'Trang Trí Shop', href: '/shop/decor' }
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
      <div className="sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.title} className="mb-1">
            {section.items.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  toggleSection(section.title);
                }}
                className="flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-[13px] font-semibold text-[#333333] hover:text-[#ee4d2d] hover:bg-[#fafafa] transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {section.icon}
                  <span className="truncate">{section.title}</span>
                </div>
                <span className="text-[10px] text-[#999999]">{expandedSections[section.title] ? '▲' : '▼'}</span>
              </button>
            ) : (
              <button type="button" className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] font-semibold text-[#333333] hover:text-[#ee4d2d]">
                {section.icon}
                <span className="truncate">{section.title}</span>
              </button>
            )}

            {section.items.length > 0 && expandedSections[section.title] ? (
              <ul className="mt-0.5 space-y-0.5 pl-6">
                {section.items.map((item) => {
                  const isActive = isItemActive(pathname, item.href);
                  const itemClassName = [
                    'block w-full border-l-[3px] px-3 py-1.5 text-left text-[13px] transition rounded-r',
                    isActive
                      ? 'border-[#ee4d2d] bg-[#fef6f5] font-semibold text-[#ee4d2d]'
                      : 'border-transparent text-[#555555] hover:bg-[#fafafa] hover:text-[#ee4d2d]'
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
