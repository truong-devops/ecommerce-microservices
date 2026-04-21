'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { SellerSidebar } from '@/components/layout/seller-sidebar';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { useAuth } from '@/providers/AppProvider';

type HandoverMode = 'pickup' | 'dropoff';
type HandoverStatus = 'waiting' | 'done';

const PICKUP_WAITING_COLUMNS = ['Ngày Lấy hàng', 'Đơn vị vận chuyển', 'Đơn lấy dự kiến', 'Lấy hàng thành công', 'Số đơn chờ lấy hàng'];
const PICKUP_DONE_COLUMNS = ['Ngày Lấy hàng', 'Đơn vị vận chuyển', 'Lấy hàng thành công', 'Thao tác'];
const DROPOFF_WAITING_COLUMNS = ['Đơn vị vận chuyển', 'Điểm gửi hàng gần nhất', 'Số đơn cần gửi bưu cục'];
const DROPOFF_DONE_COLUMNS = ['Ngày gửi hàng tại bưu cục', 'Đơn vị vận chuyển', 'Gửi hàng tại bưu cục thành công', 'Thao tác'];

export default function OrderHandoverPage() {
  const router = useRouter();
  const { ready, user, logout } = useAuth();
  const [mode, setMode] = useState<HandoverMode>('pickup');
  const [status, setStatus] = useState<HandoverStatus>('waiting');

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  const tableColumns = useMemo(() => {
    if (mode === 'pickup') {
      return status === 'done' ? PICKUP_DONE_COLUMNS : PICKUP_WAITING_COLUMNS;
    }

    return status === 'done' ? DROPOFF_DONE_COLUMNS : DROPOFF_WAITING_COLUMNS;
  }, [mode, status]);
  const waitingTabLabel = mode === 'pickup' ? 'Chờ lấy hàng' : 'Chờ gửi hàng tại bưu cục';
  const doneTabLabel = mode === 'pickup' ? 'Đã Lấy hàng' : 'Đã Gửi hàng tại bưu cục';
  const activeMainTabClass = 'border-b-[3px] border-[#ee4d2d] pb-2 text-[#ee4d2d]';
  const inactiveMainTabClass = 'pb-2 text-slate-700';
  const isPickupDoneTab = mode === 'pickup' && status === 'done';
  const isDropoffDoneTab = mode === 'dropoff' && status === 'done';

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
            <span className="font-medium text-slate-700">Bàn Giao Đơn Hàng</span>
          </div>

          <section className="rounded-md border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-end gap-6 border-b border-slate-200 pb-2 text-sm font-semibold">
              <button
                type="button"
                onClick={() => {
                  setMode('pickup');
                  setStatus('waiting');
                }}
                className={mode === 'pickup' ? activeMainTabClass : inactiveMainTabClass}
              >
                Lấy hàng
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('dropoff');
                  setStatus('waiting');
                }}
                className={mode === 'dropoff' ? activeMainTabClass : inactiveMainTabClass}
              >
                Gửi hàng tại bưu cục
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-0">
              <button
                type="button"
                onClick={() => {
                  setStatus('waiting');
                }}
                className={[
                  'rounded-t-md border px-4 py-2 text-sm',
                  status === 'waiting'
                    ? 'border-slate-300 border-b-white bg-white font-semibold text-[#ee4d2d]'
                    : 'border-slate-300 bg-[#fafafa] font-medium text-slate-700'
                ].join(' ')}
              >
                {waitingTabLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus('done');
                }}
                className={[
                  'rounded-t-md border px-4 py-2 text-sm',
                  status === 'done'
                    ? 'border-slate-300 border-b-white bg-white font-semibold text-[#ee4d2d]'
                    : 'border-slate-300 bg-[#fafafa] font-medium text-slate-700'
                ].join(' ')}
              >
                {doneTabLabel}
              </button>
            </div>

            {isPickupDoneTab ? (
              <p className="mt-6 text-sm font-medium text-slate-700">Các đợt lấy hàng trong 3 ngày gần nhất</p>
            ) : null}
            {isDropoffDoneTab ? (
              <p className="mt-6 text-sm font-medium text-slate-700">Các đợt gửi hàng tại bưu cục trong 3 ngày gần nhất</p>
            ) : null}

            <div className={`${isPickupDoneTab || isDropoffDoneTab ? 'mt-4' : 'mt-6'} overflow-hidden rounded-md border border-slate-200`}>
              <div className="overflow-x-auto">
                <table className="min-w-[820px] w-full border-collapse text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-sm font-medium text-slate-500">
                    <tr>
                      {tableColumns.map((column) => (
                        <th key={column} className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-1">
                            <span>{column}</span>
                            {showHelpIcon(mode, status, column) && (
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-400">
                                ?
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={tableColumns.length} className="h-[360px] px-4 py-10 text-center">
                        <div className="mx-auto flex w-fit flex-col items-center">
                          <EmptyClipboardIcon />
                          <p className="mt-3 text-sm text-slate-400">Không tìm thấy đơn hàng</p>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function EmptyClipboardIcon() {
  return (
    <svg width="82" height="94" viewBox="0 0 82 94" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="41" cy="88" rx="28" ry="6" fill="#f1f5f9" />
      <rect x="20" y="14" width="42" height="66" rx="3" fill="#f8fafc" stroke="#cbd5e1" />
      <path d="M31 13C31 10.7909 32.7909 9 35 9H47C49.2091 9 51 10.7909 51 13V18H31V13Z" fill="#f8fafc" stroke="#cbd5e1" />
      <path d="M29 35H53" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
      <path d="M29 44H53" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
      <path d="M29 53H45" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
      <circle cx="70" cy="20" r="3" fill="#e2e8f0" />
      <circle cx="76" cy="30" r="2" fill="#e2e8f0" />
    </svg>
  );
}

function showHelpIcon(mode: HandoverMode, status: HandoverStatus, column: string): boolean {
  if (mode !== 'pickup') {
    return false;
  }

  if (status === 'done') {
    return column === 'Lấy hàng thành công';
  }

  return column === 'Đơn lấy dự kiến' || column === 'Lấy hàng thành công' || column === 'Số đơn chờ lấy hàng';
}
