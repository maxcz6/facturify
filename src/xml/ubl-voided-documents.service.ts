import { BadRequestException, Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';

export interface VoidedDocumentInput {
  id: string;
  referenceDate: string;
  issueDate: string;
  supplierRuc: string;
  supplierName: string;
  lines: Array<{ lineId: number; documentTypeCode: '01' | '03' | '07' | '08'; series: string; number: number; reason: string }>;
}

@Injectable()
export class UblVoidedDocumentsService {
  generateUnsigned(input: VoidedDocumentInput): string {
    this.validate(input);
    const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('VoidedDocuments', {
      xmlns: 'urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
    });
    root.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent').up().up().up();
    root.ele('cbc:UBLVersionID').txt('2.0').up();
    root.ele('cbc:CustomizationID').txt('1.0').up();
    root.ele('cbc:ID').txt(input.id).up();
    root.ele('cbc:ReferenceDate').txt(input.referenceDate).up();
    root.ele('cbc:IssueDate').txt(input.issueDate).up();
    const signature = root.ele('cac:Signature');
    signature.ele('cbc:ID').txt(`IDSign-${input.id}`).up();
    signature.ele('cac:SignatoryParty').ele('cac:PartyIdentification').ele('cbc:ID').txt(input.supplierRuc).up().up().up();
    signature.ele('cac:DigitalSignatureAttachment').ele('cac:ExternalReference').ele('cbc:URI').txt(`#Signature-${input.id}`).up().up().up(); signature.up();
    const supplier = root.ele('cac:AccountingSupplierParty');
    supplier.ele('cbc:CustomerAssignedAccountID').txt(input.supplierRuc).up();
    supplier.ele('cbc:AdditionalAccountID').txt('6').up();
    supplier.ele('cac:Party').ele('cac:PartyLegalEntity').ele('cbc:RegistrationName').txt(input.supplierName).up().up().up(); supplier.up();
    for (const line of input.lines) {
      const node = root.ele('sac:VoidedDocumentsLine');
      node.ele('cbc:LineID').txt(String(line.lineId)).up();
      node.ele('cbc:DocumentTypeCode').txt(line.documentTypeCode).up();
      node.ele('sac:DocumentSerialID').txt(line.series).up();
      node.ele('sac:DocumentNumberID').txt(String(line.number)).up();
      node.ele('sac:VoidReasonDescription').txt(line.reason).up(); node.up();
    }
    return root.end({ prettyPrint: true });
  }

  private validate(input: VoidedDocumentInput): void {
    if (!/^RA-\d{8}-\d{1,5}$/.test(input.id)) throw new BadRequestException('Invalid void communication ID.');
    if (!/^\d{11}$/.test(input.supplierRuc)) throw new BadRequestException('Invalid supplier RUC.');
    if (!input.lines.length || input.lines.length > 500) throw new BadRequestException('A void communication requires between 1 and 500 lines.');
    for (const line of input.lines) {
      if (!/^[FB][A-Z0-9]{3}$/.test(line.series) || !Number.isSafeInteger(line.number) || line.number < 1) throw new BadRequestException('Invalid document in void communication.');
      if (!line.reason.trim() || line.reason.length > 100) throw new BadRequestException('Invalid void reason.');
    }
  }
}
