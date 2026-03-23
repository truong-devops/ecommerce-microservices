export type LanguageCode = 'vi' | 'en' | 'ko';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
}

export const languageOptions: LanguageOption[] = [
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'en', label: 'English' },
  { code: 'ko', label: '\uD55C\uAD6D\uC5B4' }
];

export interface LocalePack {
  home: {
    sellerChannel: string;
    becomeSeller: string;
    downloadApp: string;
    connect: string;
    notification: string;
    support: string;
    account: string;
    logout: string;
    register: string;
    login: string;
    searchPlaceholder: string;
    searchButton: string;
    cart: string;
    hello: string;
    guestHint: string;
    userHint: string;
    services: { title: string; subtitle: string }[];
    keywords: string[];
    categoryTitle: string;
    categoryLabels: string[];
    flashSaleTitle: string;
    flashTitles: string[];
    viewAll: string;
    soldPrefix: string;
    hotSelling: string;
    mallTitle: string;
    mallPolicies: string[];
    mallTitles: string[];
    recommendationTitle: string;
    recommendTitles: string[];
    loadingProducts: string;
    productLoadFailed: string;
    orderNow: string;
    ordering: string;
    loginToOrder: string;
    customerOnlyOrder: string;
    orderSuccessPrefix: string;
    orderFailedPrefix: string;
    seeMoreGuest: string;
    seeMoreUser: string;
    footerTitle: string;
    footerLine1: string;
    footerLine2: string;
  };
  auth: {
    login: string;
    register: string;
    signInTitle: string;
    createAccountTitle: string;
    backHome: string;
    headline: string;
    panelSubtitle: string;
    valueProps: string[];
    loginTab: string;
    registerTab: string;
    noAccountPrefix: string;
    noAccountAction: string;
    hasAccountPrefix: string;
    hasAccountAction: string;
    email: string;
    password: string;
    passwordPlaceholder: string;
    confirmPassword: string;
    confirmPasswordPlaceholder: string;
    role: string;
    roleCustomer: string;
    roleSeller: string;
    passwordRule: string;
    mismatchPassword: string;
    registerSuccessPrefix: string;
    verifyTokenPrefix: string;
    verifyEmailNotice: string;
    verifyEmailTitle: string;
    verifyEmailHint: string;
    verifyTokenLabel: string;
    verifyTokenPlaceholder: string;
    verifyTokenRequired: string;
    verifyButton: string;
    verifySuccess: string;
    verifyAutoFailedPrefix: string;
    demoFilled: string;
    autoFillButton: string;
    autoFlowButton: string;
    autoFlowWorking: string;
    autoFlowSuccessPrefix: string;
    autoFlowNoToken: string;
    forgotPassword: string;
    showPassword: string;
    hidePassword: string;
    securityNote: string;
    agreement: string;
    qrLoginTitle: string;
    qrLoginHint: string;
    qrLoginAction: string;
    qrDemoNotice: string;
    socialOr: string;
    socialFacebook: string;
    socialGoogle: string;
    socialApple: string;
    socialDemoPrefix: string;
    submitLogin: string;
    submitRegister: string;
  };
}

