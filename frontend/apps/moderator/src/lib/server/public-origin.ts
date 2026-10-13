export function resolvePublicWebOrigin(request: Request): string {
  const configured = process.env.PUBLIC_WEB_BASE_URL?.trim();
  if (configured) {
    return new URL(configured).origin;
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  if (!forwardedHost) {
    return requestUrl.origin;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const protocol = forwardedProto === 'http' ? 'http' : 'https';
  return `${protocol}://${forwardedHost}`;
}
