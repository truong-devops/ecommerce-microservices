'use client';

import { useState } from 'react';

interface SidebarSection {
  title: string;
  items: string[];
}

const sections: SidebarSection[] = [
  {
    title: 'Quản Lý Đơn Hàng',
    items: ['Tất cả', 'Giao Hàng Loạt', 'Bàn Giao Đơn Hàng', 'Đơn Trả hàng/Hoàn tiền hoặc Đơn hủy', 'Cài Đặt Vận Chuyển']
  },
  {
    title: 'Quản Lý Sản Phẩm',
    items: ['Tất Cả Sản Phẩm', 'Thêm Sản Phẩm', 'Công cụ Tối ưu AI']
  },
  {
    title: 'Kênh Marketing',
    items: [
      'Kênh Marketing',
      'Đấu Giá Rẻ Vô Địch',
      'Dịch Vụ Hiển Thị Shopee',
      'Tăng Đơn Cùng KOL',
      'Live & Video',
      'Khuyến Mãi của Shop',
      'Flash Sale Của Shop',
      'Mã Giảm Giá Của Shop',
      'Chương Trình Shopee'
    ]
  },
  {
    title: 'Chăm sóc khách hàng',
    items: ['Quản lý Chat', 'Quản lý Đánh Giá']
  },
  {
    title: 'Tài Chính',
    items: ['Doanh Thu', 'Số dư TK Shopee', 'Tài Khoản Ngân Hàng']
  },
  {
    title: 'Dữ Liệu',
    items: ['Phân Tích Bán Hàng', 'Hiệu Quả Hoạt Động']
  },
  {
    title: 'Quản Lý Shop',
    items: ['Hồ Sơ Shop', 'Trang Trí Shop', 'Thiết Lập Shop', 'Quản lý các khiếu nại', 'Nhiệm Vụ Người Bán']
  }
];

export function SellerSidebar() {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'Quản Lý Đơn Hàng': true,
    'Quản Lý Sản Phẩm': false,
    'Kênh Marketing': false,
    'Chăm sóc khách hàng': false,
    'Tài Chính': false,
    'Dữ Liệu': false,
    'Quản Lý Shop': false
  });

  const toggleSection = (title: string) => {
    setExpandedSections((previous) => ({
      ...previous,
      [title]: !previous[title]
    }));
  };

  return (
    <aside className="hidden w-[232px] shrink-0 border-r border-slate-200 bg-[#f5f5f5] lg:block">
      <div className="sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-3">
            {section.items.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  toggleSection(section.title);
                }}
                className="flex w-full items-start justify-between rounded-md px-2 py-1 text-left text-[13px] font-semibold leading-5 text-slate-600 hover:bg-white"
              >
                <span>{section.title}</span>
                <span className="pt-0.5 text-xs text-slate-500">{expandedSections[section.title] ? '▴' : '▾'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-[13px] font-semibold text-slate-600 hover:bg-white"
              >
                {section.title}
              </button>
            )}

            {section.items.length > 0 && expandedSections[section.title] ? (
              <ul className="ml-2 mt-1 space-y-0.5">
                {section.items.map((item) => {
                  return (
                    <li key={item}>
                      <button
                        type="button"
                        className="w-full rounded-md border border-transparent px-3 py-1.5 text-left text-sm text-slate-700 hover:border-slate-200 hover:bg-white"
                      >
                        {item}
                      </button>
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
