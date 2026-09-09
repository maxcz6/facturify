import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DailySummaryStatus, DocumentStatus, DocumentType } from '@prisma/client';
import { CertificatesService } from '../certificates/certificates.service';
import { Pkcs12ExtractorService } from '../certificates/pkcs12-extractor.service';
import { CdrService } from '../cdr/cdr.service';
import { PrismaService } from '../prisma/prisma.service';
import { DOCUMENT_STORAGE, DocumentStorage } from '../storage/storage.interface';
import { CompanySunatConfigService } from '../sunat/company-sunat-config.service';
import { SUNAT_GATEWAY, SunatGateway } from '../sunat/sunat-gateway';
import { SunatZipService } from '../xml/sunat-zip.service';
import { UblDailySummaryService } from '../xml/ubl-daily-summary.service';
import { XmlSignatureService } from '../xml/xml-signature.service';
import { DocumentEventOutboxService } from '../outbox/document-event-outbox.service';
import { SunatTicketPollingPolicyService } from '../sunat-ticket-policy/sunat-ticket-polling-policy.service';

@Injectable()
export class DailySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ubl: UblDailySummaryService,
    private readonly signatures: XmlSignatureService,
    private readonly zip: SunatZipService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly certificates: CertificatesService,
    private readonly extractor: Pkcs12ExtractorService,
    private readonly credentials: CompanySunatConfigService,
    @Inject(SUNAT_GATEWAY) private readonly gateway: SunatGateway,
    private readonly cdr: CdrService,
    private readonly eventOutbox?: DocumentEventOutboxService,
    private readonly ticketPolicy?: SunatTicketPollingPolicyService,
  ) {}

  async createAndSend(companyId: string, referenceDateInput: string) {
    const referenceDate = this.parseDate(referenceDateInput);
    const nextDate = new Date(referenceDate); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found.');
    const receipts = await this.prisma.document.findMany({
      where: { companyId, type: DocumentType.RECEIPT, status: DocumentStatus.PENDING, issuedAt: { gte: referenceDate, lt: nextDate } },
      orderBy: [{ series: 'asc' }, { number: 'asc' }],
      take: 501,
    });
    if (receipts.length === 0) throw new ConflictException('No pending receipts exist for this date.');
    if (receipts.length > 500) throw new ConflictException('More than 500 receipts require multiple daily summaries.');

    const summary = await this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.dailySummary.aggregate({
        where: { companyId, referenceDate }, _max: { sequence: true },
      });
      return tx.dailySummary.create({
        data: {
          companyId, referenceDate, sequence: (aggregate._max.sequence ?? 0) + 1,
          documents: { create: receipts.map((document) => ({ documentId: document.id })) },
        },
      });
    }, { isolationLevel: 'Serializable' });

    let zipArtifactId: string | undefined;
    try {
      const datePart = referenceDateInput.replaceAll('-', '');
      const summaryId = `RC-${datePart}-${summary.sequence}`;
      const unsigned = this.ubl.generateUnsigned({
        id: summaryId, referenceDate: referenceDateInput,
        issueDate: new Date().toISOString().slice(0, 10),
        supplierRuc: company.ruc, supplierName: company.businessName,
        lines: receipts.map((document, index) => ({
          lineId: index + 1, documentId: `${document.series}-${document.number}`,
          customerDocumentType: document.customerDocumentType ?? '0',
          customerDocumentNumber: document.customerDocumentNumber ?? '-',
          currency: document.currency, taxableAmount: document.subtotal.toFixed(2),
          taxAmount: document.tax.toFixed(2), totalAmount: document.total.toFixed(2),
        })),
      });
      const encrypted = await this.certificates.getActiveSigningMaterial(companyId);
      const material = await this.extractor.extract(encrypted.pfx, encrypted.password);
      const signed = this.signatures.sign(unsigned, { ...material, signatureId: `Signature-${summaryId}` });
      const packed = this.zip.packSummaryXml(signed, company.ruc, summaryId);
      const artifact = await this.storage.save(companyId, 'ZIP', packed.content);
      zipArtifactId = artifact.id;
      const sol = await this.credentials.getDecryptedSolCredential(companyId);
      const sent = await this.gateway.sendSummary({
        fileName: packed.zipFileName, zipContent: packed.content,
        credentials: { ruc: sol.ruc, solUsername: sol.username, solPassword: sol.password },
        environment: sol.environment,
      });
      await this.prisma.dailySummary.update({
        where: { id: summary.id }, data: { status: DailySummaryStatus.SENT, ticket: sent.ticket, zipArtifactId,
          pollAttempt: 0, ticketSubmittedAt: new Date(), nextPollAt: null },
      });
      return { id: summary.id, status: DailySummaryStatus.SENT, ticket: sent.ticket, documentCount: receipts.length };
    } catch (error) {
      if (zipArtifactId) await this.storage.delete(companyId, zipArtifactId).catch(() => false);
      await this.prisma.dailySummary.update({ where: { id: summary.id }, data: { status: DailySummaryStatus.ERROR, sunatMessage: this.safeMessage(error) } });
      throw error;
    }
  }

  async refreshStatus(companyId: string, summaryId: string) {
    const summary = await this.prisma.dailySummary.findFirst({
      where: { id: summaryId, companyId }, include: { documents: true },
    });
    if (!summary) throw new NotFoundException('Daily summary not found.');
    if (summary.status !== DailySummaryStatus.SENT || !summary.ticket) {
      throw new ConflictException('Daily summary does not have a pending SUNAT ticket.');
    }
    const now = new Date();
    if (this.ticketPolicy && summary.nextPollAt && summary.nextPollAt > now) {
      throw new ConflictException('SUNAT ticket is not ready for another status check.');
    }
    let claimed = summary;
    if (this.ticketPolicy) {
      const leaseUntil = new Date(now.getTime() + 120_000);
      const claim = await this.prisma.dailySummary.updateMany({
        where: { id: summary.id, status: DailySummaryStatus.SENT,
          OR: [{ nextPollAt: null }, { nextPollAt: { lte: now } }] },
        data: { pollAttempt: { increment: 1 }, nextPollAt: leaseUntil },
      });
      if (claim.count !== 1) throw new ConflictException('SUNAT ticket status check is already in progress.');
      claimed = (await this.prisma.dailySummary.findUnique({ where: { id: summary.id }, include: { documents: true } }))!;
    }
    const sol = await this.credentials.getDecryptedSolCredential(companyId);
    const result = await this.gateway.getStatus({
      ticket: summary.ticket,
      credentials: { ruc: sol.ruc, solUsername: sol.username, solPassword: sol.password },
      environment: sol.environment,
    });
    if (this.ticketPolicy) {
      const decision = this.ticketPolicy.evaluate({
        attempt: claimed.pollAttempt, sunatStatusCode: result.statusCode,
        elapsedMs: Math.max(0, now.getTime() - (claimed.ticketSubmittedAt ?? claimed.updatedAt).getTime()), jitter: 0,
      });
      if (decision.outcome === 'PENDING') {
        await this.prisma.dailySummary.update({ where: { id: summary.id }, data: { nextPollAt: new Date(now.getTime() + decision.nextDelayMs!) } });
        return { id: summary.id, status: DailySummaryStatus.SENT, pending: true };
      }
      if (decision.outcome !== 'PROCESS_CDR') {
        await this.prisma.dailySummary.update({ where: { id: summary.id }, data: { status: DailySummaryStatus.ERROR, sunatMessage: 'SUNAT ticket polling ended without a processable CDR.' } });
        throw new ConflictException('SUNAT ticket polling ended without a processable CDR.');
      }
    } else if (result.statusCode === '98') return { id: summary.id, status: DailySummaryStatus.SENT, pending: true };
    if (!result.cdrZip) throw new ConflictException(`SUNAT completed ticket without a CDR (status ${result.statusCode}).`);
    const parsed = this.cdr.extractAndParse(result.cdrZip);
    const artifact = await this.storage.save(companyId, 'CDR', result.cdrZip);
    const accepted = parsed.status === 'ACCEPTED' || parsed.status === 'OBSERVED';
    const documentStatus = parsed.status === 'OBSERVED' ? DocumentStatus.OBSERVED
      : accepted ? DocumentStatus.ACCEPTED : DocumentStatus.REJECTED;
    try {
      if (this.eventOutbox) {
        await this.prisma.$transaction(async (tx) => {
          await tx.dailySummary.update({ where: { id: summary.id }, data: {
            status: accepted ? DailySummaryStatus.ACCEPTED : DailySummaryStatus.REJECTED,
            cdrArtifactId: artifact.id, sunatCode: parsed.responseCode, sunatMessage: parsed.description,
          } });
          for (const entry of summary.documents) {
            const updated = await tx.document.update({ where: { id: entry.documentId }, data: {
              status: documentStatus, sunatCode: parsed.responseCode, sunatMessage: parsed.description,
            } });
            const event = documentStatus === DocumentStatus.ACCEPTED ? 'document.accepted'
              : documentStatus === DocumentStatus.OBSERVED ? 'document.observed' : 'document.rejected';
            await this.eventOutbox!.enqueue(event, updated, tx);
          }
        });
      } else {
        await this.prisma.$transaction([
          this.prisma.dailySummary.update({ where: { id: summary.id }, data: {
            status: accepted ? DailySummaryStatus.ACCEPTED : DailySummaryStatus.REJECTED,
            cdrArtifactId: artifact.id, sunatCode: parsed.responseCode, sunatMessage: parsed.description,
          } }),
          this.prisma.document.updateMany({
            where: { id: { in: summary.documents.map((entry) => entry.documentId) }, companyId },
            data: { status: documentStatus, sunatCode: parsed.responseCode, sunatMessage: parsed.description },
          }),
        ]);
      }
    } catch (error) {
      await this.storage.delete(companyId, artifact.id).catch(() => false);
      throw error;
    }
    return { id: summary.id, status: accepted ? DailySummaryStatus.ACCEPTED : DailySummaryStatus.REJECTED, pending: false };
  }

  private parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('referenceDate must use YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid referenceDate.');
    return date;
  }
  private safeMessage(error: unknown): string {
    return error instanceof Error ? error.name.slice(0, 100) : 'Daily summary failed.';
  }
}
