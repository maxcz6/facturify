import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IGV_FACTOR,
  IGV_RATE,
  MAX_MONETARY_AMOUNT,
  MAX_QUANTITY,
  MAX_UNIT_PRICE,
  MONETARY_DECIMAL_PLACES,
  QUANTITY_MAX_DECIMAL_PLACES,
} from './tax-calculation.constants';
import {
  CalculatedLineItem,
  DocumentCalculationInput,
  DocumentTaxSummary,
  TaxableItemInput,
} from './tax-calculation.interface';

@Injectable()
export class TaxCalculationService {
  /**
   * Calculates tax and totals for a single line item.
   * Uses strictly Prisma.Decimal for exact decimal arithmetic.
   *
   * @param item Raw line item input
   * @returns Calculated line item with strictly Prisma.Decimal values
   */
  calculateItem(item: TaxableItemInput): CalculatedLineItem {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException('El ítem debe ser un objeto válido.');
    }

    const quantity = this.parseQuantity(item.quantity);
    const unitPrice = this.parseUnitPrice(item.unitPrice);

    // Subtotal (Base Imponible) = Cantidad * Valor Unitario (rounded to 2 decimal places)
    const rawSubtotal = quantity.mul(unitPrice);
    const subtotal = rawSubtotal.toDecimalPlaces(
      MONETARY_DECIMAL_PLACES,
      Prisma.Decimal.ROUND_HALF_UP,
    );

    if (subtotal.greaterThan(MAX_MONETARY_AMOUNT)) {
      throw new BadRequestException(
        'El subtotal de la línea excede el límite monetario permitido.',
      );
    }

    // IGV (18%) = Base Imponible * 0.18 (rounded to 2 decimal places)
    const rawTax = subtotal.mul(IGV_RATE);
    const tax = rawTax.toDecimalPlaces(
      MONETARY_DECIMAL_PLACES,
      Prisma.Decimal.ROUND_HALF_UP,
    );

    // Total de Línea = Subtotal + IGV
    const total = subtotal.add(tax);

    if (total.greaterThan(MAX_MONETARY_AMOUNT)) {
      throw new BadRequestException(
        'El total de la línea excede el límite monetario permitido.',
      );
    }


    // Precio de Venta Unitario (con IGV) = Valor Unitario * 1.18 (rounded to 2 decimal places)
    const rawUnitPriceWithTax = unitPrice.mul(IGV_FACTOR);
    const unitPriceWithTax = rawUnitPriceWithTax.toDecimalPlaces(
      MONETARY_DECIMAL_PLACES,
      Prisma.Decimal.ROUND_HALF_UP,
    );

