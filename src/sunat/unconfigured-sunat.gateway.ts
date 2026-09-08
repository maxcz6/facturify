import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GetStatusRequest, GetStatusResult, SendBillRequest, SendBillResult, SendSummaryRequest, SendSummaryResult, SunatGateway } from './sunat-gateway';

@Injectable()
export class UnconfiguredSunatGateway implements SunatGateway {
  async sendBill(_request: SendBillRequest): Promise<SendBillResult> {
    throw new ServiceUnavailableException('SUNAT transport adapter is not configured.');
  }
  async sendSummary(_request: SendSummaryRequest): Promise<SendSummaryResult> {
    throw new ServiceUnavailableException('SUNAT transport adapter is not configured.');
  }
  async getStatus(_request: GetStatusRequest): Promise<GetStatusResult> {
    throw new ServiceUnavailableException('SUNAT transport adapter is not configured.');
  }
}
