import { auth } from '@/auth';

export default auth;

export const config = {
  matcher: [
    '/workspace/:path*',
    '/tools/:path*',
    '/library/:path*',
    '/settings/:path*',
  ],
};
