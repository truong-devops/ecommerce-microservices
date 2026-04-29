import type { ModerationProduct, ModerationProductStatus } from '@/lib/api/types';

interface ProductModerationBoardProps {
  items: ModerationProduct[];
  loading: boolean;
  onUpdateStatus: (productId: string, status: ModerationProductStatus) => void;
}

const PRODUCT_ASSET_BASE_URL = process.env.NEXT_PUBLIC_PRODUCT_ASSET_BASE_URL ?? 'http://localhost:3003/api/v1/products/assets';

export function ProductModerationBoard({ items, loading, onUpdateStatus }: ProductModerationBoardProps) {
  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        Loading moderation queue...
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        Không có sản phẩm phù hợp bộ lọc.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-3 py-3 font-semibold">Product</th>
              <th className="px-3 py-3 font-semibold">Seller</th>
              <th className="px-3 py-3 font-semibold">Category</th>
              <th className="px-3 py-3 font-semibold">Min Price</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const imageUrl = resolveImageUrl(item.images[0]);
              const defaultSku = item.variants.find((variant) => variant.isDefault)?.sku ?? '--';
              const currency = item.variants[0]?.currency ?? 'VND';

              return (
                <tr key={item.id} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-3">
                    <div className="flex gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                        {imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>

                      <div>
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-500">SKU mặc định: {defaultSku}</p>
                        <p className="mt-1 text-xs text-slate-500">ID: {item.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{item.sellerId}</td>
                  <td className="px-3 py-3 text-slate-700">{item.categoryId}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {item.minPrice.toLocaleString('vi-VN')} {currency}
                  </td>
                  <td className="px-3 py-3">
                    <StatusChip status={item.status} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <ActionButton label="Approve" tone="primary" onClick={() => onUpdateStatus(item.id, 'ACTIVE')} />
                      <ActionButton label="Hide" tone="secondary" onClick={() => onUpdateStatus(item.id, 'HIDDEN')} />
                      <ActionButton label="Draft" tone="secondary" onClick={() => onUpdateStatus(item.id, 'DRAFT')} />
                      <ActionButton label="Archive" tone="secondary" onClick={() => onUpdateStatus(item.id, 'ARCHIVED')} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function resolveImageUrl(value: string | undefined): string {
  if (!value) {
    return '';
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const normalized = value.startsWith('/') ? value.slice(1) : value;
  return `${PRODUCT_ASSET_BASE_URL}/${normalized}`;
}

function StatusChip({ status }: { status: ModerationProductStatus }) {
  return <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{status}</span>;
}

function ActionButton({
  label,
  tone,
  onClick
}: {
  label: string;
  tone: 'primary' | 'secondary';
  onClick: () => void;
}) {
  const cls =
    tone === 'primary'
      ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700 hover:border-brand-700'
      : 'border-slate-300 text-slate-700 hover:bg-slate-50';

  return (
    <button type="button" onClick={onClick} className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${cls}`}>
      {label}
    </button>
  );
}
