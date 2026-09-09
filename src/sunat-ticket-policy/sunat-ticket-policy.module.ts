import { Module } from '@nestjs/common';
import { SunatTicketPollingPolicyService } from './sunat-ticket-polling-policy.service';

@Module({
  providers: [SunatTicketPollingPolicyService],
  exports: [SunatTicketPollingPolicyService],
})
export class SunatTicketPolicyModule {}
