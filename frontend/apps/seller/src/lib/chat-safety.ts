const BLOCKED_MESSAGE = 'Tin nhắn chứa thông tin liên hệ hoặc giao dịch ngoài sàn nên không thể gửi.';

const phonePattern = /(?:\+?84|0)[\d\s._-]{7,14}\d/;
const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const linkPattern = /(https?:\/\/|www\.|[a-z0-9][a-z0-9-]{1,}\.(com|vn|net|org|io|co)\b)/i;
const riskyWords = [
  'zalo',
  'facebook',
  'messenger',
  'telegram',
  'whatsapp',
  'instagram',
  'chuyen khoan',
  'so tai khoan',
  'ngan hang',
  'momo',
  'viettelpay',
  'zalopay',
  'dia chi',
  'ship ngoai',
  'giao ngoai'
];

export function validateChatText(text: string): { allowed: boolean; score: number; message?: string } {
  const normalized = normalizeChatText(text);
  let score = 0;

  if (phonePattern.test(text) || hasPhoneDigits(normalized)) score += 90;
  if (emailPattern.test(text)) score += 90;
  if (linkPattern.test(text)) score += 80;
  if (riskyWords.some((word) => normalized.includes(word.replace(/\s+/g, '')) || normalized.includes(word))) score += 80;

  return score >= 80 ? { allowed: false, score, message: BLOCKED_MESSAGE } : { allowed: true, score };
}

function normalizeChatText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '');
}

function hasPhoneDigits(normalized: string): boolean {
  const matches = normalized.match(/\d{9,12}/g) ?? [];
  return matches.some((digits) => digits.startsWith('0') || digits.startsWith('84'));
}
