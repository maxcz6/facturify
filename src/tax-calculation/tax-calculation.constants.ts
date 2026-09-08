import { Prisma } from '@prisma/client';

/**
 * Standard Peruvian IGV (Impuesto General a las Ventas) rate: 18% (0.18).
 */
export const IGV_RATE = new Prisma.Decimal('0.18');

/**
 * IGV Factor to calculate gross unit price with tax: 1.18.
 */
export const IGV_FACTOR = new Prisma.Decimal('1.18');

/**
 * IGV percentage representation: 18.
 */
export const IGV_PERCENTAGE = 18;

/**
 * Maximum allowed decimal places for monetary amounts (unit price, subtotal, tax, total).
 */
export const MONETARY_DECIMAL_PLACES = 2;

/**
 * Maximum allowed decimal places for item quantities (conserva hasta 4 decimales).
 */
export const QUANTITY_MAX_DECIMAL_PLACES = 4;

/**
 * Maximum quantity allowed by schema (Decimal(14, 4) -> 10 integer digits + 4 decimals).
 */
export const MAX_QUANTITY = new Prisma.Decimal('9999999999.9999');

/**
 * Maximum unit price allowed by schema (Decimal(14, 2) -> 12 integer digits + 2 decimals).
 */
export const MAX_UNIT_PRICE = new Prisma.Decimal('999999999999.99');

/**
 * Maximum document or line monetary amount allowed by schema (Decimal(14, 2) -> 12 integer digits + 2 decimals).
 */
export const MAX_MONETARY_AMOUNT = new Prisma.Decimal('999999999999.99');
