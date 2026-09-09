import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE = 'tt_rt';

/**
 * `Path=/auth` is the point: the refresh token is attached only to the refresh and logout
 * routes, so it is not sent with — and cannot be stolen from — ordinary API traffic.
 *
 * `SameSite=Lax` is enough against CSRF here because refresh is a POST, and Lax does not attach
 * cookies to cross-site POSTs. `Secure` is dropped outside production so local http works.
 */
export function refreshCookieOptions(expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expiresAt));
}

/** Options must match those the cookie was set with, or the browser keeps it. */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}
