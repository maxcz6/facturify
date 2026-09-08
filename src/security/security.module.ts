import { Global, Module } from '@nestjs/common';
import { SecretsEncryptionService } from './secrets-encryption.service';

@Global()
@Module({
  providers: [SecretsEncryptionService],
  exports: [SecretsEncryptionService],
})
export class SecurityModule {}
