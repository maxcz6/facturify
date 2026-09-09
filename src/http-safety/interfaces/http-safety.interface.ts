export interface UniformErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  details?: unknown;
  code?: string;
  retryAfterSeconds?: number;
  path: string;
  timestamp: string;
  requestId: string;
}
