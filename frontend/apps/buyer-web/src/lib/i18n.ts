export type Locale = 'en' | 'vi';

export interface AppMessages {
  header: {
    sellerCenter: string;
    downloadApp: string;
    connect: string;
    notifications: string;
    support: string;
    language: string;
    searchPlaceholder: string;
    searchButton: string;
    account: string;
    login: string;
    register: string;
    logout: string;
    cart: string;
    orders: string;
  };
  home: {
    flashSaleTitle: string;
    mallTitle: string;
    topSearchTitle: string;
    recommendationTitle: string;
    viewAll: string;
    seeAllOffers: string;
    soldLabel: string;
    campaignTitle: string;
    campaignDescription: string;
    loading: string;
    loadError: string;
    retry: string;
    empty: string;
  };
  auth: {
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    email: string;
    password: string;
    name: string;
    confirmPassword: string;
    submitLogin: string;
    submitRegister: string;
    noAccount: string;
    haveAccount: string;
    goRegister: string;
    goLogin: string;
    passwordMismatch: string;
    invalidCredentials: string;
    emailExists: string;
    requiredFields: string;
    loginToContinue: string;
  };
  account: {
    title: string;
    subtitle: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    memberSince: string;
    save: string;
    saveSuccess: string;
    logout: string;
    protectedHint: string;
    loading: string;
  };
  product: {
    loading: string;
    loadError: string;
    retry: string;
    invalidId: string;
    notFound: string;
    description: string;
    stock: string;
    stockUnknown: string;
    stockOut: string;
    quantity: string;
    addToCart: string;
    buyNow: string;
    addedToCart: string;
    maxStockReached: string;
    invalidQuantity: string;
  };
  cart: {
    title: string;
    empty: string;
    continueShopping: string;
    price: string;
    quantity: string;
    subtotal: string;
    total: string;
    remove: string;
    clear: string;
    checkout: string;
    placingOrder: string;
    checkoutLoginRequired: string;
    orderPlaced: string;
    checkoutFailed: string;
    goToOrders: string;
  };
  orders: {
    title: string;
    subtitle: string;
    loginRequired: string;
    searchPlaceholder: string;
    retry: string;
    loading: string;
    empty: string;
    all: string;
    pendingPayment: string;
    shipping: string;
    waitingDelivery: string;
    completed: string;
    cancelled: string;
    returnRefund: string;
    orderCode: string;
    orderedAt: string;
    quantity: string;
    total: string;
    itemCount: string;
    noItem: string;
    statusPending: string;
    statusConfirmed: string;
    statusProcessing: string;
    statusShipped: string;
    statusDelivered: string;
    statusCancelled: string;
    statusFailed: string;
    actionCancel: string;
    actionConfirmReceived: string;
    actionBuyAgain: string;
    actionDetail: string;
    cancelSuccess: string;
    confirmSuccess: string;
    actionFailed: string;
    invalidData: string;
  };
}

