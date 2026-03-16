import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUserContext } from '../types/request-context.type';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedUserContext => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUserContext }>();
  return request.user;
});