    return {
      ...item,
      quantity,
      unitPrice,
      unitPriceWithTax,
      priceWithTax: unitPriceWithTax,
      subtotal,
      tax,
      total,
    };
  }

  /**
   * Calculates tax and totals for an entire document.
   * Document totals are strictly obtained by summing line-level rounded amounts
   * to guarantee zero discrepancy with SUNAT requirements.
   *
   * @param input List of items or object containing items
   * @returns Complete document tax summary with strictly Prisma.Decimal values
   */
  calculateDocument(input: DocumentCalculationInput): DocumentTaxSummary {
    let items: TaxableItemInput[];

    if (Array.isArray(input)) {
      items = input;
    } else if (input && typeof input === 'object' && Array.isArray(input.items)) {
      items = input.items;
    } else {
      throw new BadRequestException(
        'El documento debe contener una lista de ítems válida.',
      );
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'El documento debe contener al menos un ítem.',
      );
    }

    const calculatedItems: CalculatedLineItem[] = items.map((item, index) => {
      try {
        return this.calculateItem(item);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error de validación';
        throw new BadRequestException(
          `Error en el ítem #${index + 1}: ${message}`,
        );
      }
    });

    // Sum rounded line-level amounts to avoid SUNAT 1-cent discrepancies
    const zero = new Prisma.Decimal(0);
    const subtotal = calculatedItems.reduce(
      (sum, item) => sum.add(item.subtotal),
      zero,
    );
    const tax = calculatedItems.reduce(
      (sum, item) => sum.add(item.tax),
      zero,
    );
    const total = calculatedItems.reduce(
      (sum, item) => sum.add(item.total),
      zero,
    );

    if (
      subtotal.greaterThan(MAX_MONETARY_AMOUNT) ||
      tax.greaterThan(MAX_MONETARY_AMOUNT) ||
      total.greaterThan(MAX_MONETARY_AMOUNT)
    ) {
      throw new BadRequestException(
        'El importe total del documento excede el límite máximo permitido.',
      );
    }

    return {
      subtotal,
      tax,
      total,
      items: calculatedItems,
      itemCount: calculatedItems.length,
    };
  }

  /**
   * Rounds a monetary amount to 2 decimal places using HALF_UP.
   * Never uses JavaScript floating point operations.
   */
  roundMoney(val: Prisma.Decimal | string | number): Prisma.Decimal {
    const decimal = this.parseDecimal(val, 'monto');
    return decimal.toDecimalPlaces(
      MONETARY_DECIMAL_PLACES,
      Prisma.Decimal.ROUND_HALF_UP,
    );
  }

  /**
   * Parses and validates item quantity:
   * - Must be positive (> 0)
   * - Must be finite
   * - Max 4 decimal places
   * - <= MAX_QUANTITY
   */
  parseQuantity(val: unknown): Prisma.Decimal {
    const decimal = this.parseDecimal(val, 'cantidad');

    if (decimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException('La cantidad debe ser mayor a cero.');
    }

    this.validateDecimalPlaces(
      val,
      decimal,
      QUANTITY_MAX_DECIMAL_PLACES,
      'cantidad',
    );

    if (decimal.greaterThan(MAX_QUANTITY)) {
      throw new BadRequestException(
        `La cantidad excede el límite máximo permitido (${MAX_QUANTITY.toString()}).`,
      );
    }

    return decimal;
  }

  /**
   * Parses and validates item unit price (valor unitario sin IGV):
   * - Must be positive (> 0)
   * - Must be finite
   * - Max 2 decimal places
   * - <= MAX_UNIT_PRICE
   */
  parseUnitPrice(val: unknown): Prisma.Decimal {
    const decimal = this.parseDecimal(val, 'valor unitario');

    if (decimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'El valor unitario debe ser mayor a cero.',
      );
    }

    this.validateDecimalPlaces(
      val,
      decimal,
      MONETARY_DECIMAL_PLACES,
      'valor unitario',
    );

    if (decimal.greaterThan(MAX_UNIT_PRICE)) {
      throw new BadRequestException(
        `El valor unitario excede el límite máximo permitido (${MAX_UNIT_PRICE.toString()}).`,
      );
    }

    return decimal;
  }

  /**
   * Validates that the input value does not exceed the allowed decimal places.
   */
  private validateDecimalPlaces(
    val: unknown,
    decimal: Prisma.Decimal,
    maxPlaces: number,
    fieldName: string,
  ): void {
    if (decimal.decimalPlaces() > maxPlaces) {
      throw new BadRequestException(
        `El campo '${fieldName}' no puede tener más de ${maxPlaces} decimales.`,
      );
    }

    if (typeof val === 'string') {
      const trimmed = val.trim();
      const dotIndex = trimmed.indexOf('.');
      if (dotIndex !== -1) {
        const literalPlaces = trimmed.length - dotIndex - 1;
        if (literalPlaces > maxPlaces) {
          throw new BadRequestException(
            `El campo '${fieldName}' no puede tener más de ${maxPlaces} decimales.`,
          );
        }
      }
    }
  }

  /**
   * Converts and validates raw input into a finite Prisma.Decimal.
   */
  private parseDecimal(val: unknown, fieldName: string): Prisma.Decimal {
    if (val === null || val === undefined) {
      throw new BadRequestException(`El campo '${fieldName}' es requerido.`);
    }

    if (typeof val === 'number') {
      if (!Number.isFinite(val)) {
        throw new BadRequestException(
          `El campo '${fieldName}' debe ser un número finito válido.`,
        );
      }
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') {
        throw new BadRequestException(
          `El campo '${fieldName}' no puede estar vacío.`,
        );
      }
      if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
        throw new BadRequestException(
          `El campo '${fieldName}' tiene un formato numérico inválido.`,
        );
      }
    } else if (!Prisma.Decimal.isDecimal(val)) {
      throw new BadRequestException(
        `El campo '${fieldName}' debe ser de tipo numérico, texto o Prisma.Decimal.`,
      );
    }

    let decimal: Prisma.Decimal;
    try {
      decimal = new Prisma.Decimal(val as any);
    } catch {
      throw new BadRequestException(
        `El campo '${fieldName}' no pudo ser interpretado como un valor numérico válido.`,
      );
    }

    if (!decimal.isFinite() || decimal.isNaN()) {
      throw new BadRequestException(
        `El campo '${fieldName}' debe ser un número finito válido.`,
      );
    }

    return decimal;
  }
}
