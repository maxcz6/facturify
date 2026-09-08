export interface UblParty {
  documentType: string;
  documentNumber: string;
  legalName: string;
}

export interface UblInvoiceLine {
  id: number;
  description: string;
  quantity: string;
  unitCode?: string;
  unitValue: string;
  lineExtensionAmount: string;
  taxAmount: string;
  totalAmount: string;
}

export interface UblInvoiceInput {
  documentId: string;
  issueDate: string;
  invoiceTypeCode: '01' | '03';
  currency: string;
  supplier: UblParty;
  customer: UblParty;
  subtotal: string;
  taxAmount: string;
  total: string;
  lines: UblInvoiceLine[];
}
