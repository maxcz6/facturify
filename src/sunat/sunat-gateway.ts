export const SUNAT_GATEWAY = Symbol('SUNAT_GATEWAY');

export interface SunatCredentials {
  ruc: string;
  solUsername: string;
  solPassword: string;
}

export interface SendBillRequest {
  fileName: string;
  zipContent: Buffer;
  credentials: SunatCredentials;
  environment: 'BETA' | 'PRODUCTION';
}

export interface SendBillResult {
  cdrZip: Buffer;
  requestId: string;
}

export interface SendSummaryRequest extends SendBillRequest {}

export interface SendSummaryResult {
  ticket: string;
  requestId: string;
}

export interface GetStatusRequest {
  ticket: string;
  credentials: SunatCredentials;
  environment: 'BETA' | 'PRODUCTION';
}

export interface GetStatusResult {
  statusCode: string;
  cdrZip?: Buffer;
  requestId: string;
}

export interface SunatGateway {
  sendBill(request: SendBillRequest): Promise<SendBillResult>;
  sendSummary(request: SendSummaryRequest): Promise<SendSummaryResult>;
  getStatus(request: GetStatusRequest): Promise<GetStatusResult>;
}