export const localePacks: Record<LanguageCode, LocalePack> = {
  vi: {
    home: {
      sellerChannel: 'Kênh Người Bán',
      becomeSeller: 'Trở thành Người bán Epay',
      downloadApp: 'Tải ứng dụng',
      connect: 'Kết nối',
      notification: 'Thông báo',
      support: 'Hỗ trợ',
      account: 'Tài khoản',
      logout: 'Đăng xuất',
      register: 'Đăng ký',
      login: 'Đăng nhập',
      searchPlaceholder: 'Tìm kiếm sản phẩm, thương hiệu và tên shop',
      searchButton: 'Tìm',
      cart: 'GIỎ HÀNG',
      hello: 'Xin chào',
      guestHint: 'Khám phá trước khi đăng nhập',
      userHint: 'Mua sắm ngay hôm nay',
      services: [
        { title: 'Deal từ 1.000đ', subtitle: 'Săn giá tốt mỗi ngày' },
        { title: 'Vận chuyển nhanh', subtitle: 'Nhiều đơn vị giao hàng' },
        { title: 'Mall chính hãng', subtitle: 'Thương hiệu uy tín' },
        { title: 'Khách hàng thân thiết', subtitle: 'Tích điểm đổi quà' },
        { title: 'Mã giảm giá', subtitle: 'Ưu đãi theo khung giờ' }
      ],
      keywords: ['Điện thoại', 'Thời trang nam', 'Laptop', 'Mỹ phẩm', 'Đồ gia dụng', 'Voucher 50%'],
      categoryTitle: 'Danh mục',
      categoryLabels: [
        'Thời Trang Nam',
        'Điện Thoại',
        'Laptop',
        'Máy Ảnh',
        'Đồng Hồ',
        'Giày Dép',
        'Nhà Cửa',
        'Mỹ Phẩm',
        'Bách Hóa',
        'Xe Máy'
      ],
      flashSaleTitle: 'FLASH SALE',
      flashTitles: [
        'Áo thun nam basic',
        'Giày sneaker trắng',
        'Combo skincare mini',
        'Đầm dự tiệc nữ',
        'Kẹp tóc nữ',
        'Váy đen ngắn'
      ],
      viewAll: 'Xem tất cả',
      soldPrefix: 'Đã bán',
      hotSelling: 'Đang bán chạy',
      mallTitle: 'Epay MALL',
      mallPolicies: ['Trả hàng 15 ngày', 'Hàng chính hãng', 'Miễn phí vận chuyển'],
      mallTitles: [
        'Ưu đãi đến 50%',
        'Mua 1 được 2',
        'Mua 1 tặng 1',
        'Quà tặng đặc biệt',
        'Thương hiệu mới',
        'Sale cuối tuần',
        'Giá sốc hôm nay',
        'Mua là có quà'
      ],
      recommendationTitle: 'GỢI Ý HÔM NAY',
      recommendTitles: [
        'Gối tựa cổ cao cấp',
        'Bát sứ gia đình',
        'Đồng hồ thể thao',
        'Chăn lông mềm',
        'Bàn học gấp gọn',
        'Máy xông tinh dầu',
        'Bóng chuyền',
        'Set rổ nhựa',
        'Combo bánh mix',
        'Đèn ngủ 3D',
        'Áo lót nam',
        'Combo vitamin'
      ],
      loadingProducts: 'Đang tải sản phẩm từ backend...',
      productLoadFailed: 'Không tải được danh sách sản phẩm từ backend.',
      orderNow: 'Đặt hàng ngay',
      ordering: 'Đang đặt hàng...',
      loginToOrder: 'Đăng nhập để đặt hàng',
      customerOnlyOrder: 'Chỉ tài khoản khách hàng được đặt hàng',
      orderSuccessPrefix: 'Đặt hàng thành công. Mã đơn',
      orderFailedPrefix: 'Đặt hàng thất bại',
      seeMoreGuest: 'Đăng nhập để xem thêm sản phẩm',
      seeMoreUser: 'Bạn đã đăng nhập',
      footerTitle: 'Epay - Sàn thương mại điện tử',
      footerLine1: 'Epay là nền tảng mua sắm trực tuyến với giao diện thân thiện và nhiều ngành hàng.',
      footerLine2: 'Hệ thống gợi ý sản phẩm và flash sale giúp bạn dễ dàng săn deal tốt mỗi ngày.'
    },
    auth: {
      login: 'Đăng nhập',
      register: 'Đăng ký',
      signInTitle: 'Đăng nhập',
      createAccountTitle: 'Tạo tài khoản',
      backHome: 'Quay về trang chủ',
      headline: 'Sàn thương mại điện tử dành cho khách hàng Việt Nam.',
      panelSubtitle: 'Đăng nhập nhanh để tiếp tục mua sắm và theo dõi đơn hàng.',
      valueProps: ['Freeship đơn đầu', 'Flash sale mỗi ngày', 'Bảo mật tài khoản'],
      loginTab: 'Đăng nhập',
      registerTab: 'Đăng ký',
      noAccountPrefix: 'Chưa có tài khoản?',
      noAccountAction: 'Đăng ký',
      hasAccountPrefix: 'Đã có tài khoản?',
      hasAccountAction: 'Đăng nhập',
      email: 'Email',
      password: 'Mật khẩu',
      passwordPlaceholder: 'Nhập mật khẩu',
      confirmPassword: 'Xác nhận mật khẩu',
      confirmPasswordPlaceholder: 'Nhập lại mật khẩu',
      role: 'Vai trò',
      roleCustomer: 'Khách hàng',
      roleSeller: 'Người bán',
      passwordRule: 'Mật khẩu (tối thiểu 10 ký tự)',
      mismatchPassword: 'Mật khẩu xác nhận không khớp.',
      registerSuccessPrefix: 'Đăng ký thành công',
      verifyTokenPrefix: 'Mã xác thực dev',
      verifyEmailNotice: 'Vui lòng xác thực email trước khi đăng nhập.',
      verifyEmailTitle: 'Xác nhận email',
      verifyEmailHint: 'Dán token xác nhận để kích hoạt tài khoản.',
      verifyTokenLabel: 'Verify token',
      verifyTokenPlaceholder: 'Nhập verify token',
      verifyTokenRequired: 'Vui lòng nhập verify token.',
      verifyButton: 'Verify email',
      verifySuccess: 'Xác nhận email thành công. Bạn có thể đăng nhập.',
      verifyAutoFailedPrefix: 'Xác nhận email tự động thất bại',
      demoFilled: 'Đã điền dữ liệu test',
      autoFillButton: 'Điền nhanh dữ liệu',
      autoFlowButton: 'Kiểm tra tự động',
      autoFlowWorking: 'Đang tự động đăng ký + verify + đăng nhập...',
      autoFlowSuccessPrefix: 'Tự động đăng nhập thành công',
      autoFlowNoToken: 'Không có verify token để tự động xác nhận email.',
      forgotPassword: 'Quên mật khẩu',
      showPassword: 'Hiện',
      hidePassword: 'Ẩn',
      securityNote: 'Bảo mật tài khoản với xác thực email tự động.',
      agreement: 'Bằng cách tiếp tục, bạn đồng ý với điều khoản và chính sách bảo mật của Epay.',
      qrLoginTitle: 'Đăng nhập bằng QR',
      qrLoginHint: 'Mở ứng dụng Epay và quét mã để đăng nhập nhanh.',
      qrLoginAction: 'Quét QR',
      qrDemoNotice: 'QR login đang ở chế độ demo UI.',
      socialOr: 'HOẶC',
      socialFacebook: 'Facebook',
      socialGoogle: 'Google',
      socialApple: 'Apple',
      socialDemoPrefix: 'Đăng nhập',
      submitLogin: 'ĐĂNG NHẬP',
      submitRegister: 'TẠO TÀI KHOẢN'
    }
  },
  en: {
    home: {
      sellerChannel: 'Seller Center',
      becomeSeller: 'Become a Epay Seller',
      downloadApp: 'Download App',
      connect: 'Connect',
      notification: 'Notifications',
      support: 'Support',
      account: 'Account',
      logout: 'Log out',
      register: 'Sign up',
      login: 'Sign in',
      searchPlaceholder: 'Search for products, brands and shops',
      searchButton: 'Search',
      cart: 'CART',
      hello: 'Hello',
      guestHint: 'Explore before signing in',
      userHint: 'Start shopping now',
      services: [
        { title: 'Deals from 1,000d', subtitle: 'Daily best prices' },
        { title: 'Fast delivery', subtitle: 'Multiple carriers' },
        { title: 'Official mall', subtitle: 'Trusted brands' },
        { title: 'Loyalty perks', subtitle: 'Earn and redeem points' },
        { title: 'Promo codes', subtitle: 'Hourly discounts' }
      ],
      keywords: ['Phone', 'Menswear', 'Laptop', 'Beauty', 'Home', 'Voucher 50%'],
      categoryTitle: 'Categories',
      categoryLabels: [
        'Mens Fashion',
        'Phones',
        'Laptops',
        'Camera',
        'Watches',
        'Shoes',
        'Home Living',
        'Beauty',
        'Groceries',
        'Motorbike'
      ],
      flashSaleTitle: 'FLASH SALE',
      flashTitles: [
        'Basic men t-shirt',
        'White sneakers',
        'Mini skincare combo',
        'Party dress',
        'Hair clip set',
        'Black short dress'
      ],
      viewAll: 'View all',
      soldPrefix: 'Sold',
      hotSelling: 'Hot selling',
      mallTitle: 'Epay MALL',
      mallPolicies: ['15-day return', 'Official products', 'Free shipping'],
      mallTitles: [
        'Up to 50% off',
        'Buy 1 get 2',
        'Buy 1 get 1',
        'Special gifts',
        'New brands',
        'Weekend sale',
        'Today shock deal',
        'Gift with purchase'
      ],
      recommendationTitle: 'TODAY RECOMMENDED',
      recommendTitles: [
        'Premium neck pillow',
        'Family ceramic bowl',
        'Sport watch',
        'Soft blanket',
        'Foldable study desk',
        'Aroma diffuser',
        'Volleyball',
        'Plastic basket set',
        'Snack combo',
        '3D night lamp',
        'Mens underwear',
        'Vitamin combo'
      ],
      loadingProducts: 'Loading products from backend...',
      productLoadFailed: 'Cannot load products from backend.',
      orderNow: 'Place order',
      ordering: 'Placing order...',
      loginToOrder: 'Sign in to place order',
      customerOnlyOrder: 'Only customer account can place order',
      orderSuccessPrefix: 'Order placed. Number',
      orderFailedPrefix: 'Order failed',
      seeMoreGuest: 'Sign in to see more products',
      seeMoreUser: 'You are signed in',
      footerTitle: 'Epay - E-commerce Marketplace',
      footerLine1: 'Epay is an online shopping platform with clean UI and many product categories.',
      footerLine2: 'Recommendations, flash sale and mall sections help users find better deals every day.'
    },
    auth: {
      login: 'Sign in',
      register: 'Sign up',
      signInTitle: 'Sign in',
      createAccountTitle: 'Create account',
      backHome: 'Back to home',
      headline: 'E-commerce marketplace built for daily shopping.',
      panelSubtitle: 'Sign in quickly to continue shopping and track your orders.',
      valueProps: ['Free shipping first order', 'Daily flash deals', 'Secure account'],
      loginTab: 'Sign in',
      registerTab: 'Sign up',
      noAccountPrefix: 'No account yet?',
      noAccountAction: 'Create one',
      hasAccountPrefix: 'Already have an account?',
      hasAccountAction: 'Sign in',
      email: 'Email',
      password: 'Password',
      passwordPlaceholder: 'Enter password',
      confirmPassword: 'Confirm password',
      confirmPasswordPlaceholder: 'Re-enter password',
      role: 'Role',
      roleCustomer: 'Customer',
      roleSeller: 'Seller',
      passwordRule: 'Password (minimum 10 characters)',
      mismatchPassword: 'Password confirmation does not match.',
      registerSuccessPrefix: 'Registered successfully',
      verifyTokenPrefix: 'Dev verify token',
      verifyEmailNotice: 'Please verify your email before signing in.',
      verifyEmailTitle: 'Verify email',
      verifyEmailHint: 'Paste the verification token to activate your account.',
      verifyTokenLabel: 'Verification token',
      verifyTokenPlaceholder: 'Enter verification token',
      verifyTokenRequired: 'Please enter the verification token.',
      verifyButton: 'Verify email',
      verifySuccess: 'Email verified. You can sign in now.',
      verifyAutoFailedPrefix: 'Auto email verification failed',
      demoFilled: 'Demo credentials filled',
      autoFillButton: 'Fill demo data',
      autoFlowButton: 'Run auto test',
      autoFlowWorking: 'Running auto register + verify + sign in...',
      autoFlowSuccessPrefix: 'Auto sign in succeeded',
      autoFlowNoToken: 'No verification token returned for auto verify.',
      forgotPassword: 'Forgot password',
      showPassword: 'Show',
      hidePassword: 'Hide',
      securityNote: 'Your account is protected with automatic email verification.',
      agreement: 'By continuing, you agree to Epay terms of service and privacy policy.',
      qrLoginTitle: 'Sign in with QR',
      qrLoginHint: 'Open Epay app and scan QR for instant sign in.',
      qrLoginAction: 'Scan QR',
      qrDemoNotice: 'QR login is currently UI demo mode.',
      socialOr: 'OR',
      socialFacebook: 'Facebook',
      socialGoogle: 'Google',
      socialApple: 'Apple',
      socialDemoPrefix: 'Sign in with',
      submitLogin: 'SIGN IN',
      submitRegister: 'CREATE ACCOUNT'
    }
  },
  ko: {
    home: {
      sellerChannel: '\uD310\uB9E4\uC790 \uC13C\uD130',
      becomeSeller: 'Epay \uD310\uB9E4\uC790 \uB4F1\uB85D',
      downloadApp: '\uC571 \uB2E4\uC6B4\uB85C\uB4DC',
      connect: '\uC5F0\uACB0',
      notification: '\uC54C\uB9BC',
      support: '\uACE0\uAC1D\uC9C0\uC6D0',
      account: '\uACC4\uC815',
      logout: '\uB85C\uADF8\uC544\uC6C3',
      register: '\uD68C\uC6D0\uAC00\uC785',
      login: '\uB85C\uADF8\uC778',
      searchPlaceholder: '\uC0C1\uD488, \uBE0C\uB79C\uB4DC, \uC0C1\uC810\uC744 \uAC80\uC0C9\uD558\uC138\uC694',
      searchButton: '\uAC80\uC0C9',
      cart: '\uC7A5\uBC14\uAD6C\uB2C8',
      hello: '\uC548\uB155\uD558\uC138\uC694',
      guestHint: '\uB85C\uADF8\uC778 \uC5C6\uC774 \uBA3C\uC800 \uB458\uB7EC\uBCF4\uC138\uC694',
      userHint: '\uC9C0\uAE08 \uC1FC\uD551\uC744 \uC2DC\uC791\uD558\uC138\uC694',
      services: [
        { title: '1,000d \uD2B9\uAC00', subtitle: '\uB9E4\uC77C \uD56B\uB51C' },
        { title: '\uBE60\uB978 \uBC30\uC1A1', subtitle: '\uB2E4\uC591\uD55C \uBC30\uC1A1\uC0AC' },
        { title: '\uACF5\uC2DD \uBAB0', subtitle: '\uC2E0\uB8B0 \uAC00\uB2A5 \uBE0C\uB79C\uB4DC' },
        { title: '\uBA64\uBC84\uC2ED \uD61C\uD0DD', subtitle: '\uD3EC\uC778\uD2B8 \uC801\uB9BD/\uC0AC\uC6A9' },
        { title: '\uD560\uC778 \uCF54\uB4DC', subtitle: '\uC2DC\uAC04\uB300\uBCC4 \uCFE0\uD3F0' }
      ],
      keywords: ['\uD734\uB300\uD3F0', '\uB0A8\uC131\uC758\uB958', '\uB178\uD2B8\uBD81', '\uBDF0\uD2F0', '\uD648\uB9AC\uBE59', 'Voucher 50%'],
      categoryTitle: '\uCE74\uD14C\uACE0\uB9AC',
      categoryLabels: [
        '\uB0A8\uC131 \uD328\uC158',
        '\uD734\uB300\uD3F0',
        '\uB178\uD2B8\uBD81',
        '\uCE74\uBA54\uB77C',
        '\uC2DC\uACC4',
        '\uC2E0\uBC1C',
        '\uD648\uB9AC\uBE59',
        '\uBDF0\uD2F0',
        '\uC2DD\uB8CC\uD488',
        '\uC624\uD1A0\uBC14\uC774'
      ],
      flashSaleTitle: 'FLASH SALE',
      flashTitles: [
        '\uAE30\uBCF8 \uB0A8\uC131 \uD2F0\uC154\uCE20',
        '\uD654\uC774\uD2B8 \uC2A4\uB2C8\uCEE4\uC988',
        '\uBBF8\uB2C8 \uC2A4\uD0A8\uCF00\uC5B4 \uC138\uD2B8',
        '\uD30C\uD2F0 \uC6D0\uD53C\uC2A4',
        '\uD5E4\uC5B4 \uD074\uB9BD \uC138\uD2B8',
        '\uBE14\uB799 \uC2A4\uCEE4\uD2B8'
      ],
      viewAll: '\uC804\uCCB4 \uBCF4\uAE30',
      soldPrefix: '\uD310\uB9E4',
      hotSelling: '\uC778\uAE30 \uD310\uB9E4',
      mallTitle: 'Epay MALL',
      mallPolicies: ['15\uC77C \uBC18\uD488', '\uC815\uD488 \uBCF4\uC7A5', '\uBB34\uB8CC \uBC30\uC1A1'],
      mallTitles: [
        '\uCD5C\uB300 50% \uD560\uC778',
        '1+2 \uD589\uC0AC',
        '1+1 \uD589\uC0AC',
        '\uD2B9\uBCC4 \uC0AC\uC740\uD488',
        '\uC2E0\uADDC \uBE0C\uB79C\uB4DC',
        '\uC8FC\uB9D0 \uC138\uC77C',
        '\uC624\uB298 \uD2B9\uAC00',
        '\uAD6C\uB9E4 \uC0AC\uC740'
      ],
      recommendationTitle: '\uC624\uB298\uC758 \uCD94\uCC9C',
      recommendTitles: [
        '\uBAA9 \uBC30\uAC1C',
        '\uC138\uB77C\uBBF9 \uADF8\uB987',
        '\uC2A4\uD3EC\uCE20 \uC2DC\uACC4',
        '\uBD80\uB4DC\uB7EC\uC6B4 \uB2F4\uC694',
        '\uC811\uC774\uC2DD \uCC45\uC0C1',
        '\uC544\uB85C\uB9C8 \uB514\uD4E8\uC800',
        '\uBC30\uAD6C\uACF5',
        '\uD50C\uB77C\uC2A4\uD2F1 \uBC14\uAD6C\uB2C8',
        '\uAC04\uC2DD \uC138\uD2B8',
        '3D \uBB34\uB4DC\uB4F1',
        '\uB0A8\uC131 \uC18D\uC637',
        '\uBE44\uD0C0\uBBFC \uC138\uD2B8'
      ],
      loadingProducts: 'Loading products from backend...',
      productLoadFailed: 'Cannot load products from backend.',
      orderNow: 'Place order',
      ordering: 'Placing order...',
      loginToOrder: 'Sign in to place order',
      customerOnlyOrder: 'Only customer account can place order',
      orderSuccessPrefix: 'Order placed. Number',
      orderFailedPrefix: 'Order failed',
      seeMoreGuest: '\uB354 \uB9CE\uC740 \uC0C1\uD488\uC744 \uBCF4\uB824\uBA74 \uB85C\uADF8\uC778',
      seeMoreUser: '\uC774\uBBF8 \uB85C\uADF8\uC778\uB428',
      footerTitle: 'Epay - \uC804\uC790\uC0C1\uAC70\uB798 \uB9C8\uCF13\uD50C\uB808\uC774\uC2A4',
      footerLine1: 'Epay\uB294 \uB2E4\uC591\uD55C \uCE74\uD14C\uACE0\uB9AC\uB97C \uC81C\uACF5\uD558\uB294 \uC628\uB77C\uC778 \uC1FC\uD551 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4.',
      footerLine2: '\uCD94\uCC9C \uC0C1\uD488, \uD50C\uB798\uC2DC \uC138\uC77C, \uBAB0 \uC139\uC158\uC73C\uB85C \uB354 \uC88B\uC740 \uB531\uC744 \uCC3E\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.'
    },
    auth: {
      login: '\uB85C\uADF8\uC778',
      register: '\uD68C\uC6D0\uAC00\uC785',
      signInTitle: '\uB85C\uADF8\uC778',
      createAccountTitle: '\uACC4\uC815 \uB9CC\uB4E4\uAE30',
      backHome: '\uD648\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30',
      headline: '\uC77C\uC0C1 \uC1FC\uD551\uC744 \uC704\uD55C \uC804\uC790\uC0C1\uAC70\uB798 \uD50C\uB7AB\uD3FC\uC785\uB2C8\uB2E4.',
      panelSubtitle: '\uBE60\uB974\uAC8C \uB85C\uADF8\uC778\uD558\uACE0 \uC8FC\uBB38\uC744 \uD655\uC778\uD558\uC138\uC694.',
      valueProps: ['\uCCAB \uC8FC\uBB38 \uBB34\uB8CC \uBC30\uC1A1', '\uB9E4\uC77C \uD50C\uB798\uC2DC \uC138\uC77C', '\uACC4\uC815 \uBCF4\uC548 \uAC15\uD654'],
      loginTab: '\uB85C\uADF8\uC778',
      registerTab: '\uD68C\uC6D0\uAC00\uC785',
      noAccountPrefix: '\uACC4\uC815\uC774 \uC5C6\uC73C\uC2E0\uAC00\uC694?',
      noAccountAction: '\uD68C\uC6D0\uAC00\uC785',
      hasAccountPrefix: '\uC774\uBBF8 \uACC4\uC815\uC774 \uC788\uC73C\uC2E0\uAC00\uC694?',
      hasAccountAction: '\uB85C\uADF8\uC778',
      email: '\uC774\uBA54\uC77C',
      password: '\uBE44\uBC00\uBC88\uD638',
      passwordPlaceholder: '\uBE44\uBC00\uBC88\uD638 \uC785\uB825',
      confirmPassword: '\uBE44\uBC00\uBC88\uD638 \uD655\uC778',
      confirmPasswordPlaceholder: '\uBE44\uBC00\uBC88\uD638 \uB2E4\uC2DC \uC785\uB825',
      role: '\uC5ED\uD560',
      roleCustomer: '\uACE0\uAC1D',
      roleSeller: '\uD310\uB9E4\uC790',
      passwordRule: '\uBE44\uBC00\uBC88\uD638 (\uCD5C\uC18C 10\uC790)',
      mismatchPassword: '\uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.',
      registerSuccessPrefix: '\uD68C\uC6D0\uAC00\uC785 \uC644\uB8CC',
      verifyTokenPrefix: '\uAC1C\uBC1C \uAC80\uC99D \uD1A0\uD070',
      verifyEmailNotice: '\uB85C\uADF8\uC778 \uC804\uC5D0 \uC774\uBA54\uC77C \uC778\uC99D\uC744 \uC644\uB8CC\uD574 \uC8FC\uC138\uC694.',
      verifyEmailTitle: '\uC774\uBA54\uC77C \uC778\uC99D',
      verifyEmailHint: '\uACC4\uC815 \uD65C\uC131\uD654\uB97C \uC704\uD574 \uC778\uC99D \uD1A0\uD070\uC744 \uC785\uB825\uD558\uC138\uC694.',
      verifyTokenLabel: '\uC778\uC99D \uD1A0\uD070',
      verifyTokenPlaceholder: '\uC778\uC99D \uD1A0\uD070 \uC785\uB825',
      verifyTokenRequired: '\uC778\uC99D \uD1A0\uD070\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.',
      verifyButton: '\uC774\uBA54\uC77C \uC778\uC99D',
      verifySuccess: '\uC774\uBA54\uC77C \uC778\uC99D \uC644\uB8CC. \uC774\uC81C \uB85C\uADF8\uC778 \uAC00\uB2A5\uD569\uB2C8\uB2E4.',
      verifyAutoFailedPrefix: '\uC790\uB3D9 \uC774\uBA54\uC77C \uC778\uC99D \uC2E4\uD328',
      demoFilled: '\uD14C\uC2A4\uD2B8 \uC815\uBCF4 \uC790\uB3D9 \uC785\uB825',
      autoFillButton: '\uD14C\uC2A4\uD2B8 \uB370\uC774\uD130 \uC785\uB825',
      autoFlowButton: '\uC790\uB3D9 \uD14C\uC2A4\uD2B8',
      autoFlowWorking: '\uD68C\uC6D0\uAC00\uC785 + \uC778\uC99D + \uB85C\uADF8\uC778 \uC790\uB3D9 \uC9C4\uD589 \uC911...',
      autoFlowSuccessPrefix: '\uC790\uB3D9 \uB85C\uADF8\uC778 \uC131\uACF5',
      autoFlowNoToken: '\uC790\uB3D9 \uC778\uC99D\uC6A9 \uD1A0\uD070\uC774 \uBC18\uD658\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.',
      forgotPassword: '\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30',
      showPassword: '\uD45C\uC2DC',
      hidePassword: '\uC228\uAE30\uAE30',
      securityNote: '\uACC4\uC815\uC740 \uC790\uB3D9 \uC774\uBA54\uC77C \uC778\uC99D\uC73C\uB85C \uBCF4\uD638\uB429\uB2C8\uB2E4.',
      agreement: '\uACC4\uC18D\uD558\uBA74 Epay \uC57D\uAD00\uACFC \uAC1C\uC778\uC815\uBCF4 \uCC98\uB9AC\uBC29\uCE68\uC5D0 \uB3D9\uC758\uD558\uAC8C \uB429\uB2C8\uB2E4.',
      qrLoginTitle: 'QR \uB85C\uADF8\uC778',
      qrLoginHint: 'Epay \uC571\uC5D0\uC11C QR\uC744 \uC2A4\uCE94\uD558\uC5EC \uBE60\uB978 \uB85C\uADF8\uC778.',
      qrLoginAction: 'QR \uC2A4\uCE94',
      qrDemoNotice: 'QR \uB85C\uADF8\uC778\uC740 UI \uB370\uBAA8 \uBAA8\uB4DC\uC785\uB2C8\uB2E4.',
      socialOr: '\uB610\uB294',
      socialFacebook: 'Facebook',
      socialGoogle: 'Google',
      socialApple: 'Apple',
      socialDemoPrefix: '\uB2E4\uC74C\uC73C\uB85C \uB85C\uADF8\uC778',
      submitLogin: '\uB85C\uADF8\uC778',
      submitRegister: '\uACC4\uC815 \uC0DD\uC131'
    }
  }
};