export const messages: Record<Locale, AppMessages> = {
  en: {
    header: {
      sellerCenter: 'Seller Centre',
      downloadApp: 'Download App',
      connect: 'Connect',
      notifications: 'Notifications',
      support: 'Support',
      language: 'Language',
      searchPlaceholder: 'Search deals, gadgets, fashion, and more',
      searchButton: 'Search',
      account: 'Account',
      login: 'Login',
      register: 'Register',
      logout: 'Logout',
      cart: 'Open shopping cart',
      orders: 'My orders'
    },
    home: {
      flashSaleTitle: 'Flash Sale',
      mallTitle: 'Mall Highlights',
      topSearchTitle: 'Top Search',
      recommendationTitle: 'Recommendations For You',
      viewAll: 'View all',
      seeAllOffers: 'See all offers',
      soldLabel: 'Sold',
      campaignTitle: 'Hot Deal Week',
      campaignDescription: 'Save up to 50% with stacked vouchers and free shipping from official stores.',
      loading: 'Loading products...',
      loadError: 'Cannot load product data right now.',
      retry: 'Retry',
      empty: 'No products available yet.'
    },
    auth: {
      loginTitle: 'Buyer Login',
      loginSubtitle: 'Sign in to continue shopping and manage your account.',
      registerTitle: 'Create Buyer Account',
      registerSubtitle: 'Register in seconds to track orders and save your profile.',
      email: 'Email',
      password: 'Password',
      name: 'Full name',
      confirmPassword: 'Confirm password',
      submitLogin: 'Login',
      submitRegister: 'Register',
      noAccount: "Don't have an account?",
      haveAccount: 'Already have an account?',
      goRegister: 'Create one',
      goLogin: 'Sign in',
      passwordMismatch: 'Password confirmation does not match.',
      invalidCredentials: 'Invalid email or password.',
      emailExists: 'Email is already registered.',
      requiredFields: 'Please fill in all required fields.',
      loginToContinue: 'Please login to continue.'
    },
    account: {
      title: 'My Account',
      subtitle: 'Manage your buyer profile information.',
      name: 'Full name',
      email: 'Email',
      phone: 'Phone number',
      address: 'Address',
      memberSince: 'Member since',
      save: 'Save changes',
      saveSuccess: 'Profile updated successfully.',
      logout: 'Logout',
      protectedHint: 'Please login first to access account settings.',
      loading: 'Loading account...'
    },
    product: {
      loading: 'Loading product details...',
      loadError: 'Cannot load product details right now.',
      retry: 'Retry',
      invalidId: 'Invalid product identifier.',
      notFound: 'Product not found.',
      description: 'Description',
      stock: 'Stock',
      stockUnknown: 'Updating',
      stockOut: 'Out of stock',
      quantity: 'Quantity',
      addToCart: 'Add to Cart',
      buyNow: 'Buy Now',
      addedToCart: 'Product added to cart.',
      maxStockReached: 'Quantity reached stock limit.',
      invalidQuantity: 'Invalid quantity.'
    },
    cart: {
      title: 'Shopping Cart',
      empty: 'Your cart is empty.',
      continueShopping: 'Continue shopping',
      price: 'Price',
      quantity: 'Quantity',
      subtotal: 'Subtotal',
      total: 'Total',
      remove: 'Remove',
      clear: 'Clear cart',
      checkout: 'Place order',
      placingOrder: 'Placing order...',
      checkoutLoginRequired: 'Please login before checkout.',
      orderPlaced: 'Order placed successfully.',
      checkoutFailed: 'Cannot place order right now.',
      goToOrders: 'Track my orders'
    },
    orders: {
      title: 'My Orders',
      subtitle: 'Track shipping status and manage your order actions.',
      loginRequired: 'Please login to view your order history.',
      searchPlaceholder: 'Search by order code, product name, or shop',
      retry: 'Retry',
      loading: 'Loading your orders...',
      empty: 'No orders found.',
      all: 'All',
      pendingPayment: 'Pending Payment',
      shipping: 'Shipping',
      waitingDelivery: 'Out for Delivery',
      completed: 'Completed',
      cancelled: 'Cancelled',
      returnRefund: 'Return / Refund',
      orderCode: 'Order code',
      orderedAt: 'Ordered at',
      quantity: 'Quantity',
      total: 'Total',
      itemCount: 'Items',
      noItem: 'No items found in this order.',
      statusPending: 'Pending payment',
      statusConfirmed: 'Order confirmed',
      statusProcessing: 'Preparing shipment',
      statusShipped: 'In transit',
      statusDelivered: 'Completed',
      statusCancelled: 'Cancelled',
      statusFailed: 'Payment failed',
      actionCancel: 'Cancel Order',
      actionConfirmReceived: 'Confirm Received',
      actionBuyAgain: 'Buy Again',
      actionDetail: 'View Details',
      cancelSuccess: 'Order cancelled successfully.',
      confirmSuccess: 'Order marked as delivered.',
      actionFailed: 'Action failed. Please try again.',
      invalidData: 'Order data is invalid.'
    }
  },
  vi: {
    header: {
      sellerCenter: 'Kênh Người Bán',
      downloadApp: 'Tải ứng dụng',
      connect: 'Kết nối',
      notifications: 'Thông báo',
      support: 'Hỗ trợ',
      language: 'Ngôn ngữ',
      searchPlaceholder: 'Tìm deal, đồ công nghệ, thời trang và hơn thế nữa',
      searchButton: 'Tìm kiếm',
      account: 'Tài khoản',
      login: 'Đăng nhập',
      register: 'Đăng ký',
      logout: 'Đăng xuất',
      cart: 'Mở giỏ hàng',
      orders: 'Đơn mua'
    },
    home: {
      flashSaleTitle: 'Flash Sale',
      mallTitle: 'Mall Nổi Bật',
      topSearchTitle: 'Tìm Kiếm Hàng Đầu',
      recommendationTitle: 'Gợi Ý Hôm Nay',
      viewAll: 'Xem tất cả',
      seeAllOffers: 'Xem ưu đãi',
      soldLabel: 'Đã bán',
      campaignTitle: 'Tuần Lễ Săn Deal',
      campaignDescription: 'Giảm đến 50% kèm voucher và miễn phí vận chuyển từ gian hàng chính hãng.',
      loading: 'Đang tải sản phẩm...',
      loadError: 'Chưa thể tải dữ liệu sản phẩm lúc này.',
      retry: 'Thử lại',
      empty: 'Chưa có sản phẩm để hiển thị.'
    },
    auth: {
      loginTitle: 'Đăng Nhập Người Mua',
      loginSubtitle: 'Đăng nhập để tiếp tục mua sắm và quản lý tài khoản.',
      registerTitle: 'Tạo Tài Khoản Người Mua',
      registerSubtitle: 'Đăng ký nhanh để theo dõi đơn hàng và lưu thông tin cá nhân.',
      email: 'Email',
      password: 'Mật khẩu',
      name: 'Họ và tên',
      confirmPassword: 'Xác nhận mật khẩu',
      submitLogin: 'Đăng nhập',
      submitRegister: 'Đăng ký',
      noAccount: 'Chưa có tài khoản?',
      haveAccount: 'Đã có tài khoản?',
      goRegister: 'Tạo tài khoản',
      goLogin: 'Đăng nhập ngay',
      passwordMismatch: 'Mật khẩu xác nhận không khớp.',
      invalidCredentials: 'Email hoặc mật khẩu không đúng.',
      emailExists: 'Email đã được đăng ký.',
      requiredFields: 'Vui lòng nhập đầy đủ thông tin bắt buộc.',
      loginToContinue: 'Vui lòng đăng nhập để tiếp tục.'
    },
    account: {
      title: 'Tài Khoản Của Tôi',
      subtitle: 'Quản lý thông tin hồ sơ người mua.',
      name: 'Họ và tên',
      email: 'Email',
      phone: 'Số điện thoại',
      address: 'Địa chỉ',
      memberSince: 'Tham gia từ',
      save: 'Lưu thay đổi',
      saveSuccess: 'Cập nhật hồ sơ thành công.',
      logout: 'Đăng xuất',
      protectedHint: 'Vui lòng đăng nhập để truy cập trang tài khoản.',
      loading: 'Đang tải tài khoản...'
    },
    product: {
      loading: 'Đang tải chi tiết sản phẩm...',
      loadError: 'Không thể tải chi tiết sản phẩm lúc này.',
      retry: 'Thử lại',
      invalidId: 'Mã sản phẩm không hợp lệ.',
      notFound: 'Không tìm thấy sản phẩm.',
      description: 'Mô tả',
      stock: 'Tồn kho',
      stockUnknown: 'Đang cập nhật',
      stockOut: 'Hết hàng',
      quantity: 'Số lượng',
      addToCart: 'Thêm vào giỏ hàng',
      buyNow: 'Mua ngay',
      addedToCart: 'Đã thêm sản phẩm vào giỏ hàng.',
      maxStockReached: 'Số lượng đã chạm giới hạn tồn kho.',
      invalidQuantity: 'Số lượng không hợp lệ.'
    },
    cart: {
      title: 'Giỏ Hàng',
      empty: 'Giỏ hàng đang trống.',
      continueShopping: 'Tiếp tục mua sắm',
      price: 'Giá',
      quantity: 'Số lượng',
      subtotal: 'Tạm tính',
      total: 'Tổng tiền',
      remove: 'Xóa',
      clear: 'Xóa giỏ hàng',
      checkout: 'Đặt hàng',
      placingOrder: 'Đang đặt hàng...',
      checkoutLoginRequired: 'Vui lòng đăng nhập trước khi thanh toán.',
      orderPlaced: 'Đặt hàng thành công.',
      checkoutFailed: 'Không thể đặt hàng lúc này.',
      goToOrders: 'Theo dõi đơn mua'
    },
    orders: {
      title: 'Theo Dõi Đơn Mua',
      subtitle: 'Theo dõi trạng thái giao hàng và thao tác trên đơn của bạn.',
      loginRequired: 'Vui lòng đăng nhập để xem đơn mua.',
      searchPlaceholder: 'Bạn có thể tìm theo mã đơn, tên sản phẩm hoặc tên shop',
      retry: 'Thử lại',
      loading: 'Đang tải danh sách đơn hàng...',
      empty: 'Chưa có đơn hàng phù hợp.',
      all: 'Tất cả',
      pendingPayment: 'Chờ thanh toán',
      shipping: 'Vận chuyển',
      waitingDelivery: 'Chờ giao hàng',
      completed: 'Hoàn thành',
      cancelled: 'Đã hủy',
      returnRefund: 'Trả hàng/Hoàn tiền',
      orderCode: 'Mã đơn',
      orderedAt: 'Đặt lúc',
      quantity: 'Số lượng',
      total: 'Thành tiền',
      itemCount: 'Sản phẩm',
      noItem: 'Đơn hàng chưa có sản phẩm.',
      statusPending: 'Chờ thanh toán',
      statusConfirmed: 'Đã xác nhận',
      statusProcessing: 'Đang chuẩn bị hàng',
      statusShipped: 'Đang giao hàng',
      statusDelivered: 'HOÀN THÀNH',
      statusCancelled: 'ĐÃ HỦY',
      statusFailed: 'THANH TOÁN LỖI',
      actionCancel: 'Hủy đơn',
      actionConfirmReceived: 'Đã nhận hàng',
      actionBuyAgain: 'Mua lại',
      actionDetail: 'Xem chi tiết',
      cancelSuccess: 'Hủy đơn thành công.',
      confirmSuccess: 'Đã xác nhận nhận hàng.',
      actionFailed: 'Thao tác thất bại. Vui lòng thử lại.',
      invalidData: 'Dữ liệu đơn hàng không hợp lệ.'
    }
  }
};
