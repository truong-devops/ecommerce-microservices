'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { SellerTopbar } from '@/components/layout/seller-topbar';
import { SellerApiClientError } from '@/lib/api/client';
import {
  createSellerProduct,
  getSellerProductById,
  listSellerCategories,
  softDeleteSellerProduct,
  updateSellerProduct,
  uploadSellerProductImage
} from '@/lib/api/products';
import type {
  CreateSellerProductInput,
  SellerProduct,
  SellerCategoryOption,
  UploadSellerProductImageOutput
} from '@/lib/api/types';
import { useAuth } from '@/providers/AppProvider';

type ProductFormTab = 'basic' | 'description' | 'sales' | 'shipping' | 'other';
type SubmitIntent = 'draft' | 'publish';

interface ProductFormState {
  name: string;
  slug: string;
  categoryId: string;
  brand: string;
  description: string;
  gtin: string;
}

interface VariantFormState {
  id: string;
  sku: string;
  name: string;
  price: string;
  compareAtPrice: string;
  currency: string;
  isDefault: boolean;
}

interface UploadedImageItem extends UploadSellerProductImageOutput {
  id: string;
}

const FORM_TABS: Array<{ id: ProductFormTab; label: string }> = [
  { id: 'basic', label: 'Thông tin cơ bản' },
  { id: 'description', label: 'Mô tả' },
  { id: 'sales', label: 'Thông tin bán hàng' },
  { id: 'shipping', label: 'Vận chuyển' },
  { id: 'other', label: 'Thông tin khác' }
];

const INITIAL_FORM_STATE: ProductFormState = {
  name: '',
  slug: '',
  categoryId: '',
  brand: '',
  description: '',
  gtin: ''
};

const INITIAL_VARIANT: VariantFormState = {
  id: createLocalId(),
  sku: '',
  name: 'Bản Tiêu Chuẩn',
  price: '',
  compareAtPrice: '',
  currency: 'VND',
  isDefault: true
};

