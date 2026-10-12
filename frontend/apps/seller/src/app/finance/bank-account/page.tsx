'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { FinanceAlert, FinancePageShell } from '@/components/finance/finance-page-shell';
import { SellerApiClientError } from '@/lib/api/client';
import type { SellerBankAccount } from '@/lib/api/types';
import { getSellerBankAccount, updateSellerBankAccount } from '@/lib/api/wallet';
import { bankDisplayName, bankStatus, formatDateTime } from '@/lib/finance-format';

const bankOptions = [
  ['VCB', 'Vietcombank'],
  ['TCB', 'Techcombank'],
  ['MB', 'MB Bank'],
  ['ACB', 'ACB'],
  ['BIDV', 'BIDV'],
  ['VTB', 'VietinBank'],
  ['VPB', 'VPBank'],
  ['TPB', 'TPBank'],
  ['STB', 'Sacombank'],
  ['VIB', 'VIB'],
  ['MSB', 'MSB'],
  ['OCB', 'OCB'],
  ['SHB', 'SHB']
] as const;

interface BankForm {
  bankCode: string;
  accountNumber: string;
  accountHolderName: string;
}
const emptyForm: BankForm = { bankCode: '', accountNumber: '', accountHolderName: '' };

export default function FinanceBankAccountPage() {
  return (
    <FinancePageShell current="Tài khoản ngân hàng" parent={{ label: 'Số dư eMall', href: '/finance/balance' }}>
      {({ accessToken }) => <BankAccountContent accessToken={accessToken} />}
    </FinancePageShell>
  );
}

