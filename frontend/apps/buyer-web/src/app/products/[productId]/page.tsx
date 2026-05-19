'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecommendationSection } from '@/components/home/RecommendationSection';
import { Header } from '@/components/layout/Header';
import { BuyerApiClientError } from '@/lib/api/client';
import { createBuyerChatConversation } from '@/lib/api/chat';
import { fetchBuyerProducts, fetchBuyerShopDetail, fetchProductDetail } from '@/lib/api/products';
import { loadRecommendedProductItems } from '@/lib/api/recommendation-products';
import { createBuyerReview, fetchReviewsByProduct, fetchReviewSummaryByProduct } from '@/lib/api/reviews';
import { formatSellerCode } from '@/lib/order-codes';
import { formatPrice } from '@/lib/price';
import { isValidProductId } from '@/lib/product-id';
import type { BuyerShopDetail, ProductDetail, ProductItem, ReviewItem, ReviewSummary } from '@/lib/api/types';
import { useAuth, useCart, useLanguage } from '@/providers/AppProvider';

type ProductPageStatus = 'loading' | 'error' | 'invalid-id' | 'not-found' | 'success';

interface ProductDetailPageProps {
  params: {
    productId: string;
  };
}

export default function ProductDetailPage({ params }: ProductDetailPageProps) {
  const router = useRouter();
  const { text, locale } = useLanguage();
  const { user, accessToken } = useAuth();
  const { addToCart } = useCart();

  const rawProductId = params.productId ?? '';
  const productId = useMemo(() => {
    try {
      return decodeURIComponent(rawProductId).trim();
    } catch {
      return '';
    }
  }, [rawProductId]);

  const [status, setStatus] = useState<ProductPageStatus>('loading');
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState('');
  const [selectedImage, setSelectedImage] = useState('');
  const [selectedVariantSku, setSelectedVariantSku] = useState<string | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [shop, setShop] = useState<BuyerShopDetail | null>(null);
  const [shopProductCount, setShopProductCount] = useState<number | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopErrorMessage, setShopErrorMessage] = useState('');
  const [recommendedProducts, setRecommendedProducts] = useState<ProductItem[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [reviewPageSize] = useState(10);
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<number | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitMessage, setReviewSubmitMessage] = useState('');
  const [reviewForm, setReviewForm] = useState({
    orderId: '',
    rating: 5,
    title: '',
    content: '',
    imagesInput: ''
  });

  const selectedVariant = useMemo(() => {
    if (!product || product.variants.length === 0) {
      return null;
    }

    if (selectedVariantSku) {
      const matched = product.variants.find((variant) => variant.sku === selectedVariantSku);
      if (matched) {
        return matched;
      }
    }

    return product.variants.find((variant) => variant.isDefault) ?? product.variants[0];
  }, [product, selectedVariantSku]);

  const displayPrice = selectedVariant?.price ?? product?.price ?? 0;
  const displayCurrency = selectedVariant?.currency ?? product?.currency ?? 'VND';
  const displayCompareAtPrice = selectedVariant?.compareAtPrice ?? product?.compareAtPrice ?? null;
  const displayDiscountPercent = selectedVariant?.discountPercent ?? product?.discountPercent ?? 0;
  const displaySku = selectedVariant?.sku ?? product?.defaultSku ?? null;
  const variantStock = useMemo(() => extractStockFromRecord(selectedVariant?.metadata), [selectedVariant?.metadata]);
  const availableStock = variantStock ?? product?.stock ?? null;

  const detailText = locale === 'vi'
    ? {
        breadcrumbHome: 'Trang chủ',
        category: 'Danh mục',
        sku: 'Mã sản phẩm',
        variant: 'Phân loại',
        defaultVariant: 'Mặc định',
        productInfo: 'Chi tiết sản phẩm',
        productDescription: 'Mô tả sản phẩm',
        noDescription: 'Thông tin mô tả đang được cập nhật.',
        brand: 'Thương hiệu',
        status: 'Trạng thái',
        seller: 'Nhà bán',
        updatedAt: 'Cập nhật lúc',
        createdAt: 'Đăng bán từ',
        freeReturn: 'Đổi trả miễn phí trong 7 ngày',
        genuine: 'Cam kết chính hãng',
        inStock: 'Còn hàng',
        soldOut: 'Hết hàng',
        reviewsLabel: 'đánh giá',
        discount: 'Giảm',
        selectImage: 'Chọn ảnh',
        noAttributes: 'Đang cập nhật thông số sản phẩm.',
        reviewTitle: 'Đánh giá sản phẩm',
        reviewAll: 'Tất cả',
        reviewWithComment: 'Có bình luận',
        reviewWithImage: 'Có hình ảnh',
        reviewEmpty: 'Chưa có đánh giá cho sản phẩm này.',
        reviewLoadError: 'Không thể tải đánh giá lúc này.',
        sellerReply: 'Phản hồi từ nhà bán',
        reviewLoginRequired: 'Bạn cần đăng nhập để gửi đánh giá.',
        reviewCustomerOnly: 'Chỉ tài khoản người mua (CUSTOMER) mới được gửi đánh giá.',
        loginNow: 'Đăng nhập ngay',
        reviewOrderId: 'Mã đơn hàng',
        reviewRating: 'Số sao',
        reviewTitleField: 'Tiêu đề',
        reviewContentField: 'Nội dung',
        reviewImagesField: 'Ảnh (URL, cách nhau bằng dấu phẩy)',
        submitReview: 'Gửi đánh giá',
        submittingReview: 'Đang gửi...',
        reviewSubmitSuccess: 'Gửi đánh giá thành công.',
        reviewSubmitFailed: 'Gửi đánh giá thất bại.',
        reviewOrderIdRequired: 'Vui lòng nhập mã đơn hàng hợp lệ.',
        reviewContentRequired: 'Vui lòng nhập nội dung đánh giá.',
        shopBlockTitle: 'THÔNG TIN SHOP',
        shopOnlineLabel: 'Hoạt động',
        shopUpdatedLabel: 'Cập nhật',
        shopSellerLabel: 'Mã nhà bán',
        shopProductsLabel: 'Sản phẩm',
        shopCategoriesLabel: 'Danh mục nổi bật',
        shopNavigationLabel: 'Menu shop',
        chatNow: 'Chat Ngay',
        viewShop: 'Xem Shop',
        chatNeedLogin: 'Bạn cần đăng nhập để chat với nhà bán.',
        chatCustomerOnly: 'Chỉ tài khoản CUSTOMER mới chat với nhà bán.',
        chatCreateFailed: 'Không thể tạo hội thoại chat lúc này.',
        chatCreating: 'Đang tạo...',
        frequentlyBoughtTogether: 'Thường được mua cùng'
      }
    : {
        breadcrumbHome: 'Home',
        category: 'Category',
        sku: 'SKU',
        variant: 'Variant',
        defaultVariant: 'Default',
        productInfo: 'Product details',
        productDescription: 'Product description',
        noDescription: 'Description is being updated.',
        brand: 'Brand',
        status: 'Status',
        seller: 'Seller',
        updatedAt: 'Updated at',
        createdAt: 'Listed since',
        freeReturn: 'Free return within 7 days',
        genuine: 'Genuine product guarantee',
        inStock: 'In stock',
        soldOut: 'Out of stock',
        reviewsLabel: 'reviews',
        discount: 'Off',
        selectImage: 'Select image',
        noAttributes: 'Product specs are being updated.',
        reviewTitle: 'Product reviews',
        reviewAll: 'All',
        reviewWithComment: 'With comment',
        reviewWithImage: 'With image',
        reviewEmpty: 'No reviews for this product yet.',
        reviewLoadError: 'Cannot load product reviews right now.',
        sellerReply: 'Seller reply',
        reviewLoginRequired: 'You must login to submit a review.',
        reviewCustomerOnly: 'Only CUSTOMER accounts can submit reviews.',
        loginNow: 'Login now',
        reviewOrderId: 'Order ID',
        reviewRating: 'Rating',
        reviewTitleField: 'Title',
        reviewContentField: 'Content',
        reviewImagesField: 'Images (comma-separated URLs)',
        submitReview: 'Submit review',
        submittingReview: 'Submitting...',
        reviewSubmitSuccess: 'Review submitted successfully.',
        reviewSubmitFailed: 'Failed to submit review.',
        reviewOrderIdRequired: 'Please enter a valid order ID.',
        reviewContentRequired: 'Please enter review content.',
        shopBlockTitle: 'SHOP INFORMATION',
        shopOnlineLabel: 'Status',
        shopUpdatedLabel: 'Updated',
        shopSellerLabel: 'Seller ID',
        shopProductsLabel: 'Products',
        shopCategoriesLabel: 'Featured categories',
        shopNavigationLabel: 'Shop navigation',
        chatNow: 'Chat now',
        viewShop: 'View shop',
        chatNeedLogin: 'You must login to chat with this seller.',
        chatCustomerOnly: 'Only CUSTOMER accounts can chat with sellers.',
        chatCreateFailed: 'Cannot create conversation right now.',
        chatCreating: 'Creating...',
        frequentlyBoughtTogether: 'Frequently Bought Together'
      };

  const maxQuantity = useMemo(() => {
    if (!product || availableStock === null) {
      return 99;
    }

    return Math.max(1, availableStock);
  }, [product, availableStock]);

  const loadProduct = useCallback(async () => {
    if (!isValidProductId(productId)) {
      setStatus('invalid-id');
      setProduct(null);
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const detail = await fetchProductDetail(productId);
      setProduct(detail);
      setQuantity(1);
      setSelectedImage(detail.image);
      setSelectedVariantSku(detail.variants.find((variant) => variant.isDefault)?.sku ?? detail.variants[0]?.sku ?? null);
      setStatus('success');
    } catch (error) {
      if (error instanceof BuyerApiClientError) {
        if (error.code === 'INVALID_PRODUCT_ID') {
          setStatus('invalid-id');
          setProduct(null);
          return;
        }

        if (error.code === 'PRODUCT_NOT_FOUND' || error.code === 'HTTP_404') {
          setStatus('not-found');
          setProduct(null);
          return;
        }

        setErrorMessage(error.message);
      } else {
        setErrorMessage(text.product.loadError);
      }

      setStatus('error');
      setProduct(null);
    }
  }, [productId, text.product.loadError]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    setQuantity((previous) => Math.min(previous, maxQuantity));
  }, [maxQuantity]);

  const loadReviews = useCallback(async (targetProductId: string, ratingFilter: number | null) => {
    setReviewLoading(true);
    setReviewError('');

    try {
      const [summary, reviewList] = await Promise.all([
        fetchReviewSummaryByProduct(targetProductId),
        fetchReviewsByProduct({
          productId: targetProductId,
          page: 1,
          pageSize: reviewPageSize,
          rating: ratingFilter ?? undefined,
          sortBy: 'createdAt',
          sortOrder: 'DESC'
        })
      ]);

      setReviewSummary(summary);
      setReviews(reviewList.items);
    } catch (error) {
      setReviewSummary(null);
      setReviews([]);
      setReviewError(error instanceof BuyerApiClientError ? error.message : detailText.reviewLoadError);
    } finally {
      setReviewLoading(false);
    }
  }, [detailText.reviewLoadError, reviewPageSize]);

  useEffect(() => {
    if (status !== 'success' || !product) {
      return;
    }

    void loadReviews(product.id, selectedRatingFilter);
  }, [loadReviews, product, selectedRatingFilter, status]);

  const loadShop = useCallback(async (sellerId: string) => {
    const normalizedSellerId = sellerId.trim();
    if (!normalizedSellerId) {
      setShop(null);
      setShopProductCount(null);
      return;
    }

    setShopLoading(true);
    setShopErrorMessage('');

    try {
      const [shopDetail, productList] = await Promise.all([
        fetchBuyerShopDetail(normalizedSellerId),
        fetchBuyerProducts({
          page: 1,
          pageSize: 1,
          sellerId: normalizedSellerId
        })
      ]);

      setShop(shopDetail);
      setShopProductCount(productList.pagination?.totalItems ?? productList.items.length ?? null);
    } catch (error) {
      setShop(null);
      setShopProductCount(null);
      setShopErrorMessage(error instanceof BuyerApiClientError ? error.message : text.product.loadError);
    } finally {
      setShopLoading(false);
    }
  }, [text.product.loadError]);

  useEffect(() => {
    if (status !== 'success' || !product?.sellerId) {
      setShop(null);
      setShopProductCount(null);
      return;
    }

    void loadShop(product.sellerId);
  }, [loadShop, product?.sellerId, status]);

  const loadRecommendations = useCallback(async (targetProductId: string) => {
    setRecommendationLoading(true);

    try {
      setRecommendedProducts(await loadRecommendedProductItems([targetProductId], 6));
    } catch {
      setRecommendedProducts([]);
    } finally {
      setRecommendationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'success' || !product?.id) {
      setRecommendedProducts([]);
      return;
    }

    void loadRecommendations(product.id);
  }, [loadRecommendations, product?.id, status]);

  const handleSubmitReview = useCallback(async () => {
    if (!product || !user || !accessToken) {
      setReviewSubmitMessage(detailText.reviewLoginRequired);
      return;
    }

    if (String(user.role).toUpperCase() !== 'CUSTOMER') {
      setReviewSubmitMessage(detailText.reviewCustomerOnly);
      return;
    }

    const normalizedOrderId = reviewForm.orderId.trim();
    const normalizedContent = reviewForm.content.trim();
    const normalizedTitle = reviewForm.title.trim();

    if (!isUuid(normalizedOrderId)) {
      setReviewSubmitMessage(detailText.reviewOrderIdRequired);
      return;
    }

    if (!normalizedContent) {
      setReviewSubmitMessage(detailText.reviewContentRequired);
      return;
    }

    setSubmittingReview(true);
    setReviewSubmitMessage('');

    try {
      const images = reviewForm.imagesInput
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      await createBuyerReview({
        accessToken,
        payload: {
          orderId: normalizedOrderId,
          productId: product.id,
          sellerId: product.sellerId,
          rating: reviewForm.rating,
          title: normalizedTitle || undefined,
          content: normalizedContent,
          images: images.length > 0 ? images : undefined
        }
      });

      setReviewSubmitMessage(detailText.reviewSubmitSuccess);
      setReviewForm({
        orderId: '',
        rating: 5,
        title: '',
        content: '',
        imagesInput: ''
      });
      await loadReviews(product.id, selectedRatingFilter);
    } catch (error) {
      setReviewSubmitMessage(error instanceof BuyerApiClientError ? error.message : detailText.reviewSubmitFailed);
    } finally {
      setSubmittingReview(false);
    }
  }, [accessToken, detailText.reviewContentRequired, detailText.reviewCustomerOnly, detailText.reviewLoginRequired, detailText.reviewOrderIdRequired, detailText.reviewSubmitFailed, detailText.reviewSubmitSuccess, loadReviews, product, reviewForm.content, reviewForm.imagesInput, reviewForm.orderId, reviewForm.rating, reviewForm.title, selectedRatingFilter, user]);

  const handleQuantityChange = (next: number) => {
    if (!Number.isFinite(next) || next <= 0) {
      setQuantity(1);
      return;
    }

    setQuantity(Math.min(maxQuantity, Math.max(1, Math.floor(next))));
  };

  const handleAddToCart = () => {
    if (!product) {
      return;
    }

    const result = addToCart(
      {
        productId: product.id,
        title: selectedVariant ? `${product.title} - ${selectedVariant.name}` : product.title,
        image: selectedImage || product.image,
        unitPrice: displayPrice,
        stock: availableStock,
        sku: displaySku,
        currency: displayCurrency
      },
      quantity
    );

    setNotice(result.message ?? (result.ok ? text.product.addedToCart : text.product.loadError));
  };

  const handleBuyNow = () => {
    if (!product) {
      return;
    }

    const result = addToCart(
      {
        productId: product.id,
        title: selectedVariant ? `${product.title} - ${selectedVariant.name}` : product.title,
        image: selectedImage || product.image,
        unitPrice: displayPrice,
        stock: availableStock,
        sku: displaySku,
        currency: displayCurrency
      },
      quantity
    );

    if (!result.ok) {
      setNotice(result.message ?? text.product.loadError);
      return;
    }

    router.push('/checkout');
  };

  const handleChatNow = useCallback(async () => {
    if (!product) {
      return;
    }

    if (!accessToken || !user) {
      setNotice(detailText.chatNeedLogin);
      router.push('/login');
      return;
    }

    const normalizedRole = String(user.role).toUpperCase();
    if (normalizedRole !== 'CUSTOMER' && normalizedRole !== 'BUYER') {
      setNotice(detailText.chatCustomerOnly);
      return;
    }

    const targetSellerId = (shop?.sellerId ?? product.sellerId ?? '').trim();
    if (!targetSellerId) {
      setNotice(detailText.chatCreateFailed);
      return;
    }

    setNotice('');

    try {
      const conversation = await createBuyerChatConversation({
        accessToken,
        payload: {
          sellerId: targetSellerId,
          productId: product.id,
          shopId: targetSellerId,
          buyerName: user.name?.trim() || undefined,
          sellerName: shop?.shopName?.trim() || undefined
        }
      });

      openBuyerChatDrawer({
        conversationId: conversation.id,
        sellerId: targetSellerId,
        sellerName: shop?.shopName || undefined,
        productId: product.id
      });
    } catch (error) {
      setNotice(error instanceof BuyerApiClientError ? error.message : detailText.chatCreateFailed);
      openBuyerChatDrawer({
        sellerId: targetSellerId,
        sellerName: shop?.shopName || undefined,
        productId: product.id
      });
    }
  }, [accessToken, detailText.chatCreateFailed, detailText.chatCustomerOnly, detailText.chatNeedLogin, product, router, shop?.sellerId, shop?.shopName, user]);

  const isOutOfStock = availableStock !== null && availableStock <= 0;

  const ratingValue = useMemo(() => {
    if (!product) {
      return null;
    }

    const raw = product.attributes.rating;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 5) {
      return Math.round(raw * 10) / 10;
    }

    return null;
  }, [product]);

  const attributeEntries = useMemo(() => {
    if (!product) {
      return [];
    }

    return Object.entries(product.attributes)
      .filter(([, value]) => value !== null && value !== '')
      .map(([key, value]) => ({
        key,
        label: prettifyAttributeLabel(key, locale),
        value: formatAttributeValue(value)
      }));
  }, [locale, product]);

  const publishedReviewCount = reviewSummary?.totalReviews ?? 0;
  const reviewWithCommentCount = useMemo(
    () => reviews.filter((item) => item.content.trim().length > 0).length,
    [reviews]
  );
  const reviewWithImageCount = useMemo(
    () => reviews.filter((item) => item.images.length > 0).length,
    [reviews]
  );

  return (
    <div className="min-h-screen bg-app-bg text-slate-900">
      <Header keywords={[]} />

      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        {status === 'loading' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-slate-600">{text.product.loading}</p>
          </section>
        ) : null}

        {status === 'invalid-id' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{text.product.invalidId}</p>
            <Link href="/" className="mt-3 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
              {text.cart.continueShopping}
            </Link>
          </section>
        ) : null}

        {status === 'not-found' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{text.product.notFound}</p>
            <Link href="/" className="mt-3 inline-flex rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
              {text.cart.continueShopping}
            </Link>
          </section>
        ) : null}

        {status === 'error' ? (
          <section className="rounded-md bg-white p-6 text-center shadow-card">
            <p className="text-sm text-red-600">{errorMessage || text.product.loadError}</p>
            <button
              type="button"
              className="mt-3 rounded-md bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
              onClick={() => {
                void loadProduct();
              }}
            >
              {text.product.retry}
            </button>
          </section>
        ) : null}

        {status === 'success' && product ? (
          <section className="space-y-4">
            <section className="rounded-md bg-white p-4 shadow-card md:p-6">
              <div className="mb-4 text-sm text-slate-500">
                <Link href="/" className="font-medium text-brand-600 hover:text-brand-700">
                  {detailText.breadcrumbHome}
                </Link>{' '}
                / <span>{prettifyAttributeLabel(product.categoryId, locale)}</span> / <span>{product.title}</span>
              </div>

              <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <img
                    src={selectedImage || product.image}
                    alt={product.title}
                    className="h-[420px] w-full rounded-md border border-slate-200 object-cover"
                  />

                  <div className="grid grid-cols-5 gap-2">
                    {product.images.slice(0, 10).map((image, index) => {
                      const selected = (selectedImage || product.image) === image;
                      return (
                        <button
                          key={`${image}-${index}`}
                          type="button"
                          onClick={() => setSelectedImage(image)}
                          aria-label={`${detailText.selectImage} ${index + 1}`}
                          className={`overflow-hidden rounded border transition ${
                            selected ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200 hover:border-brand-300'
                          }`}
                        >
                          <img src={image} alt={`${product.title} ${index + 1}`} className="h-20 w-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-brand-50 px-2 py-1 font-semibold text-brand-700">eMall</span>
                    <span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-600">{product.status}</span>
                  </div>

                  <h1 className="text-2xl font-semibold leading-tight text-slate-900">{product.title}</h1>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                    {ratingValue !== null ? (
                      <p className="font-semibold text-brand-600">
                        {ratingValue} / 5 <span className="font-normal text-slate-500">{detailText.reviewsLabel}</span>
                      </p>
                    ) : null}
                    <p>
                      {detailText.sku}: <span className="font-medium text-slate-800">{displaySku ?? 'N/A'}</span>
                    </p>
                    <p>
                      {detailText.brand}: <span className="font-medium text-slate-800">{product.brand ?? 'N/A'}</span>
                    </p>
                  </div>

                  <div className="rounded-md bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-3xl font-bold text-brand-600">{formatPrice(displayPrice, displayCurrency)}</p>
                      {displayDiscountPercent > 0 ? (
                        <span className="rounded bg-brand-100 px-2 py-1 text-xs font-semibold text-brand-700">
                          -{displayDiscountPercent}% {detailText.discount}
                        </span>
                      ) : null}
                    </div>
                    {displayCompareAtPrice && displayCompareAtPrice > displayPrice ? (
                      <p className="mt-1 text-sm text-slate-500 line-through">
                        {formatPrice(displayCompareAtPrice, displayCurrency)}
                      </p>
                    ) : null}
                  </div>

                  {product.variants.length > 1 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-700">{detailText.variant}</p>
                      <div className="flex flex-wrap gap-2">
                        {product.variants.map((variant) => {
                          const active = selectedVariant?.sku === variant.sku;
                          return (
                            <button
                              key={variant.sku}
                              type="button"
                              onClick={() => setSelectedVariantSku(variant.sku)}
                              className={`rounded-md border px-3 py-2 text-sm transition ${
                                active
                                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                                  : 'border-slate-300 text-slate-700 hover:border-brand-300'
                              }`}
                            >
                              {variant.name}
                              {variant.isDefault ? ` - ${detailText.defaultVariant}` : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-2 text-sm text-slate-700">
                    <p>
                      <span className="font-semibold">{text.product.stock}: </span>
                      <span>
                        {availableStock === null
                          ? text.product.stockUnknown
                          : availableStock > 0
                            ? `${availableStock} (${detailText.inStock})`
                            : detailText.soldOut}
                      </span>
                    </p>
                    <p className="text-slate-500">{detailText.genuine}</p>
                    <p className="text-slate-500">{detailText.freeReturn}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">{text.product.quantity}</span>
                    <div className="inline-flex items-center rounded-md border border-slate-300">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(quantity - 1)}
                        className="h-10 w-10 border-r border-slate-300 text-lg text-slate-700"
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={maxQuantity}
                        value={quantity}
                        onChange={(event) => {
                          handleQuantityChange(Number(event.target.value));
                        }}
                        className="h-10 w-16 border-0 text-center text-sm font-semibold focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(quantity + 1)}
                        className="h-10 w-10 border-l border-slate-300 text-lg text-slate-700"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {notice ? <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{notice}</p> : null}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      disabled={Boolean(isOutOfStock)}
                      className="h-11 rounded-md border border-brand-500 px-6 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                    >
                      {text.product.addToCart}
                    </button>
                    <button
                      type="button"
                      onClick={handleBuyNow}
                      disabled={Boolean(isOutOfStock)}
                      className="h-11 rounded-md bg-brand-500 px-6 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {text.product.buyNow}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-md bg-white p-4 shadow-card md:p-6">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">{detailText.shopBlockTitle}</h2>

              {shopLoading ? (
                <p className="text-sm text-slate-600">{text.product.loading}</p>
              ) : null}

              {!shopLoading && shopErrorMessage ? (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{shopErrorMessage}</p>
              ) : null}

              {!shopLoading && !shopErrorMessage && shop ? (
                <article className="overflow-hidden rounded-md border border-slate-200">
                  <div className="h-1.5" style={{ backgroundColor: normalizeColor(shop.accentColor) }} />
                  <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="grid gap-3 md:grid-cols-[72px_minmax(0,1fr)] md:items-center">
                      {shop.logoUrl ? (
                        <img src={shop.logoUrl} alt={shop.shopName} className="h-[72px] w-[72px] rounded-full border border-slate-200 object-cover" />
                      ) : (
                        <div className="grid h-[72px] w-[72px] place-items-center rounded-full bg-slate-100 text-xs text-slate-500">SHOP</div>
                      )}

                      <div>
                        <p className="text-xl font-semibold text-slate-900">{shop.shopName}</p>
                        {shop.slogan ? <p className="mt-1 text-sm text-slate-600">{shop.slogan}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
                          <p>
                            {detailText.shopOnlineLabel}: <span className="font-semibold text-slate-700">{formatActiveLabel(shop.updatedAt, locale)}</span>
                          </p>
                          <p>
                            {detailText.shopUpdatedLabel}: <span className="font-semibold text-slate-700">{formatDateLabel(shop.updatedAt, locale)}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleChatNow();
                        }}
                        className="h-10 rounded-md border border-brand-500 px-4 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
                      >
                        {detailText.chatNow}
                      </button>
                      <Link
                        href={`/shops/${encodeURIComponent(product.sellerId)}`}
                        className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-600"
                      >
                        {detailText.viewShop}
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-700 md:grid-cols-2 lg:grid-cols-4">
                    <p>
                      {detailText.shopSellerLabel}:{' '}
                      <span className="font-medium text-slate-900">{shop.sellerCode || formatSellerCode(shop.sellerId)}</span>
                    </p>
                    <p>
                      {detailText.shopProductsLabel}:{' '}
                      <span className="font-medium text-slate-900">{shopProductCount ?? 0}</span>
                    </p>
                    <p>
                      {detailText.shopCategoriesLabel}:{' '}
                      <span className="font-medium text-slate-900">{shop.featuredCategories.length}</span>
                    </p>
                    <p>
                      {detailText.shopNavigationLabel}:{' '}
                      <span className="font-medium text-slate-900">{shop.navItems.length}</span>
                    </p>
                  </div>
                </article>
              ) : null}
            </section>

            {recommendationLoading || recommendedProducts.length > 0 ? (
              <RecommendationSection
                products={recommendedProducts}
                title={detailText.frequentlyBoughtTogether}
                emptyMessage={recommendationLoading ? text.product.loading : text.home.empty}
              />
            ) : null}

            <section className="rounded-md bg-white p-4 shadow-card md:p-6">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">{detailText.productInfo}</h2>

              <div className="grid gap-3 border-t border-slate-100 pt-4 text-sm md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="contents">
                  <p className="text-slate-500">{detailText.category}</p>
                  <p className="font-medium text-slate-800">{prettifyAttributeLabel(product.categoryId, locale)}</p>
                </div>
                <div className="contents">
                  <p className="text-slate-500">{detailText.brand}</p>
                  <p className="font-medium text-slate-800">{product.brand ?? 'N/A'}</p>
                </div>
                <div className="contents">
                  <p className="text-slate-500">{detailText.status}</p>
                  <p className="font-medium text-slate-800">{product.status}</p>
                </div>
                <div className="contents">
                  <p className="text-slate-500">{detailText.seller}</p>
                  <p className="font-medium text-slate-800">{product.sellerCode || formatSellerCode(product.sellerId)}</p>
                </div>
                <div className="contents">
                  <p className="text-slate-500">{detailText.createdAt}</p>
                  <p className="font-medium text-slate-800">{formatDateLabel(product.createdAt, locale)}</p>
                </div>
                <div className="contents">
                  <p className="text-slate-500">{detailText.updatedAt}</p>
                  <p className="font-medium text-slate-800">{formatDateLabel(product.updatedAt, locale)}</p>
                </div>

                {attributeEntries.length > 0 ? (
                  attributeEntries.map((entry) => (
                    <div key={entry.key} className="contents">
                      <p className="text-slate-500">{entry.label}</p>
                      <p className="font-medium text-slate-800">{entry.value}</p>
                    </div>
                  ))
                ) : (
                  <div className="contents">
                    <p className="text-slate-500">{detailText.productInfo}</p>
                    <p className="font-medium text-slate-800">{detailText.noAttributes}</p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-md bg-white p-4 shadow-card md:p-6">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">{detailText.productDescription}</h2>
              <div className="space-y-3 text-sm leading-7 text-slate-700">
                {product.description
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0)
                  .map((line, index) => (
                    <p key={`${line}-${index}`}>{line}</p>
                  ))}
                {product.description.trim().length === 0 ? <p>{detailText.noDescription}</p> : null}
              </div>
            </section>

            <section className="rounded-md bg-white p-4 shadow-card md:p-6">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">{detailText.reviewTitle}</h2>

              {!user ? (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p>{detailText.reviewLoginRequired}</p>
                  <Link href="/login" className="mt-2 inline-flex font-semibold text-brand-600 hover:text-brand-700">
                    {detailText.loginNow}
                  </Link>
                </div>
              ) : String(user.role).toUpperCase() !== 'CUSTOMER' ? (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p>{detailText.reviewCustomerOnly}</p>
                </div>
              ) : (
                <div className="mb-4 rounded-md border border-slate-200 p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-800">{detailText.submitReview}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-slate-700">
                      <span className="mb-1 block">{detailText.reviewOrderId}</span>
                      <input
                        type="text"
                        value={reviewForm.orderId}
                        onChange={(event) => setReviewForm((prev) => ({ ...prev, orderId: event.target.value }))}
                        className="h-10 w-full rounded border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      />
                    </label>

                    <label className="text-sm text-slate-700">
                      <span className="mb-1 block">{detailText.reviewRating}</span>
                      <select
                        value={String(reviewForm.rating)}
                        onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: Number(event.target.value) }))}
                        className="h-10 w-full rounded border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      >
                        {[5, 4, 3, 2, 1].map((star) => (
                          <option key={star} value={star}>
                            {star}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm text-slate-700 md:col-span-2">
                      <span className="mb-1 block">{detailText.reviewTitleField}</span>
                      <input
                        type="text"
                        value={reviewForm.title}
                        onChange={(event) => setReviewForm((prev) => ({ ...prev, title: event.target.value }))}
                        className="h-10 w-full rounded border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </label>

                    <label className="text-sm text-slate-700 md:col-span-2">
                      <span className="mb-1 block">{detailText.reviewContentField}</span>
                      <textarea
                        rows={4}
                        value={reviewForm.content}
                        onChange={(event) => setReviewForm((prev) => ({ ...prev, content: event.target.value }))}
                        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </label>

                    <label className="text-sm text-slate-700 md:col-span-2">
                      <span className="mb-1 block">{detailText.reviewImagesField}</span>
                      <input
                        type="text"
                        value={reviewForm.imagesInput}
                        onChange={(event) => setReviewForm((prev) => ({ ...prev, imagesInput: event.target.value }))}
                        className="h-10 w-full rounded border border-slate-300 px-3 text-sm focus:border-brand-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  {reviewSubmitMessage ? <p className="mt-3 text-sm text-slate-700">{reviewSubmitMessage}</p> : null}

                  <button
                    type="button"
                    disabled={submittingReview}
                    onClick={() => {
                      void handleSubmitReview();
                    }}
                    className="mt-3 rounded bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {submittingReview ? detailText.submittingReview : detailText.submitReview}
                  </button>
                </div>
              )}

              <div className="rounded-md border border-brand-100 bg-brand-50/30 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-3xl font-bold text-brand-600">
                      {(reviewSummary?.averageRating ?? 0).toFixed(1)} <span className="text-base font-medium text-brand-500">/ 5</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {publishedReviewCount} {detailText.reviewsLabel}
                    </p>
                    <div className="mt-2 text-brand-500">{renderStars(reviewSummary?.averageRating ?? 0)}</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedRatingFilter(null)}
                      className={`rounded border px-3 py-2 text-sm transition ${
                        selectedRatingFilter === null
                          ? 'border-brand-500 bg-white text-brand-600'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      {detailText.reviewAll}
                    </button>
                    {[5, 4, 3, 2, 1].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSelectedRatingFilter(star)}
                        className={`rounded border px-3 py-2 text-sm transition ${
                          selectedRatingFilter === star
                            ? 'border-brand-500 bg-white text-brand-600'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-brand-300'
                        }`}
                      >
                        {buildStarFilterLabel(star, reviewSummary?.starDistribution?.[String(star)] ?? 0, locale)}
                      </button>
                    ))}
                    <span className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                      {detailText.reviewWithComment}: {reviewWithCommentCount}
                    </span>
                    <span className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                      {detailText.reviewWithImage}: {reviewWithImageCount}
                    </span>
                  </div>
                </div>
              </div>

              {reviewLoading ? (
                <p className="mt-4 text-sm text-slate-600">{text.product.loading}</p>
              ) : null}

              {reviewError ? (
                <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{reviewError}</p>
              ) : null}

              {!reviewLoading && !reviewError && reviews.length === 0 ? (
                <p className="mt-4 text-sm text-slate-600">{detailText.reviewEmpty}</p>
              ) : null}

              {!reviewLoading && reviews.length > 0 ? (
                <div className="mt-4 divide-y divide-slate-200">
                  {reviews.map((review) => (
                    <article key={review.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{maskBuyerId(review.buyerId)}</p>
                          <p className="text-xs text-slate-500">{formatDateLabel(review.createdAt, locale)}</p>
                        </div>
                        <p className="text-sm font-semibold text-brand-600">{renderStars(review.rating)}</p>
                      </div>

                      {review.title ? <p className="mt-2 text-sm font-semibold text-slate-800">{review.title}</p> : null}
                      <p className="mt-2 text-sm leading-6 text-slate-700">{review.content}</p>

                      {review.images.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {review.images.slice(0, 6).map((image, index) => (
                            <img
                              key={`${review.id}-${index}`}
                              src={image}
                              alt={`review-${index + 1}`}
                              className="h-16 w-16 rounded border border-slate-200 object-cover"
                            />
                          ))}
                        </div>
                      ) : null}

                      {review.reply ? (
                        <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                          <p className="font-semibold text-slate-800">{detailText.sellerReply}</p>
                          <p className="mt-1">{review.reply.content}</p>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function prettifyAttributeLabel(key: string, locale: 'en' | 'vi'): string {
  const normalized = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (!normalized) {
    return locale === 'vi' ? 'Thong tin' : 'Info';
  }

  const lower = normalized.toLowerCase();
  return lower.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAttributeValue(value: string | number | boolean | null): string {
  if (value === null) {
    return 'N/A';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  return value;
}

function formatDateLabel(value: string | null, locale: 'en' | 'vi'): string {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return 'N/A';
  }

  return date.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US');
}

function extractStockFromRecord(
  source?: Record<string, string | number | boolean | null>
): number | null {
  if (!source) {
    return null;
  }

  const candidates = [
    source.stock,
    source.inventory,
    source.availableStock,
    source.availableQuantity,
    source.quantity
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      return Math.floor(candidate);
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      const parsed = Number(candidate.trim());
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.floor(parsed);
      }
    }
  }

  return null;
}

function formatActiveLabel(updatedAt: string, locale: 'en' | 'vi'): string {
  const updated = new Date(updatedAt);
  if (!Number.isFinite(updated.getTime())) {
    return locale === 'vi' ? 'N/A' : 'N/A';
  }

  const deltaMs = Date.now() - updated.getTime();
  const minutes = Math.max(0, Math.floor(deltaMs / 60000));

  if (minutes < 1) {
    return locale === 'vi' ? 'Vừa hoạt động' : 'Just active';
  }
  if (minutes < 60) {
    return locale === 'vi' ? `${minutes} phút trước` : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return locale === 'vi' ? `${hours} giờ trước` : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return locale === 'vi' ? `${days} ngày trước` : `${days}d ago`;
}

function normalizeColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : '#ee4d2d';
}

function renderStars(value: number): string {
  const rating = Math.max(0, Math.min(5, Math.round(value)));
  return `${'â˜…'.repeat(rating)}${'â˜†'.repeat(Math.max(0, 5 - rating))}`;
}

function buildStarFilterLabel(star: number, count: number, locale: 'en' | 'vi'): string {
  if (locale === 'vi') {
    return `${star} Sao (${count})`;
  }

  return `${star} Star (${count})`;
}

function maskBuyerId(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 8) {
    return normalized;
  }

  return `${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function openBuyerChatDrawer(detail: { sellerId?: string; sellerName?: string; productId?: string; conversationId?: string }) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent('buyer-chat:open', { detail }));
}
