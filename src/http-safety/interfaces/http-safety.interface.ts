export interface UniformErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  details?: unknown;
  path: string;
  timestamp: string;
  requestId: string;
}
