import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithContext } from '../types/request-context.type';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestWithContext['user'] => {
  const request = ctx.switchToHttp().getRequest<RequestWithContext>();
  return request.user;
});
