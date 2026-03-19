import { StyleSheet } from 'react-native';

export const authStyles = StyleSheet.create({
  scrollContainer: {
    minHeight: '100%',
    backgroundColor: '#ffffff'
  },
  page: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  topHeader: {
    height: 84,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff'
  },
  topBrand: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  topBrandIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#f85a24',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  topBrandIconText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12
  },
  topBrandName: {
    color: '#f85a24',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38
  },
  topBrandSub: {
    color: '#222222',
    fontSize: 30,
    marginLeft: 10,
    fontWeight: '600',
    lineHeight: 36
  },
  topHelp: {
    color: '#ff7a4d',
    fontSize: 14,
    fontWeight: '500'
  },
  hero: {
    backgroundColor: '#f85a24',
    paddingVertical: 28,
    paddingHorizontal: 16
  },
  heroContentDesktop: {
    width: '100%',
    maxWidth: 1180,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  heroContentMobile: {
    width: '100%',
    alignSelf: 'center'
  },
  promoDesktop: {
    width: '50%',
    alignItems: 'center'
  },
  promoMobile: {
    width: '100%',
    marginBottom: 24,
    alignItems: 'center'
  },
  promoLogoBag: {
    width: 168,
    height: 168,
    borderRadius: 26,
    borderWidth: 8,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  promoLogoText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 46,
    letterSpacing: 1
  },
  promoBrand: {
    marginTop: 16,
    color: '#ffffff',
    fontSize: 68,
    fontWeight: '700',
    lineHeight: 72
  },
  promoCaption: {
    marginTop: 16,
    color: '#fff2ec',
    fontSize: 24,
    lineHeight: 34,
    maxWidth: 520,
    textAlign: 'center'
  },
  panel: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 24,
    borderWidth: 0,
    backgroundColor: '#ffffff',
    shadowColor: '#ff5a1f',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 4,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignSelf: 'center'
  },
  panelDesktop: {
    width: '40%',
    minWidth: 420
  },
  panelMobile: {
    width: '100%',
    maxWidth: 460
  },
  badge: {
    color: '#1f1f1f',
    fontSize: 38,
    fontWeight: '600'
  },
  heading: {
    display: 'none'
  },
  caption: {
    display: 'none'
  },
  modeTabs: {
    marginTop: 16,
    backgroundColor: '#fff4ef',
    borderWidth: 1,
    borderColor: '#ffd9ce',
    borderRadius: 14,
    padding: 4,
    flexDirection: 'row'
  },
  modeButton: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 10
  },
  modeButtonActive: {
    backgroundColor: '#ff6b33'
  },
  modeButtonText: {
    color: '#c95b3b',
    fontWeight: '700',
    fontSize: 15
  },
  modeButtonTextActive: {
    color: '#ffffff'
  },
  form: {
    marginTop: 16
  },
  label: {
    color: '#94442d',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600'
  },
  input: {
    borderWidth: 1,
    borderColor: '#e6e6e6',
    backgroundColor: '#ffffff',
    borderRadius: 4,
    color: '#2f1b15',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 10
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  roleButton: {
    flex: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e6e6e6',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingVertical: 10
  },
  roleButtonActive: {
    borderColor: '#ff6b33',
    backgroundColor: '#ffe4d8'
  },
  roleButtonText: {
    color: '#a3482f',
    fontWeight: '700',
    fontSize: 14
  },
  submitButton: {
    borderRadius: 4,
    backgroundColor: '#f85a24',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: 4
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15
  },
  notice: {
    borderRadius: 4,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  noticeSuccess: {
    backgroundColor: '#ecfff3',
    borderWidth: 1,
    borderColor: '#b8f0cb'
  },
  noticeError: {
    backgroundColor: '#ffe9e3',
    borderWidth: 1,
    borderColor: '#ffc6b6'
  },
  noticeText: {
    color: '#6e2f1f',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  }
});
