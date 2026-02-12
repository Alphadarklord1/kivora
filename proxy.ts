import { auth } from '@/auth';

export default auth;

export const config = {
  matcher: [
    '/workspace/:path*',
    '/tools/:path*',
    '/library/:path*',
    '/analytics/:path*',
    '/settings/:path*',
    '/sharing/:path*',
    '/planner/:path*',
    '/podcast/:path*',
  ],
};
