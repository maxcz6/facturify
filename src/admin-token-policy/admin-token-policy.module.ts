import { Module } from '@nestjs/common';
import { AdminTokenPolicyService } from './admin-token-policy.service';

@Module({
  providers: [AdminTokenPolicyService],
  exports: [AdminTokenPolicyService],
})
export class AdminTokenPolicyModule {}
