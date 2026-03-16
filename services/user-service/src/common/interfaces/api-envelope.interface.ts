export interface SuccessMeta {
  requestId: string;
  timestamp: string;
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  meta: SuccessMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}
