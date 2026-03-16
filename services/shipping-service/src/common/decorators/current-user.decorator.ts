import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithContext } from '../types/request-context.type';

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithContext>();
  return request.user;
});
