import { Module } from '@nestjs/common';
import { SunatCatalogsService } from './sunat-catalogs.service';

@Module({
  providers: [SunatCatalogsService],
  exports: [SunatCatalogsService],
})
export class SunatCatalogsModule {}