const SKU_PATTERN = /^[A-Z0-9._-]+$/;

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, user, accessToken, logout } = useAuth();
  const editingProductId = searchParams.get('productId')?.trim() || '';
  const isEditMode = editingProductId.length > 0;

  const [activeTab, setActiveTab] = useState<ProductFormTab>('basic');
  const [selectedRatio, setSelectedRatio] = useState<'1:1' | '3:4'>('1:1');
  const [withoutGtin, setWithoutGtin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [form, setForm] = useState<ProductFormState>(INITIAL_FORM_STATE);
  const [variants, setVariants] = useState<VariantFormState[]>([INITIAL_VARIANT]);
  const [uploadedImages, setUploadedImages] = useState<UploadedImageItem[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [loadProductError, setLoadProductError] = useState('');
  const [isSoftDeleting, setIsSoftDeleting] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState<SellerCategoryOption[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  const handleLogout = useCallback(async () => {
    await logout();
    router.push('/login');
  }, [logout, router]);

  useEffect(() => {
    if (!ready || !accessToken) {
      return;
    }

    let cancelled = false;

    const loadCategories = async () => {
      setIsLoadingCategories(true);
      setCategoryError('');

      try {
        const response = await listSellerCategories(accessToken);

        if (!cancelled) {
          setCategoryOptions(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof SellerApiClientError) {
            setCategoryError(error.message);
          } else {
            setCategoryError('Không tải được danh mục từ dữ liệu hiện có.');
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCategories(false);
        }
      }
    };

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, [accessToken, ready]);

  useEffect(() => {
    if (!ready || !accessToken || !isEditMode) {
      return;
    }

    let cancelled = false;

    const loadProductDetail = async () => {
      setIsLoadingProduct(true);
      setLoadProductError('');

      try {
        const product = await getSellerProductById(accessToken, editingProductId);

        if (cancelled) {
          return;
        }

        hydrateFormFromProduct(product);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof SellerApiClientError) {
          setLoadProductError(error.message);
        } else {
          setLoadProductError('Không tải được thông tin sản phẩm.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProduct(false);
        }
      }
    };

    const hydrateFormFromProduct = (product: SellerProduct) => {
      const normalizedName = (product.name ?? '').trim();
      const normalizedSlug = (product.slug ?? '').trim();

      setForm({
        name: product.name ?? '',
        slug: normalizedSlug || toProductSlug(normalizedName),
        categoryId: product.categoryId ?? '',
        brand: product.brand ?? '',
        description: product.description ?? '',
        gtin: extractGtin(product)
      });
      setIsSlugManuallyEdited(Boolean(normalizedSlug));

      const nextVariants = (product.variants ?? []).map((variant, index) => ({
        id: createLocalId(),
        sku: variant.sku ?? '',
        name: variant.name ?? `Phân loại ${index + 1}`,
        price: String(variant.price ?? ''),
        compareAtPrice: variant.compareAtPrice === null || variant.compareAtPrice === undefined ? '' : String(variant.compareAtPrice),
        currency: variant.currency ?? 'VND',
        isDefault: Boolean(variant.isDefault)
      }));

      setVariants(
        nextVariants.length > 0
          ? nextVariants
          : [
              {
                ...INITIAL_VARIANT,
                id: createLocalId()
              }
            ]
      );

      if (!(product.variants ?? []).some((variant) => variant.isDefault) && (product.variants ?? []).length > 0) {
        setVariants((previous) => previous.map((variant, index) => ({ ...variant, isDefault: index === 0 })));
      }

      const imageRatio = extractImageRatio(product);
      setSelectedRatio(imageRatio);

      const gtin = extractGtin(product);
      setWithoutGtin(!gtin);

      setUploadedImages(
        (product.images ?? []).map((imageUrl) => ({
          id: createLocalId(),
          fileName: extractImageFileName(imageUrl),
          folder: extractImageFolder(imageUrl, product.categoryId ?? ''),
          imageUrl,
          relativePath: extractRelativePathFromUrl(imageUrl, product.categoryId ?? '')
        }))
      );
    };

    void loadProductDetail();

    return () => {
      cancelled = true;
    };
  }, [accessToken, editingProductId, isEditMode, ready]);

  const previewPriceText = useMemo(() => {
    const candidate = variants.find((variant) => variant.isDefault) ?? variants[0];
    if (!candidate) {
      return '--';
    }

    const price = Number(candidate.price);
    if (!Number.isFinite(price) || price < 0) {
      return '--';
    }

    return `${price.toLocaleString('vi-VN')} ${candidate.currency.trim().toUpperCase() || 'VND'}`;
  }, [variants]);

  const suggestedSkuPrefix = useMemo(() => buildSkuPrefix(form.brand, form.categoryId, form.name), [form.brand, form.categoryId, form.name]);

  useEffect(() => {
    const prefix = suggestedSkuPrefix || 'SKU';
    setVariants((previous) => {
      const next = autoAssignSkus(previous, prefix);
      const hasChanged = next.some((item, index) => item.sku !== previous[index]?.sku);
      return hasChanged ? next : previous;
    });
  }, [suggestedSkuPrefix, variants.length]);

  const updateField = useCallback(
    <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
      if (key === 'slug') {
        setIsSlugManuallyEdited(true);
        setForm((previous) => ({
          ...previous,
          slug: String(value)
        }));
        return;
      }

      if (key === 'name') {
        const nextName = String(value);
        setForm((previous) => {
          const generatedFromPrevious = toProductSlug(previous.name);
          const shouldSyncSlug =
            !isSlugManuallyEdited || previous.slug.trim() === '' || previous.slug.trim() === generatedFromPrevious;

          return {
            ...previous,
            name: nextName,
            slug: shouldSyncSlug ? toProductSlug(nextName) : previous.slug
          };
        });
        return;
      }

      setForm((previous) => ({
        ...previous,
        [key]: value
      }));
    },
    [isSlugManuallyEdited]
  );

  const updateVariant = <K extends keyof VariantFormState>(variantId: string, key: K, value: VariantFormState[K]) => {
    setVariants((previous) =>
      previous.map((variant) => (variant.id === variantId ? { ...variant, [key]: value } : variant))
    );
  };

  const addVariant = () => {
    setVariants((previous) => [
      ...previous,
      {
        id: createLocalId(),
        sku: '',
        name: `Phân loại ${previous.length + 1}`,
        price: '',
        compareAtPrice: '',
        currency: previous[0]?.currency || 'VND',
        isDefault: false
      }
    ]);
  };

  const removeVariant = (variantId: string) => {
    setVariants((previous) => {
      if (previous.length === 1) {
        return previous;
      }

      const next = previous.filter((variant) => variant.id !== variantId);
      if (!next.some((variant) => variant.isDefault) && next[0]) {
        next[0] = { ...next[0], isDefault: true };
      }

      return next;
    });
  };

  const setDefaultVariant = (variantId: string) => {
    setVariants((previous) => previous.map((variant) => ({ ...variant, isDefault: variant.id === variantId })));
  };

  const removeImage = (imageId: string) => {
    setUploadedImages((previous) => previous.filter((image) => image.id !== imageId));
  };

  const handleImageFilesSelected = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;

      if (!files || files.length === 0 || !accessToken) {
        return;
      }

      setUploadError('');
      setIsUploadingImages(true);

      const folder = toCategoryFolder(form.categoryId);

      try {
        const uploadTasks = Array.from(files).map(async (file) => {
          const uploaded = await uploadSellerProductImage(accessToken, {
            file,
            folder
          });

          return {
            ...uploaded,
            id: createLocalId()
          } satisfies UploadedImageItem;
        });

        const uploadedList = await Promise.all(uploadTasks);
        setUploadedImages((previous) => [...previous, ...uploadedList]);
      } catch (error) {
        if (error instanceof SellerApiClientError) {
          setUploadError(error.message);
        } else {
          setUploadError('Upload hình thất bại. Vui lòng thử lại.');
        }
      } finally {
        setIsUploadingImages(false);
        event.target.value = '';
      }
    },
    [accessToken, form.categoryId]
  );

  const submitProduct = useCallback(
    async (intent: SubmitIntent) => {
      if (!accessToken || !user) {
        setSubmitError('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
        return;
      }

      setSubmitError('');

      const name = form.name.trim();
      const categoryId = form.categoryId.trim();

      if (!name) {
        setSubmitError('Tên sản phẩm là bắt buộc.');
        return;
      }

      if (!categoryId) {
        setSubmitError('Danh mục là bắt buộc.');
        return;
      }

      if (variants.length === 0) {
        setSubmitError('Cần ít nhất 1 phân loại.');
        return;
      }

      const duplicatedSkus = findDuplicateSkus(variants.map((variant) => variant.sku));
      if (duplicatedSkus.length > 0) {
        setSubmitError(`SKU bị trùng: ${duplicatedSkus.join(', ')}`);
        return;
      }

      const validatedVariants: CreateSellerProductInput['variants'] = [];

      for (const variant of variants) {
        const sku = variant.sku.trim().toUpperCase();
        const variantName = variant.name.trim();
        const currency = variant.currency.trim().toUpperCase();
        const price = Number(variant.price);

        if (!sku) {
          setSubmitError('Mỗi phân loại phải có SKU.');
          return;
        }

        if (!variantName) {
          setSubmitError('Mỗi phân loại phải có tên.');
          return;
        }

        if (!SKU_PATTERN.test(sku)) {
          setSubmitError(`SKU ${sku} chỉ được chứa chữ hoa, số, dấu ".", "_" hoặc "-".`);
          return;
        }

        if (!/^[A-Z]{3}$/.test(currency)) {
          setSubmitError(`Tiền tệ của SKU ${sku} không hợp lệ (ví dụ: VND).`);
          return;
        }

        if (!Number.isFinite(price) || price < 0) {
          setSubmitError(`Giá của SKU ${sku} không hợp lệ.`);
          return;
        }

        const compareAtPrice = variant.compareAtPrice.trim() ? Number(variant.compareAtPrice) : null;
        if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice < 0)) {
          setSubmitError(`Giá so sánh của SKU ${sku} không hợp lệ.`);
          return;
        }

        validatedVariants.push({
          sku,
          name: variantName,
          price,
          currency,
          compareAtPrice: compareAtPrice ?? undefined,
          isDefault: variant.isDefault,
          metadata: {
            generatedFrom: uploadedImages.length > 0 ? 'seller-upload' : 'manual-entry',
            imageRatio: selectedRatio,
            gtin: withoutGtin ? null : form.gtin.trim() || null
          }
        });
      }

      if (!validatedVariants.some((variant) => variant.isDefault)) {
        validatedVariants[0].isDefault = true;
      }

      const payload: CreateSellerProductInput = {
        name,
        categoryId,
        slug: form.slug.trim() || undefined,
        brand: form.brand.trim() || undefined,
        description: form.description.trim() || undefined,
        images: uploadedImages.map((image) => normalizeProductImageUrl(image.imageUrl)),
        variants: validatedVariants,
        attributes: {
          source: uploadedImages.length > 0 ? 'seller-upload' : 'manual-entry',
          folder: toCategoryFolder(categoryId),
          uploadedImages: uploadedImages.map((item) => item.relativePath)
        },
        status: isEditMode ? 'DRAFT' : intent === 'publish' && user.role !== 'SELLER' ? 'ACTIVE' : 'DRAFT'
      };

      setIsSubmitting(true);
      try {
        if (isEditMode) {
          await updateSellerProduct(accessToken, editingProductId, payload);
        } else {
          await createSellerProduct(accessToken, payload);
        }

        router.push('/products/all');
      } catch (error) {
        if (error instanceof SellerApiClientError) {
          setSubmitError(error.message);
        } else {
          setSubmitError(isEditMode ? 'Không thể cập nhật sản phẩm lúc này. Vui lòng thử lại.' : 'Không thể tạo sản phẩm lúc này. Vui lòng thử lại.');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [accessToken, editingProductId, form, isEditMode, router, selectedRatio, uploadedImages, user, variants, withoutGtin]
  );

  const handleSoftDelete = useCallback(async () => {
    if (!accessToken || !isEditMode) {
      return;
    }

    const confirmed = window.confirm('Bạn có chắc muốn xóa mềm sản phẩm này? Sản phẩm sẽ không bị xóa vĩnh viễn.');
    if (!confirmed) {
      return;
    }

    setSubmitError('');
    setIsSoftDeleting(true);

    try {
      await softDeleteSellerProduct(accessToken, editingProductId);
      router.push('/products/all');
    } catch (error) {
      if (error instanceof SellerApiClientError) {
        setSubmitError(error.message);
      } else {
        setSubmitError('Xóa mềm sản phẩm thất bại.');
      }
    } finally {
      setIsSoftDeleting(false);
    }
  }, [accessToken, editingProductId, isEditMode, router]);

  const tabContent = useMemo(() => {
    if (activeTab === 'description') {
      return (
        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <h2 className="text-sm font-semibold text-slate-900">Mô tả</h2>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">* Mô tả sản phẩm</h3>
          <textarea
            value={form.description}
            onChange={(event) => {
              updateField('description', event.target.value);
            }}
            placeholder="Nhập mô tả sản phẩm"
            className="mt-2 h-56 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 outline-none"
          />
        </section>
      );
    }

    if (activeTab !== 'basic' && activeTab !== 'sales') {
      return (
        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <h2 className="text-sm font-semibold text-slate-900">{FORM_TABS.find((tab) => tab.id === activeTab)?.label}</h2>
          <p className="mt-2 text-sm text-slate-500">Phần nội dung này đang chờ bổ sung.</p>
        </section>
      );
    }

    if (activeTab === 'sales') {
      return (
        <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Thông tin bán hàng</h2>
            <button
              type="button"
              onClick={addVariant}
              className="rounded-md border border-[#ee4d2d] px-3 py-1.5 text-sm font-semibold text-[#ee4d2d] hover:bg-[#fff4f1]"
            >
              + Thêm phân loại
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">SKU được hệ thống tự sinh theo mẫu: {buildSkuValue(suggestedSkuPrefix || 'SKU', 1)}</p>

          <div className="mt-4 space-y-3">
            {variants.map((variant, index) => (
              <article key={variant.id} className="rounded-md border border-slate-200 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Phân loại {index + 1}</h3>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-slate-600">
                      <input
                        type="radio"
                        name="default-variant"
                        checked={variant.isDefault}
                        onChange={() => {
                          setDefaultVariant(variant.id);
                        }}
                      />
                      Mặc định
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        removeVariant(variant.id);
                      }}
                      disabled={variants.length === 1}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                    >
                      Xoá
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    SKU *
                    <input
                      value={variant.sku}
                      readOnly
                      placeholder="SKU tự sinh"
                      className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    />
                    <p className="mt-1 text-xs text-slate-500">Hệ thống tự kiểm tra trùng SKU và tự tạo mã cho từng phân loại.</p>
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Tên phân loại *
                    <input
                      value={variant.name}
                      onChange={(event) => {
                        updateVariant(variant.id, 'name', event.target.value);
                      }}
                      placeholder="Bản Tiêu Chuẩn"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Giá *
                    <input
                      value={variant.price}
                      onChange={(event) => {
                        updateVariant(variant.id, 'price', event.target.value);
                      }}
                      placeholder="299000"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Tiền tệ *
                    <input
                      value={variant.currency}
                      onChange={(event) => {
                        updateVariant(variant.id, 'currency', event.target.value.toUpperCase());
                      }}
                      placeholder="VND"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                    Giá so sánh
                    <input
                      value={variant.compareAtPrice}
                      onChange={(event) => {
                        updateVariant(variant.id, 'compareAtPrice', event.target.value);
                      }}
                      placeholder="335000"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }

    return (
      <section className="rounded-md border border-slate-200 bg-white p-4 text-sm">
        <h2 className="text-sm font-semibold text-slate-900">Thông tin cơ bản</h2>

        <div className="mt-4 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">* Hình ảnh sản phẩm</h3>

            <div className="mt-2 flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  checked={selectedRatio === '1:1'}
                  onChange={() => {
                    setSelectedRatio('1:1');
                  }}
                />
                Hình ảnh tỷ lệ 1:1
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  checked={selectedRatio === '3:4'}
                  onChange={() => {
                    setSelectedRatio('3:4');
                  }}
                />
                Hình ảnh tỷ lệ 3:4
              </label>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-[#ee4d2d] px-3 py-2 text-sm font-semibold text-[#ee4d2d] hover:bg-[#fff4f1]">
                {isUploadingImages ? 'Đang upload...' : 'Chọn ảnh để upload'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={handleImageFilesSelected}
                  disabled={isUploadingImages}
                  className="hidden"
                />
              </label>
              <p className="text-sm text-slate-500">Đã upload: {uploadedImages.length}</p>
            </div>

            {uploadError ? <p className="mt-2 text-sm text-rose-600">{uploadError}</p> : null}

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {uploadedImages.map((image) => (
                <article key={image.id} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                  <div className="h-32 w-full bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.imageUrl} alt={image.fileName} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs text-slate-600">{image.relativePath}</p>
                    <button
                      type="button"
                      onClick={() => {
                        removeImage(image.id);
                      }}
                      className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
                    >
                      Xoá ảnh
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <label className="block text-sm font-semibold text-slate-900">
              * Tên sản phẩm
              <input
                value={form.name}
                onChange={(event) => {
                  updateField('name', event.target.value);
                }}
                placeholder="iPhone 16 Plus"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="mt-4 block text-sm font-semibold text-slate-900">
              Slug (tuỳ chọn)
              <input
                value={form.slug}
                onChange={(event) => {
                  updateField('slug', event.target.value);
                }}
                placeholder="dienthoaivaphukien-iphone16-plus-003"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs font-normal text-slate-500">Tự sinh từ tên sản phẩm, bạn vẫn có thể chỉnh tay nếu cần.</p>
            </label>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-900">
                Danh mục có sẵn
                <select
                  value={categoryOptions.some((category) => category.id === form.categoryId) ? form.categoryId : ''}
                  onChange={(event) => {
                    if (!event.target.value) {
                      return;
                    }

                    updateField('categoryId', event.target.value);
                  }}
                  className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Chọn danh mục hiện có</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.id} ({category.count})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs font-normal text-slate-500">
                  {isLoadingCategories ? 'Đang tải danh mục từ dữ liệu sản phẩm...' : `Đã tải ${categoryOptions.length} danh mục.`}
                </p>
                {categoryError ? <p className="mt-1 text-xs font-normal text-rose-600">{categoryError}</p> : null}
              </label>

              <label className="block text-sm font-semibold text-slate-900">
                Danh mục - nhập/chỉnh sửa
                <input
                  value={form.categoryId}
                  onChange={(event) => {
                    updateField('categoryId', event.target.value);
                  }}
                  list="seller-category-options"
                  placeholder="dien-thoai-phu-kien"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <datalist id="seller-category-options">
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.id}
                    </option>
                  ))}
                </datalist>
                <p className="mt-1 text-xs font-normal text-slate-500">Có thể chọn danh mục hiện có hoặc nhập mới để tạo danh mục mới.</p>
              </label>

              <label className="block text-sm font-semibold text-slate-900">
                Thương hiệu
                <input
                  value={form.brand}
                  onChange={(event) => {
                    updateField('brand', event.target.value);
                  }}
                  placeholder="ECM Mobile"
                  className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>
        </div>
      </section>
    );
  }, [
    activeTab,
    categoryError,
    categoryOptions,
    form,
    handleImageFilesSelected,
    isLoadingCategories,
    isUploadingImages,
    selectedRatio,
    suggestedSkuPrefix,
    updateField,
    uploadError,
    uploadedImages,
    variants
  ]);

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-600">
        Đang kiểm tra phiên đăng nhập...
      </main>
    );
  }

  if (!user || !accessToken) {
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

      <div className="px-3 py-3 lg:px-4">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-[#ee4d2d]">
            Trang chủ
          </Link>
          <span>›</span>
          <Link href="/products/all" className="hover:text-[#ee4d2d]">
            Sản phẩm
          </Link>
          <span>›</span>
          <span className="font-medium text-slate-700">{isEditMode ? 'Chi tiết sản phẩm' : 'Thêm 1 sản phẩm mới'}</span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_320px]">
          <aside className="h-fit rounded-md border border-slate-200 bg-white p-4 text-sm xl:sticky xl:top-16">
            <h3 className="text-sm font-semibold text-[#2563eb]">Gợi ý</h3>
            <h4 className="mt-3 text-sm font-semibold text-slate-900">Danh mục & hình ảnh</h4>
            <p className="mt-2 text-sm text-slate-600">- Danh mục gợi ý lấy từ dữ liệu sản phẩm hiện có.</p>
            <p className="mt-1 text-sm text-slate-600">- Nếu danh mục chưa có, bạn nhập mới và hệ thống vẫn tạo sản phẩm bình thường.</p>
            {/* <p className="mt-1 text-sm text-slate-600">- Hình upload sẽ lưu vào `services/product-service/seed-data/image/folder-name`.</p> */}
            <p className="mt-2 text-sm text-slate-500">
              {isEditMode
                ? 'Khi lưu chỉnh sửa từ màn Chi tiết, trạng thái sẽ chuyển về DRAFT để hệ thống kiểm duyệt lại.'
                : 'Seller tạo mới sẽ ở trạng thái DRAFT.'}
            </p>
          </aside>

          <main className="space-y-4">
            {isEditMode && isLoadingProduct ? (
              <section className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">Đang tải thông tin sản phẩm...</section>
            ) : null}

            {loadProductError ? (
              <section className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadProductError}</section>
            ) : null}

            <section className="rounded-md border border-slate-200 bg-white px-4 pb-0 pt-3 text-sm">
              <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 pb-2">
                {FORM_TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                      }}
                      className={[
                        'border-b-[3px] pb-2 text-sm font-semibold',
                        isActive ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-slate-800'
                      ].join(' ')}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {tabContent}

            {isEditMode ? (
              <section className="rounded-md border border-rose-200 bg-rose-50/40 px-4 py-3 text-sm">
                <p className="mt-1 text-sm text-rose-600">Sản phẩm sẽ bị ẩn khỏi danh sách hiển thị nhưng vẫn lưu trong hệ thống.</p>
                <button
                  type="button"
                  disabled={isSoftDeleting || isSubmitting || isUploadingImages}
                  onClick={() => {
                    void handleSoftDelete();
                  }}
                  className="mt-3 rounded-md border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                >
                  {isSoftDeleting ? 'Đang xóa ...' : 'Xóa sản phẩm'}
                </button>
              </section>
            ) : null}

            {submitError ? (
              <section className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{submitError}</section>
            ) : null}
          </main>

          <aside className="h-fit rounded-md border border-slate-200 bg-white p-4 text-sm xl:sticky xl:top-16">
            <h3 className="text-sm font-semibold text-slate-900">Xem trước</h3>
            <p className="mt-2 text-sm text-slate-600">Chi tiết sản phẩm</p>
            <div className="mt-3 h-[460px] overflow-hidden rounded-md border border-slate-200 bg-[#f8fafc] p-3">
              <div className="h-40 rounded-md bg-slate-100">
                {uploadedImages[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadedImages[0].imageUrl} alt="preview" className="h-full w-full rounded-md object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-slate-400">Chưa có ảnh</div>
                )}
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-700 line-clamp-2">{form.name.trim() || 'Tên sản phẩm'}</p>
              <p className="mt-1 text-sm text-[#ee4d2d]">{previewPriceText}</p>
              <p className="mt-1 text-sm text-slate-500">{variants.length} phân loại</p>
              <div className="mt-3 h-24 rounded-md bg-slate-100 p-2 text-xs text-slate-500">
                {form.description.trim() || 'Mô tả sản phẩm sẽ hiển thị tại đây.'}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">{user.email.split('@')[0] || 'seller'}</span>
                <button className="rounded-md border border-[#f2b8aa] px-3 py-1 text-sm text-[#ee4d2d]">Xem</button>
              </div>
              <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md">
                <button className="bg-[#14b8a6] px-3 py-2 text-sm font-semibold text-white">Chat</button>
                <button className="bg-[#ee4d2d] px-3 py-2 text-sm font-semibold text-white">Mua Ngay</button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <footer className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] justify-center gap-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-8 py-2 text-sm font-semibold text-slate-700"
            onClick={() => {
              router.push('/products/all');
            }}
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={isSubmitting || isUploadingImages || isLoadingProduct || isSoftDeleting}
            onClick={() => {
              void submitProduct('draft');
            }}
            className="rounded-md border border-slate-300 bg-slate-100 px-8 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Đang lưu...' : isEditMode ? 'Lưu chỉnh sửa (Draft)' : 'Lưu & Ẩn'}
          </button>
          <button
            type="button"
            disabled={isSubmitting || isUploadingImages || isLoadingProduct || isSoftDeleting}
            onClick={() => {
              void submitProduct('publish');
            }}
            className="rounded-md bg-[#ee4d2d] px-8 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Đang xử lý...' : isEditMode ? 'Lưu thay đổi' : 'Lưu & Hiển thị'}
          </button>
        </div>
      </footer>
    </div>
  );
}

