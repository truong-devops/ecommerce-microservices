export interface ApiMeta {
  requestId: string;
  timestamp: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiSuccessResponse<TData> {
  success: true;
  data: TData;
  meta: ApiMeta;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
  meta: ApiMeta;
}

export type ApiEnvelope<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;
