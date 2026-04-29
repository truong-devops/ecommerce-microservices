import { UpstreamHttpError } from './upstream-client';
import { fail } from './seller-api-response';

export function toErrorResponse(error: unknown) {
  if (error instanceof UpstreamHttpError) {
    return fail(error.status, error.code, error.message);
  }

  return fail(500, 'INTERNAL_ERROR', 'Internal server error');
}
