import type { BuyerVideoComment } from '@frontend/buyer-contracts';

export function normalizeVideoComment(text: string): string {
  const normalized = text.trim();
  if (normalized.length < 1 || normalized.length > 1000) {
    throw new Error('Bình luận phải có từ 1 đến 1000 ký tự');
  }
  return normalized;
}

export function mergeVideoComments(current: BuyerVideoComment[], incoming: BuyerVideoComment): BuyerVideoComment[] {
  const items = current.filter(
    (comment) =>
      comment.commentId !== incoming.commentId &&
      (!incoming.clientCommentId || comment.clientCommentId !== incoming.clientCommentId)
  );
  return [incoming, ...items];
}

export function videoEventId(videoId: string, event: string, productId?: string): string {
  return ['buyer-mobile', videoId, event, productId ?? 'none'].join(':');
}