function BankAccountContent({ accessToken }: { accessToken: string }) {
  const [account, setAccount] = useState<SellerBankAccount | null>(null);
  const [form, setForm] = useState<BankForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setAccount(await getSellerBankAccount(accessToken));
    } catch (loadError) {
      if (loadError instanceof SellerApiClientError && loadError.code === 'BANK_ACCOUNT_NOT_FOUND') setAccount(null);
      else setError(toMessage(loadError, 'Không thể tải tài khoản ngân hàng.'));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const openDialog = () => {
    setForm({ bankCode: account?.bankCode ?? '', accountNumber: '', accountHolderName: account?.accountHolderName ?? '' });
    setError('');
    setMessage('');
    setDialogOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const bankCode = form.bankCode.trim().toUpperCase();
    const accountNumber = form.accountNumber.replace(/\s+/g, '');
    const accountHolderName = form.accountHolderName.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!/^[A-Z0-9_-]{2,32}$/.test(bankCode)) {
      setError('Vui lòng chọn ngân hàng nhận tiền.');
      return;
    }
    if (!/^\d{6,20}$/.test(accountNumber)) {
      setError('Số tài khoản phải gồm 6–20 chữ số.');
      return;
    }
    if (accountHolderName.length < 2) {
      setError('Vui lòng nhập đúng tên chủ tài khoản.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updated = await updateSellerBankAccount(accessToken, { bankCode, accountNumber, accountHolderName });
      const wasUpdate = Boolean(account);
      setAccount(updated);
      setForm(emptyForm);
      setDialogOpen(false);
      setMessage(wasUpdate ? 'Đã cập nhật tài khoản nhận tiền.' : 'Đã thêm tài khoản nhận tiền.');
    } catch (saveError) {
      setError(toMessage(saveError, 'Không thể lưu tài khoản ngân hàng.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 text-sm lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ee4d2d]">Thiết lập thanh toán</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Tài khoản ngân hàng</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Đây là tài khoản duy nhất nhận tiền rút từ số dư eMall. Số tài khoản được mã hóa và không hiển thị lại đầy đủ.
          </p>
        </div>
        <button
          type="button"
          onClick={openDialog}
          disabled={loading}
          className="rounded-md bg-[#ee4d2d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#db4729] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {account ? 'Cập nhật tài khoản' : 'Thêm tài khoản'}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {error && !dialogOpen ? (
          <FinanceAlert tone="error">
            {error}{' '}
            <button type="button" onClick={() => void loadAccount()} className="ml-2 font-semibold underline">
              Thử lại
            </button>
          </FinanceAlert>
        ) : null}
        {message ? <FinanceAlert tone="success">{message}</FinanceAlert> : null}
      </div>

      {loading ? (
        <div className="mt-5 grid animate-pulse gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <div className="h-56 rounded-xl bg-slate-100" />
          <div className="h-56 rounded-xl bg-slate-100" />
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          {account ? <BankCard account={account} /> : <EmptyBankCard onAdd={openDialog} />}
          <SecurityPanel account={account} />
        </div>
      )}

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !saving) setDialogOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-dialog-title"
            className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="bank-dialog-title" className="text-lg font-semibold text-slate-900">
                  {account ? 'Cập nhật tài khoản' : 'Thêm tài khoản nhận tiền'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">Tên chủ tài khoản nên trùng với thông tin tại ngân hàng.</p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
                className="rounded-md p-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4 p-5">
              {error ? <FinanceAlert tone="error">{error}</FinanceAlert> : null}
              <label className="block text-sm font-medium text-slate-700">
                Ngân hàng
                <select
                  value={form.bankCode}
                  onChange={(event) => setForm((old) => ({ ...old, bankCode: event.target.value }))}
                  required
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#ee4d2d]"
                >
                  <option value="">Chọn ngân hàng</option>
                  {bankOptions.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name} ({code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Số tài khoản
                <input
                  value={form.accountNumber}
                  onChange={(event) => setForm((old) => ({ ...old, accountNumber: event.target.value.replace(/\D/g, '').slice(0, 20) }))}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Nhập 6–20 chữ số"
                  required
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#ee4d2d]"
                />
                {account ? (
                  <span className="mt-1.5 block text-xs text-slate-500">Vì lý do bảo mật, hãy nhập lại toàn bộ số tài khoản khi cập nhật.</span>
                ) : null}
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Tên chủ tài khoản
                <input
                  value={form.accountHolderName}
                  onChange={(event) => setForm((old) => ({ ...old, accountHolderName: event.target.value.toUpperCase().slice(0, 255) }))}
                  autoComplete="name"
                  placeholder="NGUYEN VAN A"
                  required
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm uppercase outline-none focus:border-[#ee4d2d]"
                />
              </label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setDialogOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-[#ee4d2d] px-5 py-2 text-sm font-semibold text-white hover:bg-[#db4729] disabled:opacity-60"
                >
                  {saving ? 'Đang lưu...' : 'Lưu tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BankCard({ account }: { account: SellerBankAccount }) {
  const status = bankStatus(account.status);
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 px-5 py-5 text-white">
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full border border-white/10" />
        <div className="absolute right-10 top-12 h-20 w-20 rounded-full bg-white/5" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Tài khoản nhận tiền</p>
            <p className="mt-1 text-2xl font-semibold tracking-wide">{bankDisplayName(account.bankCode)}</p>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">{account.bankCode}</span>
        </div>
        <p className="relative mt-8 text-2xl font-medium tracking-[0.22em]">{account.maskedAccountNumber.replace('****', '•••• ')}</p>
      </div>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Chủ tài khoản</p>
            <p className="mt-1 font-semibold tracking-wide text-slate-800">{account.accountHolderName}</p>
          </div>
          <div className="text-right">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
            {account.isDefault ? <p className="mt-2 text-xs text-slate-500">Tài khoản mặc định</p> : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyBankCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex min-h-[230px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-6 text-center transition hover:border-[#ee4d2d] hover:bg-[#fff8f5]"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-2xl text-[#ee4d2d] shadow-sm">+</span>
      <span className="mt-3 font-semibold text-slate-800">Thêm tài khoản ngân hàng</span>
      <span className="mt-1 text-xs leading-5 text-slate-500">Bạn cần tài khoản nhận tiền trước khi gửi yêu cầu rút.</span>
    </button>
  );
}

function SecurityPanel({ account }: { account: SellerBankAccount | null }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
            <path d="M12 3 5 6v5c0 4.7 2.7 8.2 7 10 4.3-1.8 7-5.3 7-10V6l-7-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">Bảo mật thông tin nhận tiền</h2>
          <p className="text-xs text-slate-500">eMall không hiển thị lại số tài khoản đầy đủ.</p>
        </div>
      </div>
      <ul className="mt-4 space-y-3 text-sm leading-5 text-slate-600">
        <li className="flex gap-2">
          <span className="text-emerald-600">✓</span>
          <span>Số tài khoản được mã hóa trước khi lưu.</span>
        </li>
        <li className="flex gap-2">
          <span className="text-emerald-600">✓</span>
          <span>Mỗi shop chỉ có một tài khoản mặc định trong phiên bản hiện tại.</span>
        </li>
        <li className="flex gap-2">
          <span className="text-emerald-600">✓</span>
          <span>Yêu cầu rút đã tạo vẫn dùng bản chụp tài khoản tại thời điểm gửi.</span>
        </li>
      </ul>
      {account ? (
        <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">Cập nhật gần nhất: {formatDateTime(account.updatedAt)}</p>
      ) : (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          Chưa có tài khoản nhận tiền. Tính năng rút tiền đang bị khóa.
        </p>
      )}
    </article>
  );
}

function toMessage(error: unknown, fallback: string): string {
  return error instanceof SellerApiClientError ? error.message : fallback;
}
