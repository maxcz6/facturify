import { Module } from '@nestjs/common';
import { CompanySunatConfigService } from './company-sunat-config.service';
import { SUNAT_GATEWAY } from './sunat-gateway';
import { UnconfiguredSunatGateway } from './unconfigured-sunat.gateway';
import { SunatSoapGateway } from './sunat-soap.gateway';

// The concrete SOAP/REST adapter is registered after its endpoint and timeout
// policies are validated against the current official SUNAT documentation.
@Module({
  providers: [
    CompanySunatConfigService,
    UnconfiguredSunatGateway,
    SunatSoapGateway,
    { provide: SUNAT_GATEWAY, useExisting: SunatSoapGateway },
  ],
  exports: [CompanySunatConfigService, SUNAT_GATEWAY],
})
export class SunatModule {}
