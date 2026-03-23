import { StyleSheet } from 'react-native';

export const homeStyles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#f5f5f5'
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 90
  },
  page: {
    flex: 1,
    paddingBottom: 24
  },
  centerContainer: {
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: 16
  },

  headerWrap: {
    backgroundColor: '#fb5533',
    paddingBottom: 12,
    zIndex: 80
  },
  utilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    zIndex: 120
  },
  utilityLeft: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
  },
  utilityRight: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  utilityText: {
    color: '#ffe8df',
    fontSize: 12,
    marginRight: 14,
    marginBottom: 4,
    fontFamily: 'Trebuchet MS'
  },
  accountText: {
    color: '#ffffff',
    fontSize: 12,
    marginRight: 8,
    marginBottom: 4,
    maxWidth: 180,
    fontFamily: 'Trebuchet MS'
  },
  utilityAuthButton: {
    borderWidth: 1,
    borderColor: '#ffd3c3',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 8,
    marginBottom: 4
  },
  utilityAuthButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },

  languageWrap: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 4,
    zIndex: 220
  },
  languageButton: {
    borderWidth: 1,
    borderColor: '#ffd3c3',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  languageButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  languageMenu: {
    position: 'absolute',
    top: 34,
    right: 0,
    minWidth: 140,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 25,
    zIndex: 300
  },
  languageMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  languageMenuItemActive: {
    backgroundColor: '#fff3ee'
  },
  languageMenuText: {
    color: '#272727',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },

  searchRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  brandWrap: {
    width: 210,
    flexDirection: 'row',
    alignItems: 'center'
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  brandMarkText: {
    color: '#ee4d2d',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  brandText: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  searchArea: {
    flex: 1,
    paddingHorizontal: 12
  },
  searchInputRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 2,
    overflow: 'hidden'
  },
  searchInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    color: '#2f2f2f',
    fontSize: 14,
    fontFamily: 'Trebuchet MS'
  },
  searchButton: {
    width: 72,
    margin: 3,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fb5533'
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  keywordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6
  },
  keywordText: {
    color: '#ffe7dd',
    fontSize: 12,
    marginRight: 12,
    marginBottom: 4,
    fontFamily: 'Trebuchet MS'
  },
  cartWrap: {
    width: 110,
    alignItems: 'flex-end',
    justifyContent: 'center'
  },
  cartIcon: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  cartBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    paddingHorizontal: 4
  },
  cartBadgeText: {
    color: '#ee4d2d',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },

  noticeWrap: {
    marginTop: 10
  },
  noticeSuccessText: {
    backgroundColor: '#ecf9f0',
    borderWidth: 1,
    borderColor: '#b8e3c8',
    color: '#226941',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'Trebuchet MS'
  },
  noticeErrorText: {
    backgroundColor: '#fff2ef',
    borderWidth: 1,
    borderColor: '#f2c0b4',
    color: '#b13b1f',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: 'Trebuchet MS'
  },

  searchPageWrap: {
    marginTop: 12
  },
  heroRow: {
    flexDirection: 'row',
    marginBottom: 12
  },
  heroMainImage: {
    flex: 1,
    minHeight: 240,
    borderRadius: 4,
    backgroundColor: '#f2f2f2'
  },
  heroSideColumn: {
    width: 320,
    marginLeft: 10
  },
  heroSideImage: {
    flex: 1,
    marginBottom: 10,
    borderRadius: 4,
    backgroundColor: '#f2f2f2'
  },
  categoryStrip: {
    backgroundColor: '#ffffff',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#efefef',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12
  },
  categoryItem: {
    width: '20%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f1f1'
  },
  categoryImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f2f2f2'
  },
  categoryText: {
    marginTop: 8,
    fontSize: 12,
    color: '#2f2f2f',
    textAlign: 'center',
    paddingHorizontal: 8,
    fontFamily: 'Trebuchet MS'
  },
  serviceHighlightRow: {
    backgroundColor: '#ffffff',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#efefef',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    paddingVertical: 8
  },
  serviceHighlightItem: {
    width: '20%',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  serviceHighlightTitle: {
    color: '#1f1f1f',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: 'Trebuchet MS'
  },
  serviceHighlightSub: {
    marginTop: 4,
    color: '#8a8a8a',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Trebuchet MS'
  },

  resultLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  filterColumn: {
    width: 220,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#efefef',
    paddingHorizontal: 12,
    paddingVertical: 14
  },
  filterTitle: {
    fontSize: 22,
    color: '#222222',
    fontWeight: '700',
    marginBottom: 10,
    fontFamily: 'Trebuchet MS'
  },
  filterSubTitle: {
    fontSize: 14,
    color: '#333333',
    fontWeight: '700',
    marginBottom: 8,
    fontFamily: 'Trebuchet MS'
  },
  filterSubTitleSpacing: {
    marginTop: 14
  },
  filterOption: {
    fontSize: 13,
    color: '#585858',
    marginBottom: 8,
    fontFamily: 'Trebuchet MS'
  },
  filterOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    paddingVertical: 3
  },
  filterCheckBox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#cfcfcf',
    borderRadius: 2,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff'
  },
  filterCheckBoxActive: {
    borderColor: '#ee4d2d',
    backgroundColor: '#fff1ec'
  },
  filterCheckMark: {
    color: '#ee4d2d',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    fontFamily: 'Trebuchet MS'
  },

  resultColumn: {
    flex: 1,
    marginLeft: 12
  },
  relatedShopBox: {
    backgroundColor: '#ffffff',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#efefef',
    padding: 12,
    marginBottom: 12
  },
  relatedTitle: {
    fontSize: 22,
    color: '#2a2a2a',
    fontWeight: '700',
    marginBottom: 10,
    fontFamily: 'Trebuchet MS'
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  relatedProductItem: {
    width: 94,
    marginRight: 8,
    marginBottom: 8
  },
  relatedImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    backgroundColor: '#f2f2f2'
  },
  relatedPrice: {
    marginTop: 4,
    fontSize: 12,
    color: '#ee4d2d',
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  relatedShopButton: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: '#ee4d2d',
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  relatedShopButtonText: {
    color: '#ee4d2d',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },

  sortRow: {
    backgroundColor: '#f5f5f5',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#efefef',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    flexWrap: 'wrap'
  },
  sortLabel: {
    fontSize: 13,
    color: '#666666',
    marginRight: 8,
    fontFamily: 'Trebuchet MS'
  },
  sortChip: {
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 6,
    marginBottom: 4
  },
  sortChipActive: {
    borderColor: '#ee4d2d',
    backgroundColor: '#fff1ec'
  },
  sortChipText: {
    fontSize: 13,
    color: '#333333',
    fontFamily: 'Trebuchet MS'
  },
  sortChipTextActive: {
    color: '#ee4d2d',
    fontWeight: '700'
  },
  resultTitle: {
    marginTop: 12,
    marginBottom: 10,
    fontSize: 15,
    color: '#444444',
    fontFamily: 'Trebuchet MS'
  },
  loadingWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  apiErrorText: {
    color: '#b4371d',
    fontWeight: '700',
    marginBottom: 10,
    fontFamily: 'Trebuchet MS'
  },
  noResultBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f0d4cb',
    borderRadius: 4,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
    alignItems: 'center'
  },
  noResultTitle: {
    color: '#bf4829',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  noResultHint: {
    color: '#7a6a64',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    fontFamily: 'Trebuchet MS'
  },

  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4
  },
  productCard: {
    paddingHorizontal: 4,
    marginBottom: 10
  },
  productBody: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#ededed',
    padding: 8,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#f2f2f2',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2
  },
  productName: {
    fontSize: 13,
    color: '#2d2d2d',
    minHeight: 34,
    fontFamily: 'Trebuchet MS'
  },
  productBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  mallBadge: {
    color: '#ee4d2d',
    fontSize: 10,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#ee4d2d',
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    fontFamily: 'Trebuchet MS'
  },
  discountBadge: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#f94a2d',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontFamily: 'Trebuchet MS'
  },
  productPrice: {
    marginTop: 6,
    color: '#ee4d2d',
    fontWeight: '700',
    fontSize: 16,
    fontFamily: 'Trebuchet MS'
  },
  productSold: {
    marginTop: 4,
    color: '#8a8a8a',
    fontSize: 12,
    fontFamily: 'Trebuchet MS'
  },
  productActionRow: {
    marginTop: 8,
    flexDirection: 'row'
  },
  detailButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#f1c4b6',
    borderRadius: 2,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: '#fff8f5',
    marginRight: 6
  },
  detailButtonDisabled: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 2,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: '#fafafa'
  },
  detailButtonText: {
    color: '#d15236',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  addButton: {
    flex: 1,
    borderRadius: 2,
    paddingVertical: 7,
    alignItems: 'center',
    backgroundColor: '#ee4d2d'
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  actionDisabled: {
    opacity: 0.55
  },
  chatSellerButton: {
    marginTop: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#f2cabd',
    backgroundColor: '#fff8f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7
  },
  chatSellerButtonText: {
    color: '#d25337',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },

  detailPageWrap: {
    marginTop: 14
  },
  detailBreadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  backToSearchText: {
    fontSize: 13,
    color: '#2978d8',
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  breadcrumbName: {
    fontSize: 13,
    color: '#444444',
    fontFamily: 'Trebuchet MS'
  },
  detailCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 2,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  detailImageColumn: {
    width: 380,
    maxWidth: '100%'
  },
  detailMainImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    backgroundColor: '#f2f2f2'
  },
  detailMainImageFallback: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 4,
    backgroundColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center'
  },
  detailMainImageFallbackText: {
    color: '#7b7b7b',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },
  thumbnailRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  thumbnailButton: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderColor: '#ebebeb',
    borderRadius: 2,
    marginRight: 8,
    marginBottom: 8,
    overflow: 'hidden'
  },
  thumbnailButtonActive: {
    borderColor: '#ee4d2d'
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f2f2f2'
  },
  detailInfoColumn: {
    flex: 1,
    minWidth: 300,
    paddingLeft: 14
  },
  detailTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  detailTagFavorite: {
    color: '#ffffff',
    backgroundColor: '#ee4d2d',
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginRight: 8,
    fontFamily: 'Trebuchet MS'
  },
  detailTagMall: {
    color: '#ee4d2d',
    borderColor: '#ee4d2d',
    borderWidth: 1,
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontFamily: 'Trebuchet MS'
  },
  detailName: {
    fontSize: 27,
    color: '#252525',
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8
  },
  detailMetaText: {
    fontSize: 14,
    color: '#444444',
    fontFamily: 'Trebuchet MS'
  },
  detailMetaDivider: {
    marginHorizontal: 8,
    color: '#adadad'
  },
  detailPricePanel: {
    marginTop: 12,
    backgroundColor: '#faf4f2',
    borderRadius: 2,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  detailPriceTopRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  detailOldPriceText: {
    color: '#8f8f8f',
    fontSize: 18,
    textDecorationLine: 'line-through',
    marginRight: 8,
    fontFamily: 'Trebuchet MS'
  },
  detailDiscountBadge: {
    color: '#ee4d2d',
    backgroundColor: '#ffede8',
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  detailPriceText: {
    color: '#ee4d2d',
    fontWeight: '800',
    fontSize: 32,
    fontFamily: 'Trebuchet MS'
  },
  detailInfoList: {
    marginTop: 6
  },
  shippingText: {
    marginTop: 10,
    color: '#555555',
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Trebuchet MS'
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14
  },
  quantityLabel: {
    width: 90,
    color: '#666666',
    fontSize: 14,
    fontFamily: 'Trebuchet MS'
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: '#dbdbdb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  qtyButtonText: {
    color: '#333333',
    fontSize: 18,
    fontFamily: 'Trebuchet MS'
  },
  qtyValue: {
    width: 46,
    textAlign: 'center',
    fontSize: 14,
    color: '#222222',
    fontFamily: 'Trebuchet MS'
  },
  detailStockText: {
    marginLeft: 12,
    color: '#2f8f2f',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  detailActionRow: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  detailAddButton: {
    minWidth: 180,
    marginRight: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ee4d2d',
    backgroundColor: '#fff2ee',
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12
  },
  detailAddButtonText: {
    color: '#d84a2e',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  detailBuyButton: {
    minWidth: 180,
    marginBottom: 8,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ee4d2d',
    paddingVertical: 11,
    paddingHorizontal: 12
  },
  detailBuyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  detailChatButton: {
    minWidth: 180,
    marginBottom: 8,
    marginRight: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#f3c5b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff8f6',
    paddingVertical: 11,
    paddingHorizontal: 12
  },
  detailChatButtonText: {
    color: '#d25337',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  detailDescriptionBox: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 2,
    padding: 14
  },
  detailDescriptionTitle: {
    color: '#2b2b2b',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
    fontFamily: 'Trebuchet MS'
  },
  detailDescriptionText: {
    color: '#4f4f4f',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Trebuchet MS'
  },
  detailShopCard: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 2,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  detailShopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  detailShopAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ee4d2d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  detailShopAvatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  detailShopName: {
    color: '#242424',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  detailShopStatus: {
    marginTop: 4,
    color: '#7a7a7a',
    fontSize: 12,
    fontFamily: 'Trebuchet MS'
  },
  detailShopStatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  detailShopStat: {
    color: '#444444',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },

  cartPageWrap: {
    marginTop: 14
  },
  cartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  cartHeaderTitle: {
    color: '#212121',
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  cartLoginBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 2,
    padding: 16,
    alignItems: 'center'
  },
  cartLoginText: {
    color: '#5c5c5c',
    fontSize: 14,
    marginBottom: 10,
    fontFamily: 'Trebuchet MS'
  },
  cartLoginButton: {
    backgroundColor: '#ee4d2d',
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  cartLoginButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  cartTableHeader: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 2,
    flexDirection: 'row',
    paddingVertical: 12
  },
  cartHeaderCell: {
    fontSize: 13,
    color: '#6a6a6a',
    textAlign: 'center',
    fontFamily: 'Trebuchet MS'
  },
  cartHeaderProduct: { width: '40%' },
  cartHeaderPrice: { width: '15%' },
  cartHeaderQty: { width: '15%' },
  cartHeaderTotal: { width: '15%' },
  cartHeaderAction: { width: '15%' },

  cartListWrap: {
    marginTop: 10
  },
  cartRow: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 2,
    flexDirection: 'row',
    marginBottom: 8,
    paddingVertical: 10
  },
  cartCell: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  cartCellProduct: {
    width: '40%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8
  },
  cartCellPrice: { width: '15%' },
  cartCellQty: { width: '15%' },
  cartCellTotal: { width: '15%' },
  cartCellAction: { width: '15%' },
  cartItemImage: {
    width: 68,
    height: 68,
    borderRadius: 4,
    backgroundColor: '#f2f2f2',
    marginRight: 10
  },
  cartItemName: {
    flex: 1,
    color: '#2a2a2a',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },
  cartPriceText: {
    color: '#555555',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },
  cartTotalText: {
    color: '#ee4d2d',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  removeText: {
    color: '#d24b2f',
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  cartSummaryBar: {
    marginTop: 10,
    backgroundColor: '#fffaf6',
    borderWidth: 1,
    borderColor: '#f4d7ca',
    borderRadius: 2,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  cartSummaryMuted: {
    color: '#666666',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },
  cartSummaryStrong: {
    marginTop: 4,
    color: '#ee4d2d',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  checkoutButton: {
    minWidth: 170,
    borderRadius: 2,
    backgroundColor: '#ee4d2d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14
  },
  checkoutButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },

  emptyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ededed',
    borderRadius: 2,
    padding: 18,
    alignItems: 'center'
  },
  emptyText: {
    color: '#666666',
    fontSize: 14,
    fontFamily: 'Trebuchet MS'
  },

  mobilePageContainer: {
    width: '100%',
    paddingHorizontal: 8
  },
  mobileHeaderWrap: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  mobileSearchBar: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden'
  },
  mobileSearchInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    color: '#212121',
    fontSize: 14,
    fontFamily: 'Trebuchet MS'
  },
  mobileSearchAction: {
    minWidth: 64,
    height: 42,
    backgroundColor: '#ee4d2d',
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileSearchActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileHeaderIcon: {
    width: 48,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ececec',
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  mobileHeaderIconText: {
    color: '#ee4d2d',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileHeaderCount: {
    position: 'absolute',
    top: -7,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ee4d2d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  mobileHeaderCountText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileKeywordRow: {
    paddingVertical: 10
  },
  mobileKeywordChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#efc0b2',
    backgroundColor: '#fff4ef',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8
  },
  mobileKeywordChipText: {
    color: '#c74b2f',
    fontSize: 12,
    fontFamily: 'Trebuchet MS'
  },
  mobileWalletCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    overflow: 'hidden'
  },
  mobileWalletItem: {
    width: '33.33%',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRightWidth: 1,
    borderRightColor: '#f1f1f1'
  },
  mobileWalletTitle: {
    color: '#202020',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileWalletSub: {
    marginTop: 3,
    color: '#7f7f7f',
    fontSize: 11,
    fontFamily: 'Trebuchet MS'
  },
  mobileShortcutRow: {
    paddingTop: 10,
    paddingBottom: 2
  },
  mobileShortcutItem: {
    width: 82,
    marginRight: 8,
    alignItems: 'center'
  },
  mobileShortcutIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ececec',
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileShortcutIconText: {
    color: '#ef5a34',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileShortcutLabel: {
    marginTop: 6,
    color: '#262626',
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'Trebuchet MS'
  },
  mobileMediaRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  mobileMediaCard: {
    width: '49%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#ffffff',
    padding: 8
  },
  mobileMediaTitle: {
    color: '#ef5a34',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileMediaThumbRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  mobileMediaThumb: {
    width: '49%',
    aspectRatio: 0.78,
    borderRadius: 8,
    backgroundColor: '#f1f1f1'
  },
  mobileFeatureCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ededed',
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  mobileFeatureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  mobileFeatureItem: {
    width: '50%',
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  mobileFeatureTitle: {
    color: '#1f1f1f',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileFeatureSub: {
    marginTop: 4,
    color: '#8a8a8a',
    fontSize: 12,
    fontFamily: 'Trebuchet MS'
  },
  mobileCategoryGrid: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ededed',
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden'
  },
  mobileCategoryItem: {
    width: '50%',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#efefef',
    alignItems: 'center',
    paddingVertical: 14
  },
  mobileCategoryImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#f3f3f3'
  },
  mobileCategoryText: {
    marginTop: 8,
    color: '#2c2c2c',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Trebuchet MS'
  },
  mobileSortCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#ffffff',
    padding: 10
  },
  mobileSortLabel: {
    color: '#5f5f5f',
    fontSize: 14,
    fontFamily: 'Trebuchet MS'
  },
  mobileSortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8
  },
  mobileSortChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8
  },
  mobileSortChipActive: {
    borderColor: '#ee4d2d',
    backgroundColor: '#fff1ec'
  },
  mobileSortChipText: {
    color: '#3c3c3c',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },
  mobileSortChipTextActive: {
    color: '#ee4d2d',
    fontWeight: '700'
  },
  mobileEmptyState: {
    marginTop: 10,
    paddingVertical: 18,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f0dad3',
    alignItems: 'center'
  },
  mobileEmptyStateTitle: {
    color: '#ca4f33',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileProductGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4
  },
  mobileProductCard: {
    width: '50%',
    paddingHorizontal: 4,
    marginBottom: 8
  },
  mobileProductImage: {
    width: '100%',
    aspectRatio: 1,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#f1f1f1'
  },
  mobileProductName: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingTop: 8,
    color: '#232323',
    fontSize: 13,
    minHeight: 44,
    fontFamily: 'Trebuchet MS'
  },
  mobileProductPrice: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingTop: 4,
    color: '#ee4d2d',
    fontSize: 19,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileProductMeta: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
    color: '#6f6f6f',
    fontSize: 12,
    fontFamily: 'Trebuchet MS'
  },
  mobileScreenHeader: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ececec',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  mobileBackButton: {
    color: '#ee4d2d',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileScreenHeaderTitle: {
    flex: 1,
    marginHorizontal: 10,
    color: '#1f1f1f',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileScreenHeaderAction: {
    color: '#ee4d2d',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileDetailCard: {
    padding: 0,
    borderRadius: 14,
    overflow: 'hidden'
  },
  mobileDetailImageColumn: {
    width: '100%'
  },
  mobileDetailMainImage: {
    borderRadius: 0,
    aspectRatio: 0.92
  },
  mobileThumbnailButton: {
    width: 58,
    height: 58,
    marginRight: 6,
    marginBottom: 6,
    borderRadius: 8
  },
  mobileThumbnailImage: {
    borderRadius: 7
  },
  mobileDetailInfoColumn: {
    minWidth: 0,
    width: '100%',
    paddingLeft: 0,
    marginTop: 0,
    paddingHorizontal: 12,
    paddingBottom: 12
  },
  mobileDetailName: {
    fontSize: 31,
    lineHeight: 38
  },
  mobileDetailPricePanel: {
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  mobileDetailPriceText: {
    fontSize: 40
  },
  mobileDetailActionRow: {
    marginTop: 12,
    width: '100%',
    gap: 8
  },
  mobileDetailAddButton: {
    minWidth: 0,
    width: '100%',
    marginRight: 0,
    marginBottom: 0,
    borderRadius: 10
  },
  mobileDetailChatButton: {
    minWidth: 0,
    width: '100%',
    marginRight: 0,
    marginBottom: 0,
    borderRadius: 10
  },
  mobileDetailBuyButton: {
    minWidth: 0,
    width: '100%',
    borderRadius: 10
  },
  mobileDetailShopStatRow: {
    width: '100%',
    marginTop: 4,
    flexDirection: 'column',
    gap: 4
  },
  mobileNoticeWrap: {
    marginTop: 8
  },
  mobileNoticeHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  mobileNoticeIconButton: {
    width: 42,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f0c9bb',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8
  },
  mobileNoticeIconText: {
    color: '#ee4d2d',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticeList: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 12,
    overflow: 'hidden'
  },
  mobileNoticeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  mobileNoticeBullet: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#efefef',
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileNoticeBulletText: {
    color: '#ee4d2d',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticeBody: {
    flex: 1,
    marginHorizontal: 10
  },
  mobileNoticeTitle: {
    color: '#202020',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticePreview: {
    marginTop: 2,
    color: '#7d7d7d',
    fontSize: 14,
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticeBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ee4d2d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  },
  mobileNoticeBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticeOrderHead: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4
  },
  mobileNoticeOrderTitle: {
    color: '#6a6a6a',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticeOrderReadAll: {
    color: '#a4a4a4',
    fontSize: 15,
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticeEmptyBox: {
    marginTop: 6,
    minHeight: 280,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ececec',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  mobileNoticeEmptyIcon: {
    color: '#ef7d53',
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticeEmptyText: {
    marginTop: 12,
    color: '#8f8f8f',
    fontSize: 14,
    fontFamily: 'Trebuchet MS'
  },
  mobileNoticeCTA: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ee4d2d',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10
  },
  mobileNoticeCTAText: {
    color: '#ee4d2d',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserWrap: {
    marginTop: 8
  },
  mobileUserHeader: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f85a24',
    padding: 12
  },
  mobileUserTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  mobileUserSellButton: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  mobileUserSellText: {
    color: '#1f1f1f',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserIconRow: {
    flexDirection: 'row'
  },
  mobileUserIcon: {
    marginLeft: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fbc2ad',
    paddingHorizontal: 7,
    paddingVertical: 4
  },
  mobileUserIconText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserProfileRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  mobileUserAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginRight: 10,
    backgroundColor: '#f2f2f2'
  },
  mobileUserName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserStats: {
    marginTop: 4,
    color: '#fff1ec',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },
  mobileUserProfileEditButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 8
  },
  mobileUserProfileEditText: {
    color: '#ee4d2d',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserVoucherRow: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f0d6c8',
    backgroundColor: '#fff5e3',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  mobileUserVoucherText: {
    color: '#775536',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserSection: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#ffffff',
    padding: 12
  },
  mobileUserSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  mobileUserSectionTitle: {
    color: '#222222',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserSectionAction: {
    color: '#4f4f4f',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserOrderRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  mobileUserOrderItem: {
    width: '24%',
    alignItems: 'center'
  },
  mobileUserOrderIcon: {
    color: '#3f3f3f',
    fontSize: 20
  },
  mobileUserOrderText: {
    marginTop: 4,
    color: '#343434',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Trebuchet MS'
  },
  mobileUserUtilityRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap'
  },
  mobileUserUtilityItem: {
    width: '24%',
    alignItems: 'center'
  },
  mobileUserExtraItem: {
    width: '49%',
    borderWidth: 1,
    borderColor: '#efefef',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    minHeight: 72,
    justifyContent: 'center'
  },
  mobileUserUtilityIcon: {
    color: '#444444',
    fontSize: 20
  },
  mobileUserUtilityText: {
    marginTop: 5,
    color: '#2d2d2d',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'Trebuchet MS'
  },
  mobileCartGroupList: {
    marginTop: 8
  },
  mobileCartShopCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ececec',
    backgroundColor: '#ffffff',
    marginBottom: 10,
    overflow: 'hidden'
  },
  mobileCartShopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2'
  },
  mobileCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d8d8d8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  mobileCheckboxActive: {
    borderColor: '#ee4d2d',
    backgroundColor: '#ee4d2d'
  },
  mobileCheckboxMark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  mobileCartShopName: {
    flex: 1,
    color: '#191919',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileCartEdit: {
    color: '#707070',
    fontSize: 15,
    fontFamily: 'Trebuchet MS'
  },
  mobileCartHintRow: {
    backgroundColor: '#ecfbf5',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  mobileCartHintText: {
    color: '#2a9b80',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileCartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  mobileCartImage: {
    width: 96,
    height: 96,
    borderRadius: 10,
    backgroundColor: '#f1f1f1',
    marginRight: 10
  },
  mobileCartItemInfo: {
    flex: 1
  },
  mobileCartItemName: {
    color: '#252525',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Trebuchet MS'
  },
  mobileCartItemPrice: {
    marginTop: 8,
    color: '#ee4d2d',
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  mobileCartQtyRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  mobileQtyButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dfdfdf',
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileQtyButtonText: {
    color: '#2f2f2f',
    fontSize: 18,
    fontFamily: 'Trebuchet MS'
  },
  mobileQtyValue: {
    width: 36,
    textAlign: 'center',
    color: '#2a2a2a',
    fontSize: 15,
    fontFamily: 'Trebuchet MS'
  },
  mobileCartSummaryBar: {
    borderRadius: 12,
    padding: 10,
    flexWrap: 'wrap',
    gap: 8
  },
  mobileSelectAllRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  mobileSelectAllText: {
    color: '#3e3e3e',
    fontSize: 14,
    fontFamily: 'Trebuchet MS'
  },
  mobileCheckoutButton: {
    minWidth: 160
  },
  mobileBottomNav: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 6,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10
  },
  mobileBottomNavItem: {
    flex: 1,
    alignItems: 'center'
  },
  mobileBottomNavIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileBottomNavIconWrapActive: {
    backgroundColor: '#fff2ec'
  },
  mobileBottomNavIcon: {
    color: '#8d8d8d',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  },
  mobileBottomNavIconActive: {
    color: '#ee4d2d'
  },
  mobileBottomNavLabel: {
    marginTop: 3,
    color: '#8d8d8d',
    fontSize: 11,
    fontFamily: 'Trebuchet MS'
  },
  mobileBottomNavLabelActive: {
    color: '#ee4d2d',
    fontWeight: '700'
  },

  chatFloatingButton: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    backgroundColor: '#ee4d2d',
    borderRadius: 999,
    minWidth: 72,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 9,
    zIndex: 120
  },
  chatFloatingButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  chatPanel: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 360,
    maxWidth: '92%',
    height: 430,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#efefef',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    zIndex: 140
  },
  chatPanelHeader: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
    backgroundColor: '#fff6f3',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  chatPanelTitle: {
    color: '#d34a2c',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Trebuchet MS'
  },
  chatPanelShopName: {
    marginTop: 2,
    color: '#6f6f6f',
    fontSize: 12,
    fontFamily: 'Trebuchet MS'
  },
  chatCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f0c9bc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff'
  },
  chatCloseButtonText: {
    color: '#d45439',
    fontWeight: '800',
    fontSize: 13,
    fontFamily: 'Trebuchet MS'
  },
  chatMessagesArea: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fffdfc'
  },
  chatBubbleBuyerWrap: {
    alignItems: 'flex-end',
    marginBottom: 8
  },
  chatBubbleSellerWrap: {
    alignItems: 'flex-start',
    marginBottom: 8
  },
  chatBubbleBuyer: {
    maxWidth: '86%',
    borderRadius: 12,
    borderTopRightRadius: 4,
    backgroundColor: '#ffe7df',
    borderWidth: 1,
    borderColor: '#f6cdc1',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  chatBubbleSeller: {
    maxWidth: '86%',
    borderRadius: 12,
    borderTopLeftRadius: 4,
    backgroundColor: '#f4f4f4',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  chatBubbleText: {
    color: '#222222',
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Trebuchet MS'
  },
  chatInputRow: {
    borderTopWidth: 1,
    borderTopColor: '#f1f1f1',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  chatInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    borderRadius: 4,
    paddingHorizontal: 10,
    color: '#2e2e2e',
    fontSize: 13,
    fontFamily: 'Trebuchet MS',
    backgroundColor: '#fafafa'
  },
  chatSendButton: {
    marginLeft: 8,
    minWidth: 72,
    height: 38,
    borderRadius: 4,
    backgroundColor: '#ee4d2d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  chatSendButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Trebuchet MS'
  }
});
