import { Prisma } from '@prisma/client';

/**
 * Raw input representing a line item for tax calculation.
 * Numeric fields can be passed as Prisma.Decimal, string, or number.
 */
export interface TaxableItemInput {
  description?: string;
  quantity: Prisma.Decimal | string | number;
  unitPrice: Prisma.Decimal | string | number;
  [key: string]: unknown;
}

/**
 * Result of calculating a single taxable line item.
 * All monetary amounts and quantities are returned strictly as Prisma.Decimal.
 */
export interface CalculatedLineItem {
  description?: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  unitPriceWithTax: Prisma.Decimal;
  priceWithTax: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  [key: string]: unknown;
}

/**
 * Aggregate tax summary for a document.
 * Totals are calculated by summing line-level rounded amounts.
 * All monetary amounts are returned strictly as Prisma.Decimal.
 */
export interface DocumentTaxSummary {
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  items: CalculatedLineItem[];
  itemCount: number;
}

/**
 * Supported inputs for document-level calculation.
 * Accepts either a direct array of items or an object containing an items array.
 */
export type DocumentCalculationInput =
  | TaxableItemInput[]
  | {
      items: TaxableItemInput[];
      [key: string]: unknown;
    };