function toCategoryFolder(categoryId: string): string {
  const sanitized = categoryId
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-+|-+$)/g, '');

  return sanitized || 'uncategorized';
}

function toProductSlug(name: string): string {
  return name
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function buildSkuPrefix(brand: string, categoryId: string, productName: string): string {
  const candidates = [brand, categoryId, productName]
    .map((value) => toSkuToken(value))
    .filter(Boolean);

  if (candidates.length === 0) {
    return 'SKU';
  }

  return candidates.slice(0, 2).join('-');
}

function buildSkuValue(prefix: string, sequence: number): string {
  const normalizedPrefix = toSkuToken(prefix) || 'SKU';
  const paddedSequence = String(Math.max(1, sequence)).padStart(3, '0');
  return `${normalizedPrefix}-${paddedSequence}`;
}

function autoAssignSkus(variants: VariantFormState[], prefix: string): VariantFormState[] {
  const usedSkus = new Set<string>();

  return variants.map((variant, index) => {
    let sequence = index + 1;
    let candidate = buildSkuValue(prefix, sequence);

    while (usedSkus.has(candidate)) {
      sequence += 1;
      candidate = buildSkuValue(prefix, sequence);
    }

    usedSkus.add(candidate);
    return {
      ...variant,
      sku: candidate
    };
  });
}

function findDuplicateSkus(values: string[]): string[] {
  const counts = new Map<string, number>();

  for (const rawValue of values) {
    const normalized = rawValue.trim().toUpperCase();
    if (!normalized) {
      continue;
    }
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count > 1).map(([sku]) => sku);
}

function toSkuToken(value: string): string {
  return value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function createLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeProductImageUrl(raw: string): string {
  const value = raw.trim();

  if (value.startsWith('http://localhost:3003/')) {
    return value.replace('http://localhost:3003/', 'http://127.0.0.1:3003/');
  }

  return value;
}

function extractImageRatio(product: SellerProduct): '1:1' | '3:4' {
  const variant = product.variants.find((item) => item.isDefault) ?? product.variants[0];
  const metadata = variant?.metadata ?? {};
  const ratio = typeof metadata.imageRatio === 'string' ? metadata.imageRatio : '';
  return ratio === '3:4' ? '3:4' : '1:1';
}

function extractGtin(product: SellerProduct): string {
  const variant = product.variants.find((item) => item.isDefault) ?? product.variants[0];
  const metadata = variant?.metadata ?? {};
  const gtin = metadata.gtin;
  return typeof gtin === 'string' ? gtin : '';
}

function extractRelativePathFromUrl(imageUrl: string, categoryId: string): string {
  try {
    const parsed = new URL(imageUrl);
    const marker = '/api/v1/products/assets/';
    const index = parsed.pathname.indexOf(marker);
    if (index >= 0) {
      return parsed.pathname.slice(index + marker.length);
    }
  } catch {
    // Ignore invalid URL and fallback below.
  }

  const fallbackFolder = toCategoryFolder(categoryId);
  return `${fallbackFolder}/${extractImageFileName(imageUrl)}`;
}

function extractImageFolder(imageUrl: string, categoryId: string): string {
  const relativePath = extractRelativePathFromUrl(imageUrl, categoryId);
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(0, -1).join('/');
  }

  return toCategoryFolder(categoryId);
}

function extractImageFileName(imageUrl: string): string {
  try {
    const parsed = new URL(imageUrl);
    const pathname = parsed.pathname;
    return pathname.split('/').filter(Boolean).pop() ?? 'image';
  } catch {
    return imageUrl.split('/').filter(Boolean).pop() ?? 'image';
  }
}
