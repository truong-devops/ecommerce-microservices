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
    backgroundColor: '#ffffff',
    position: 'relative',
    zIndex: 40
  },
  topHeaderMobile: {
    height: 72,
    paddingHorizontal: 12
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
  topBrandIconMobile: {
    width: 32,
    height: 32,
    borderRadius: 7,
    marginRight: 8
  },
  topBrandIconText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12
  },
  topBrandIconTextMobile: {
    fontSize: 10
  },
  topBrandName: {
    color: '#f85a24',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38
  },
  topBrandNameMobile: {
    fontSize: 28,
    lineHeight: 30
  },
  topBrandSub: {
    color: '#222222',
    fontSize: 30,
    marginLeft: 10,
    fontWeight: '600',
    lineHeight: 36
  },
  topBrandSubMobile: {
    fontSize: 18,
    lineHeight: 22,
    marginLeft: 6
  },
  topHelp: {
    color: '#ff7a4d',
    fontSize: 14,
    fontWeight: '500'
  },
  topHelpMobile: {
    fontSize: 12
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  topActionsMobile: {
    gap: 6
  },
  languageWrap: {
    position: 'relative',
    marginRight: 10,
    zIndex: 120
  },
  languageButton: {
    borderWidth: 1,
    borderColor: '#ffd3c3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff'
  },
  languageButtonMobile: {
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  languageButtonText: {
    color: '#f85a24',
    fontSize: 12,
    fontWeight: '600'
  },
  languageMenu: {
    position: 'absolute',
    top: 34,
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
  languageMenuMobile: {
    width: 120
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
  hero: {
    backgroundColor: '#f85a24',
    paddingVertical: 28,
    paddingHorizontal: 16,
    minHeight: 640
  },
  heroMobile: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    minHeight: 0
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
    alignItems: 'center',
    paddingRight: 24
  },
  promoMobile: {
    width: '100%',
    marginBottom: 24,
    alignItems: 'center'
  },
  promoMobileCompact: {
    marginBottom: 12
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
  promoLogoBagMobile: {
    width: 90,
    height: 90,
    borderRadius: 16,
    borderWidth: 5
  },
  promoLogoText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 26,
    letterSpacing: 0.4
  },
  promoLogoTextMobile: {
    fontSize: 17
  },
  promoBrand: {
    marginTop: 16,
    color: '#ffffff',
    fontSize: 68,
    fontWeight: '700',
    lineHeight: 72
  },
  promoBrandMobile: {
    marginTop: 8,
    fontSize: 38,
    lineHeight: 42
  },
  promoCaption: {
    marginTop: 16,
    color: '#fff2ec',
    fontSize: 22,
    lineHeight: 32,
    maxWidth: 520,
    textAlign: 'center'
  },
  promoCaptionMobile: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 12
  },
  valueList: {
    marginTop: 24,
    width: '100%',
    maxWidth: 520,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8
  },
  valueListMobile: {
    marginTop: 12,
    paddingVertical: 8,
    gap: 6
  },
  valueItem: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  valueIcon: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    marginRight: 8
  },
  valueText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600'
  },
  valueTextMobile: {
    fontSize: 12
  },
  panel: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ffd6c6',
    backgroundColor: '#ffffff',
    shadowColor: '#ff5a1f',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8
    },
    elevation: 4,
    paddingHorizontal: 20,
    paddingVertical: 18,
    alignSelf: 'center'
  },
  panelAccent: {
    width: 84,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#ff6c33',
    alignSelf: 'center',
    marginBottom: 10
  },
  panelAccentMobile: {
    width: 62,
    height: 4,
    marginBottom: 8
  },
  panelDesktop: {
    width: '40%',
    minWidth: 420
  },
  panelMobile: {
    width: '100%',
    maxWidth: 460
  },
  panelMobileCompact: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  badge: {
    color: '#1f1f1f',
    fontSize: 34,
    fontWeight: '600'
  },
  badgeMobile: {
    fontSize: 28
  },
  panelSubtitle: {
    marginTop: 6,
    color: '#8f4a34',
    fontSize: 13,
    lineHeight: 18
  },
  panelSubtitleMobile: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16
  },
  quickActions: {
    marginTop: 14,
    marginBottom: 2,
    gap: 8
  },
  quickButtonLight: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffd1bf',
    backgroundColor: '#fff7f3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  quickButtonLightText: {
    color: '#e45522',
    fontSize: 13,
    fontWeight: '700'
  },
  quickButtonDark: {
    borderRadius: 10,
    backgroundColor: '#2d2d2d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  quickButtonDarkText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  quickHint: {
    marginTop: 8,
    color: '#8e4b35',
    fontSize: 12,
    fontWeight: '500'
  },
  heading: {
    display: 'none'
  },
  caption: {
    display: 'none'
  },
  modeTabs: {
    marginTop: 14,
    backgroundColor: '#fff4ef',
    borderWidth: 1,
    borderColor: '#ffd6c7',
    borderRadius: 12,
    padding: 4,
    flexDirection: 'row'
  },
  modeTabsMobile: {
    marginTop: 10,
    borderRadius: 10,
    padding: 3
  },
  modeButton: {
    flex: 1,
    borderRadius: 9,
    alignItems: 'center',
    paddingVertical: 10
  },
  modeButtonMobile: {
    paddingVertical: 8
  },
  modeButtonActive: {
    backgroundColor: '#ff6b33'
  },
  modeButtonText: {
    color: '#c95b3b',
    fontWeight: '700',
    fontSize: 14
  },
  modeButtonTextMobile: {
    fontSize: 13
  },
  modeButtonTextActive: {
    color: '#ffffff'
  },
  qrCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#ffd7ca',
    borderRadius: 12,
    backgroundColor: '#fff8f4',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  qrCardMobile: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  qrCardBody: {
    flex: 1,
    paddingRight: 8
  },
  qrTitle: {
    color: '#8d3319',
    fontSize: 13,
    fontWeight: '700'
  },
  qrHint: {
    color: '#9b634f',
    fontSize: 11,
    marginTop: 2
  },
  qrHintMobile: {
    fontSize: 10,
    lineHeight: 13
  },
  qrAction: {
    minWidth: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffc7b1',
    backgroundColor: '#ffffff',
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  qrActionText: {
    marginTop: 2,
    color: '#e45824',
    fontSize: 11,
    fontWeight: '700'
  },
  qrGlyph: {
    color: '#f85a24',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 14
  },
  form: {
    marginTop: 16
  },
  formMobile: {
    marginTop: 12
  },
  switchRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center'
  },
  socialDivider: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  socialDividerMobile: {
    marginTop: 12,
    marginBottom: 8
  },
  socialLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ece1dc'
  },
  socialDividerText: {
    color: '#9f7f72',
    fontSize: 11,
    fontWeight: '600'
  },
  socialRow: {
    flexDirection: 'row',
    gap: 8
  },
  socialRowNarrow: {
    flexDirection: 'column'
  },
  socialButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8e0db',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5
  },
  socialButtonNarrow: {
    width: '100%'
  },
  socialGlyph: {
    fontSize: 14,
    fontWeight: '800'
  },
  socialGlyphFacebook: {
    color: '#1877f2'
  },
  socialGlyphGoogle: {
    color: '#ea4335'
  },
  socialGlyphApple: {
    color: '#111111'
  },
  socialButtonText: {
    color: '#444444',
    fontSize: 12,
    fontWeight: '600'
  },
  securityNote: {
    marginTop: 12,
    color: '#7a4c3b',
    fontSize: 12,
    lineHeight: 17
  },
  agreementText: {
    marginTop: 6,
    color: '#8f7469',
    fontSize: 11,
    lineHeight: 16
  },
  switchText: {
    color: '#6d6d6d',
    fontSize: 13
  },
  switchAction: {
    color: '#f85a24',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6
  },
  label: {
    color: '#94442d',
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600'
  },
  labelMobile: {
    marginBottom: 4,
    fontSize: 12
  },
  input: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    backgroundColor: '#fffefe',
    borderRadius: 10,
    color: '#2f1b15',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 10
  },
  inputMobile: {
    borderRadius: 9,
    fontSize: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8
  },
  passwordWrap: {
    position: 'relative',
    marginBottom: 10
  },
  passwordInput: {
    marginBottom: 0,
    paddingRight: 48
  },
  passwordToggle: {
    position: 'absolute',
    right: 9,
    top: 8,
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ffc9b3',
    backgroundColor: '#fff1ea',
    alignItems: 'center',
    justifyContent: 'center'
  },
  eyeIcon: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eyeOutline: {
    width: 14,
    height: 9,
    borderWidth: 1.5,
    borderColor: '#e45522',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  eyePupil: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#e45522'
  },
  eyeSlash: {
    position: 'absolute',
    width: 15,
    height: 1.5,
    backgroundColor: '#e45522',
    transform: [{ rotate: '-35deg' }]
  },
  passwordToggleText: {
    color: '#e45522',
    fontSize: 12,
    fontWeight: '700'
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  roleRowMobile: {
    gap: 6,
    marginBottom: 10
  },
  roleButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6e6e6',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    paddingVertical: 10
  },
  roleButtonMobile: {
    borderRadius: 9,
    paddingVertical: 9
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
    borderRadius: 10,
    backgroundColor: '#f85a24',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    marginTop: 6,
    shadowColor: '#ef5e27',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4
    },
    elevation: 3
  },
  submitButtonMobile: {
    borderRadius: 9,
    paddingVertical: 10,
    marginTop: 4
  },
  forgotText: {
    color: '#1165c1',
    fontSize: 13,
    marginTop: 10
  },
  forgotTextMobile: {
    fontSize: 12,
    marginTop: 8
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 15
  },
  verifyBox: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffd8cc',
    backgroundColor: '#fff8f5',
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  verifyTitle: {
    color: '#8f3419',
    fontSize: 16,
    fontWeight: '700'
  },
  verifyHint: {
    color: '#9a664f',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 10
  },
  notice: {
    borderRadius: 4,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  noticeMobile: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
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
