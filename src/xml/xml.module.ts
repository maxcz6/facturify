import { Module } from '@nestjs/common';
import { UblInvoiceService } from './ubl-invoice.service';
import { XmlSignatureService } from './xml-signature.service';
import { SunatZipService } from './sunat-zip.service';
import { UblDailySummaryService } from './ubl-daily-summary.service';
import { UblAdjustmentNoteService } from './ubl-adjustment-note.service';
import { UblVoidedDocumentsService } from './ubl-voided-documents.service';

@Module({
  providers: [UblInvoiceService, UblDailySummaryService, UblAdjustmentNoteService, UblVoidedDocumentsService, XmlSignatureService, SunatZipService],
  exports: [UblInvoiceService, UblDailySummaryService, UblAdjustmentNoteService, UblVoidedDocumentsService, XmlSignatureService, SunatZipService],
})
export class XmlModule {}
