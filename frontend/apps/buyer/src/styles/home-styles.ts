import { StyleSheet } from 'react-native';

export const homeStyles = StyleSheet.create({
  scrollContainer: {
    minHeight: '100%',
    backgroundColor: '#f5f5f5'
  },
  page: {
    flex: 1
  },
  centerContainer: {
    width: '100%',
    maxWidth: 1220,
    alignSelf: 'center',
    paddingHorizontal: 16
  },
  headerGradient: {
    backgroundColor: '#fb5533',
    paddingBottom: 10,
    position: 'relative',
    zIndex: 40
  },
  utilityBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 60
  },
  utilityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    maxWidth: '58%'
  },
  utilityRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    justifyContent: 'flex-end',
    maxWidth: '42%'
  },
  utilityText: {
    color: '#ffe7dc',
    fontSize: 12,
    marginRight: 14,
    marginBottom: 6
  },
  languageWrap: {
    position: 'relative',
    zIndex: 120,
    marginRight: 8,
    marginBottom: 6
  },
  languageButton: {
    borderWidth: 1,
    borderColor: '#ffd3c3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  languageButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  languageMenu: {
    position: 'absolute',
    top: 36,
    right: 0,
    width: 140,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#efefef',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6
    },
    elevation: 20,
    zIndex: 200
  },
  languageMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  languageMenuItemActive: {
    backgroundColor: '#fff1eb'
  },
  languageMenuText: {
    color: '#2a2a2a',
    fontSize: 13,
    fontWeight: '500'
  },
  logoutButton: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6
  },
  logoutButtonText: {
    color: '#ee4d2d',
    fontWeight: '700',
    fontSize: 12
  },
  authTopButton: {
    borderWidth: 1,
    borderColor: '#ffd3c3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
    marginBottom: 6
  },
  authTopButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  bannerBlock: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10
  },
  mainBannerImage: {
    flex: 1,
    borderRadius: 6,
    minHeight: 230
  },
  sideBannerColumn: {
    width: 310,
    gap: 10
  },
  sideBannerImage: {
    width: '100%',
    flex: 1,
    minHeight: 110,
    borderRadius: 6
  },
  searchRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 10
  },
  brandWrap: {
    width: 200,
    flexDirection: 'row',
    alignItems: 'center'
  },
  brandBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  brandBadgeText: {
    color: '#ee4d2d',
    fontWeight: '800',
    fontSize: 12
  },
  brandName: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '800'
  },
  searchWrap: {
    flex: 1,
    paddingHorizontal: 14
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
    fontSize: 14
  },
  searchButton: {
    width: 64,
    backgroundColor: '#fb5533',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 3,
    borderRadius: 2
  },
  searchButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13
  },
  keywordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6
  },
  keywordText: {
    color: '#ffe5db',
    fontSize: 12,
    marginRight: 12,
    marginBottom: 4
  },
  cartWrap: {
    width: 170,
    alignItems: 'flex-end'
  },
  cartIcon: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  welcomeText: {
    color: '#fff1eb',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right'
  },
  serviceStrip: {
    backgroundColor: '#ffffff',
    marginTop: 12,
    borderRadius: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14
  },
  serviceItem: {
    flex: 1,
    alignItems: 'center'
  },
  serviceTitle: {
    color: '#222222',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 10
  },
  serviceSubtitle: {
    color: '#8a8a8a',
    marginTop: 6,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 10
  },
  mainSection: {
    marginTop: 14,
    paddingBottom: 18
  },
  block: {
    backgroundColor: '#ffffff',
    borderRadius: 2,
    marginBottom: 14
  },
  blockTitle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 26,
    fontWeight: '700',
    color: '#222222'
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0'
  },
  categoryCard: {
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderTopWidth: 0,
    marginLeft: -1,
    paddingVertical: 14,
    alignItems: 'center'
  },
  categoryImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0'
  },
  categoryText: {
    color: '#2f2f2f',
    fontWeight: '500',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 8
  },
  flashHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  flashTitleRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  flashTitle: {
    color: '#ee4d2d',
    fontSize: 30,
    fontWeight: '800'
  },
  countdownBox: {
    marginLeft: 10,
    backgroundColor: '#111111',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  countdownText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13
  },
  viewAllText: {
    color: '#ee4d2d',
    fontSize: 14,
    fontWeight: '600'
  },
  flashGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingBottom: 14
  },
  flashCard: {
    borderWidth: 1,
    borderColor: '#f2f2f2',
    borderRadius: 2,
    marginHorizontal: 4,
    marginBottom: 8,
    paddingBottom: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff'
  },
  flashImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#f3f3f3'
  },
  flashDiscountTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    backgroundColor: '#ffd44d',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3
  },
  flashDiscountText: {
    color: '#d13919',
    fontSize: 11,
    fontWeight: '700'
  },
  flashItemTitle: {
    marginTop: 8,
    paddingHorizontal: 8,
    color: '#2f2f2f',
    fontSize: 13
  },
  flashPrice: {
    marginTop: 6,
    paddingHorizontal: 8,
    color: '#ee4d2d',
    fontWeight: '800',
    fontSize: 16
  },
  flashSold: {
    marginTop: 4,
    paddingHorizontal: 8,
    color: '#8a8a8a',
    fontSize: 12
  },
  hotBar: {
    marginTop: 6,
    marginHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#ffe8df',
    alignItems: 'center',
    paddingVertical: 4
  },
  hotBarText: {
    color: '#ee4d2d',
    fontSize: 11,
    fontWeight: '700'
  },
  mallHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  mallTitle: {
    color: '#ee4d2d',
    fontSize: 24,
    fontWeight: '700'
  },
  mallBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end'
  },
  mallBadge: {
    color: '#555555',
    fontSize: 12,
    marginLeft: 14,
    marginBottom: 4
  },
  mallContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10
  },
  mallBannerWrap: {
    width: 360,
    maxWidth: '100%'
  },
  mallBannerImage: {
    width: '100%',
    aspectRatio: 0.85,
    borderRadius: 2
  },
  mallGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingLeft: 10
  },
  mallCard: {
    padding: 8,
    alignItems: 'center'
  },
  mallItemImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f3f3f3'
  },
  mallItemText: {
    marginTop: 8,
    color: '#ee4d2d',
    fontSize: 16,
    textAlign: 'center'
  },
  recommendTitle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#ee4d2d',
    fontSize: 30,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    textAlign: 'center'
  },
  recommendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 10
  },
  recommendCard: {
    borderWidth: 1,
    borderColor: '#f0f0f0',
    marginHorizontal: 4,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderRadius: 2,
    overflow: 'hidden'
  },
  recommendImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#f3f3f3'
  },
  recommendName: {
    marginTop: 8,
    paddingHorizontal: 8,
    color: '#2f2f2f',
    fontSize: 13,
    minHeight: 36
  },
  recommendPrice: {
    marginTop: 6,
    paddingHorizontal: 8,
    color: '#ee4d2d',
    fontSize: 18,
    fontWeight: '700'
  },
  recommendSold: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingBottom: 8,
    color: '#8a8a8a',
    fontSize: 12
  },
  moreButtonWrap: {
    alignItems: 'center',
    paddingBottom: 16
  },
  moreButton: {
    width: 340,
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: '#d9d9d9',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff'
  },
  moreButtonText: {
    color: '#555555',
    fontSize: 14
  },
  footerInfo: {
    marginTop: 6,
    borderTopWidth: 3,
    borderTopColor: '#ee4d2d',
    backgroundColor: '#ffffff',
    paddingTop: 18,
    paddingBottom: 24
  },
  footerHeading: {
    color: '#222222',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10
  },
  footerText: {
    color: '#555555',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 10
  }
});
