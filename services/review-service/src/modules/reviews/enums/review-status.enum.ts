export enum ReviewStatus {
  PUBLISHED = 'PUBLISHED',
  HIDDEN = 'HIDDEN',
  REJECTED = 'REJECTED',
  DELETED = 'DELETED'
}

export const MODERATABLE_REVIEW_STATUSES: ReviewStatus[] = [ReviewStatus.PUBLISHED, ReviewStatus.HIDDEN, ReviewStatus.REJECTED];
