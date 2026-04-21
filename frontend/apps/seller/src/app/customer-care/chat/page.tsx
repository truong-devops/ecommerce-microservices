'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

const quickAssistCards = [
  {
    title: 'Tin nhắn tự động',
    description: 'Tự động gửi lời chào khi người mua bắt đầu cuộc trò chuyện.',
    actionLabel: 'Bắt đầu',
    icon: '↩'
  },
  {
    title: 'Tin nhắn nhanh',
    description: 'Giúp bộ phận chăm sóc khách hàng phản hồi nhanh hơn thông qua mẫu tin nhắn có sẵn.',
    actionLabel: 'Chỉnh sửa',
    icon: '≡'
  },
  {
    title: 'Hỏi - Đáp',
    description: 'Tự động gửi thẻ Câu hỏi thường gặp khi người mua bắt đầu trò chuyện để giúp trả lời các câu hỏi thường gặp.',
    actionLabel: 'Bắt đầu',
    icon: '?'
  }
];

const learnColumns = [
  ['Tính năng Shopee Chat là gì?', 'Tin nhắn tự động là gì?'],
  ['Cách cải thiện Tỷ lệ phản hồi trò chuyện', 'Tin nhắn nhanh là gì?'],
  ['Tính năng Hỏi - Đáp là gì?', 'Vi phạm Quy định Chat tại Shopee là gì?']
];

export default function CustomerCareChatPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-md rounded-md border border-slate-200 bg-white p-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-500">eMall Seller</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Bạn chưa đăng nhập</h1>
          <p className="mt-2 text-sm text-slate-600">Đăng nhập để truy cập Seller Center.</p>

          <Link
            href="/login"
            className="mt-5 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
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
            <span className="font-medium text-slate-700">Quản lý Chat</span>
          </div>

          <section className="space-y-3 text-sm">
            <article className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-sm font-semibold text-slate-900">
                  Quản lý Chat <span className="ml-2 font-normal text-slate-400">(Hiệu quả Chat)</span>
                </h1>
                <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                  Xem thêm ›
                </button>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <StatItem title="Lượt chat" value="0" suffix="0,00%" />
                <StatItem title="Chat Response Rate" value="-" suffix="-" bordered />
                <StatItem title="Thời gian phản hồi" value="00:00:00" suffix="0,00%" bordered />
              </div>
            </article>

            <article className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Trợ lý Chat</h2>

              <div className="mt-3 grid gap-3 xl:grid-cols-3">
                {quickAssistCards.map((card) => (
                  <section key={card.title} className="rounded-md border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ee4d2d] text-base text-white">
                        {card.icon}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-800">
                          {card.title}
                          <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">
                            ?
                          </span>
                        </h3>
                        <p className="mt-1 text-sm leading-5 text-slate-500">{card.description}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="rounded-md border border-[#ee4d2d] px-4 py-1.5 text-sm font-semibold text-[#ee4d2d] hover:bg-[#fff5f2]"
                      >
                        {card.actionLabel}
                      </button>
                    </div>
                  </section>
                ))}
              </div>
            </article>

            <article className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Tìm hiểu về Chat</h2>
                <button type="button" className="text-sm font-medium text-[#2563eb] hover:underline">
                  Xem thêm ›
                </button>
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-3 lg:gap-6">
                {learnColumns.map((column, index) => (
                  <ul key={index} className="space-y-2 text-sm text-slate-700">
                    {column.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1 text-slate-600">•</span>
                        <button type="button" className="text-left hover:text-[#ee4d2d]">
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}

function StatItem({
  title,
  value,
  suffix,
  bordered
}: {
  title: string;
  value: string;
  suffix: string;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? 'border-l border-slate-200 pl-4 lg:pl-6' : ''}>
      <p className="text-sm text-slate-700">
        {title}
        <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">?</span>
      </p>
      <p className="mt-2 text-2xl font-semibold leading-none text-slate-800">{value}</p>
      <p className="mt-2 text-sm text-slate-400">
        so với 30 ngày trước đó <span className="ml-1 text-slate-500">{suffix}</span>
      </p>
    </div>
  );
}
