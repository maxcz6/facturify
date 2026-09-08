export interface JwtPayload {
  sub: string;
  email: string;
  role: 'ADMIN' | 'SUPERADMIN';
  iat?: number;
  exp?: number;
}
