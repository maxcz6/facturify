import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IGV_FACTOR,
  IGV_RATE,
  MAX_MONETARY_AMOUNT,
  MAX_QUANTITY,
  MAX_UNIT_PRICE,
  MONETARY_DECIMAL_PLACES,
  QUANTITY_MAX_DECIMAL_PLACES,
} from '../src/tax-calculation/tax-calculation.constants';
import { TaxCalculationModule } from '../src/tax-calculation/tax-calculation.module';
import { TaxCalculationService } from '../src/tax-calculation/tax-calculation.service';

describe('TaxCalculationService (Pure Prisma.Decimal Peruvian Tax Engine)', () => {
  let service: TaxCalculationService;

  beforeEach(() => {
    service = new TaxCalculationService();
  });

  describe('Dependency Injection & Module Setup', () => {
    it('should be instantiable directly and via module definitions', () => {
      expect(service).toBeDefined();
      expect(new TaxCalculationModule()).toBeDefined();
    });

    it('should expose correct constants', () => {
      expect(IGV_RATE.toString()).toBe('0.18');
      expect(IGV_FACTOR.toString()).toBe('1.18');
      expect(MONETARY_DECIMAL_PLACES).toBe(2);
      expect(QUANTITY_MAX_DECIMAL_PLACES).toBe(4);
      expect(MAX_QUANTITY.toString()).toBe('9999999999.9999');
      expect(MAX_UNIT_PRICE.toString()).toBe('999999999999.99');
      expect(MAX_MONETARY_AMOUNT.toString()).toBe('999999999999.99');
    });
  });

  describe('Cálculo por Ítem (Base Imponible, IGV 18%, Precio con Impuesto y Total)', () => {
    it('should calculate integer quantity and unit price correctly', () => {
      const result = service.calculateItem({
        description: 'Consultoría TI',
        quantity: 2,
        unitPrice: 100,
      });

      // Quantity & unit price preserved as Decimal
      expect(result.quantity).toBeInstanceOf(Prisma.Decimal);
      expect(result.quantity.toString()).toBe('2');
      expect(result.unitPrice).toBeInstanceOf(Prisma.Decimal);
      expect(result.unitPrice.toString()).toBe('100');

      // Subtotal = 2 * 100 = 200.00
      expect(result.subtotal).toBeInstanceOf(Prisma.Decimal);
      expect(result.subtotal.toString()).toBe('200');

      // IGV 18% = 200 * 0.18 = 36.00
      expect(result.tax).toBeInstanceOf(Prisma.Decimal);
      expect(result.tax.toString()).toBe('36');

      // Total = 200 + 36 = 236.00
      expect(result.total).toBeInstanceOf(Prisma.Decimal);
      expect(result.total.toString()).toBe('236');

      // Precio con impuesto (Unit Price * 1.18) = 118.00
      expect(result.unitPriceWithTax).toBeInstanceOf(Prisma.Decimal);
      expect(result.unitPriceWithTax.toString()).toBe('118');
      expect(result.priceWithTax).toEqual(result.unitPriceWithTax);

      // Metadata preserved
      expect(result.description).toBe('Consultoría TI');
    });

    it('should accept inputs as string, number, or Prisma.Decimal and return exclusively Prisma.Decimal', () => {
      const resultFromStrings = service.calculateItem({
        quantity: '3',
        unitPrice: '50.25',
      });
      const resultFromDecimals = service.calculateItem({
        quantity: new Prisma.Decimal('3'),
        unitPrice: new Prisma.Decimal('50.25'),
      });
      const resultFromNumbers = service.calculateItem({
        quantity: 3,
        unitPrice: 50.25,
      });

      expect(resultFromStrings.subtotal.toString()).toBe('150.75');
      expect(resultFromDecimals.subtotal.toString()).toBe('150.75');
      expect(resultFromNumbers.subtotal.toString()).toBe('150.75');

      // Verify all numeric output fields are Prisma.Decimal
      for (const res of [resultFromStrings, resultFromDecimals, resultFromNumbers]) {
        expect(res.quantity).toBeInstanceOf(Prisma.Decimal);
        expect(res.unitPrice).toBeInstanceOf(Prisma.Decimal);
        expect(res.unitPriceWithTax).toBeInstanceOf(Prisma.Decimal);
        expect(res.priceWithTax).toBeInstanceOf(Prisma.Decimal);
        expect(res.subtotal).toBeInstanceOf(Prisma.Decimal);
        expect(res.tax).toBeInstanceOf(Prisma.Decimal);
        expect(res.total).toBeInstanceOf(Prisma.Decimal);
      }
    });

    it('should apply half-up monetary rounding to line tax and line subtotal', () => {
      // 1 item * 33.33 = 33.33
      // IGV = 33.33 * 0.18 = 5.9994 -> rounds HALF_UP to 6.00
      // Total = 33.33 + 6.00 = 39.33
      const result = service.calculateItem({
        quantity: '1',
        unitPrice: '33.33',
      });

      expect(result.subtotal.toString()).toBe('33.33');
      expect(result.tax.toString()).toBe('6'); // 6.00
      expect(result.total.toString()).toBe('39.33');
    });

    it('should apply half-up monetary rounding to unit price with tax', () => {
      // Unit price = 15.75
      // 15.75 * 1.18 = 18.585 -> rounds HALF_UP to 18.59
      const result = service.calculateItem({
        quantity: '1',
        unitPrice: '15.75',
      });

      expect(result.unitPriceWithTax.toString()).toBe('18.59');
      expect(result.priceWithTax.toString()).toBe('18.59');
    });
  });

  describe('Cantidades Fraccionarias (hasta 4 decimales)', () => {
    it('should preserve fractional quantities with up to 4 decimal places', () => {
      // Quantity with exactly 4 decimal places: 1.2543 kg
      // Unit price: 25.50
      // Subtotal: 1.2543 * 25.50 = 31.98465 -> rounds to 31.98
      // IGV: 31.98 * 0.18 = 5.7564 -> rounds to 5.76
      // Total: 31.98 + 5.76 = 37.74
      const result = service.calculateItem({
        description: 'Venta de Granos a Granel (Kg)',
        quantity: '1.2543',
        unitPrice: '25.50',
      });

      expect(result.quantity.toString()).toBe('1.2543');
      expect(result.quantity.decimalPlaces()).toBe(4);
      expect(result.subtotal.toString()).toBe('31.98');
      expect(result.tax.toString()).toBe('5.76');
      expect(result.total.toString()).toBe('37.74');
    });

    it('should handle small fractional quantities such as 0.0001 (minimum supported precision)', () => {
      const result = service.calculateItem({
        quantity: '0.0001',
        unitPrice: '1000.00',
      });

      // 0.0001 * 1000 = 0.10
      expect(result.quantity.toString()).toBe('0.0001');
      expect(result.subtotal.toString()).toBe('0.1');
      // 0.10 * 0.18 = 0.018 -> rounds to 0.02
      expect(result.tax.toString()).toBe('0.02');
      // 0.10 + 0.02 = 0.12
      expect(result.total.toString()).toBe('0.12');
    });

    it('should reject quantities with more than 4 decimal places', () => {
      expect(() =>
        service.calculateItem({
          quantity: '1.23456',
          unitPrice: '10.00',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({
          quantity: 1.12345,
          unitPrice: 10.00,
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({
          quantity: new Prisma.Decimal('0.00001'),
          unitPrice: '10.00',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject unit prices with more than 2 decimal places', () => {
      expect(() =>
        service.calculateItem({
          quantity: '1',
          unitPrice: '10.555',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({
          quantity: '1',
          unitPrice: '10.500',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({
          quantity: 1,
          unitPrice: new Prisma.Decimal('25.999'),
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('Casos Clásicos de Error Binario de JavaScript (0.1 + 0.2, 0.07 * 100, etc.)', () => {
    it('should avoid JavaScript binary float inaccuracy on 0.1 + 0.2', () => {
      // In JavaScript native IEEE 754:
      // 0.1 + 0.2 === 0.30000000000000004 !== 0.3
      const jsNativeSum = 0.1 + 0.2;
      expect(jsNativeSum).not.toBe(0.3);

      // In TaxCalculationService using Prisma.Decimal:
      const doc = service.calculateDocument([
        { quantity: '1', unitPrice: '0.10' },
        { quantity: '1', unitPrice: '0.20' },
      ]);

      // Subtotal must be exactly 0.30
      expect(doc.subtotal.toString()).toBe('0.3');
      expect(doc.subtotal.toFixed(2)).toBe('0.30');
      expect(doc.subtotal.equals(new Prisma.Decimal('0.30'))).toBe(true);

      // Line items
      expect(doc.items[0].subtotal.toString()).toBe('0.1');
      expect(doc.items[1].subtotal.toString()).toBe('0.2');

      // IGV = (0.10 * 0.18 = 0.018 -> 0.02) + (0.20 * 0.18 = 0.036 -> 0.04) = 0.06
      expect(doc.tax.toString()).toBe('0.06');
      // Total = 0.30 + 0.06 = 0.36
      expect(doc.total.toString()).toBe('0.36');
    });

    it('should accurately calculate multiplications that drift in standard JS floats', () => {
      // In JS: 0.07 * 100 = 7.000000000000001
      expect(0.07 * 100).not.toBe(7);

      const item1 = service.calculateItem({
        quantity: 100,
        unitPrice: '0.07',
      });
      expect(item1.subtotal.toString()).toBe('7');
      expect(item1.subtotal.toFixed(2)).toBe('7.00');

      // In JS: 0.29 * 100 = 28.999999999999996
      expect(0.29 * 100).not.toBe(29);

      const item2 = service.calculateItem({
        quantity: 100,
        unitPrice: '0.29',
      });
      expect(item2.subtotal.toString()).toBe('29');
      expect(item2.subtotal.toFixed(2)).toBe('29.00');

      // In JS: 1.14 * 100 = 114.00000000000001
      expect(1.14 * 100).not.toBe(114);

      const item3 = service.calculateItem({
        quantity: 100,
        unitPrice: '1.14',
      });
      expect(item3.subtotal.toString()).toBe('114');
      expect(item3.subtotal.toFixed(2)).toBe('114.00');
    });
  });

  describe('Cálculo de Documento y Suma de Líneas Redondeadas (SUNAT Compliance)', () => {
    it('should calculate document totals by summing line-level rounded amounts', () => {
      // Line 1: 1 * 10.33 = 10.33 | tax = 10.33 * 0.18 = 1.8594 -> 1.86 | total = 12.19
      // Line 2: 1 * 20.33 = 20.33 | tax = 20.33 * 0.18 = 3.6594 -> 3.66 | total = 23.99
      // Line 3: 1 * 30.34 = 30.34 | tax = 30.34 * 0.18 = 5.4612 -> 5.46 | total = 35.80
      // Document Subtotal = 10.33 + 20.33 + 30.34 = 61.00
      // Document Tax = 1.86 + 3.66 + 5.46 = 10.98
      // Document Total = 12.19 + 23.99 + 35.80 = 71.98
      // Note: 61.00 + 10.98 = 71.98 (Perfect balance, zero 1-cent discrepancy!)

      const doc = service.calculateDocument([
        { quantity: 1, unitPrice: '10.33' },
        { quantity: 1, unitPrice: '20.33' },
        { quantity: 1, unitPrice: '30.34' },
      ]);

      expect(doc.itemCount).toBe(3);
      expect(doc.subtotal.toString()).toBe('61');
      expect(doc.subtotal.toFixed(2)).toBe('61.00');
      expect(doc.tax.toString()).toBe('10.98');
      expect(doc.total.toString()).toBe('71.98');

      // Verify that subtotal + tax strictly equals total
      expect(doc.subtotal.add(doc.tax).equals(doc.total)).toBe(true);

      // Verify each item in doc.items is fully calculated
      expect(doc.items[0].subtotal.toString()).toBe('10.33');
      expect(doc.items[0].tax.toString()).toBe('1.86');
      expect(doc.items[0].total.toString()).toBe('12.19');

      expect(doc.items[1].subtotal.toString()).toBe('20.33');
      expect(doc.items[1].tax.toString()).toBe('3.66');
      expect(doc.items[1].total.toString()).toBe('23.99');

      expect(doc.items[2].subtotal.toString()).toBe('30.34');
      expect(doc.items[2].tax.toString()).toBe('5.46');
      expect(doc.items[2].total.toString()).toBe('35.8');
    });

    it('should accept document input as an object with items array', () => {
      const doc = service.calculateDocument({
        items: [
          { description: 'Item 1', quantity: 2, unitPrice: '50.00' },
          { description: 'Item 2', quantity: 1, unitPrice: '100.00' },
        ],
      });

      expect(doc.itemCount).toBe(2);
      expect(doc.subtotal.toFixed(2)).toBe('200.00');
      expect(doc.tax.toFixed(2)).toBe('36.00');
      expect(doc.total.toFixed(2)).toBe('236.00');
    });

    it('should correctly handle multiple lines with fractional quantities and complex decimals', () => {
      const items = [
        { quantity: '2.5000', unitPrice: '12.40' }, // 31.00 -> tax 5.58 -> total 36.58
        { quantity: '0.7500', unitPrice: '8.80' },  // 6.60  -> tax 1.188 -> 1.19 -> total 7.79
        { quantity: '10.0000', unitPrice: '1.99' }, // 19.90 -> tax 3.582 -> 3.58 -> total 23.48
        { quantity: '3.1250', unitPrice: '40.00' }, // 125.00 -> tax 22.50 -> total 147.50
      ];

      const doc = service.calculateDocument(items);

      expect(doc.subtotal.toFixed(2)).toBe('182.50');
      expect(doc.tax.toFixed(2)).toBe('32.85');
      expect(doc.total.toFixed(2)).toBe('215.35');
      expect(doc.subtotal.add(doc.tax).equals(doc.total)).toBe(true);
    });
  });

  describe('Valores Límite y Desbordamientos (Overflow Checks)', () => {
    it('should allow maximum supported quantity (9999999999.9999)', () => {
      const result = service.calculateItem({
        quantity: MAX_QUANTITY,
        unitPrice: '0.01',
      });

      expect(result.quantity.equals(MAX_QUANTITY)).toBe(true);
      expect(result.subtotal.toString()).toBe('100000000'); // 9999999999.9999 * 0.01 = 99999999.999999 -> rounds HALF_UP to 100000000.00
      expect(result.subtotal.toFixed(2)).toBe('100000000.00');
    });

    it('should reject quantity exceeding MAX_QUANTITY (10 billion+)', () => {
      expect(() =>
        service.calculateItem({
          quantity: '10000000000',
          unitPrice: '1.00',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject unit price exceeding MAX_UNIT_PRICE', () => {
      expect(() =>
        service.calculateItem({
          quantity: '1',
          unitPrice: '1000000000000.00',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject line subtotal exceeding MAX_MONETARY_AMOUNT', () => {
      expect(() =>
        service.calculateItem({
          quantity: '9999999999',
          unitPrice: '999999999999.00',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject line total exceeding MAX_MONETARY_AMOUNT when subtotal is within bounds', () => {
      // subtotal = 900,000,000,000.00 <= MAX_MONETARY_AMOUNT
      // tax = 162,000,000,000.00
      // total = 1,062,000,000,000.00 > MAX_MONETARY_AMOUNT
      expect(() =>
        service.calculateItem({
          quantity: 1,
          unitPrice: '900000000000.00',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject document total exceeding MAX_MONETARY_AMOUNT', () => {
      expect(() =>
        service.calculateDocument([
          { quantity: 1, unitPrice: '600000000000.00' },
          { quantity: 1, unitPrice: '600000000000.00' },
        ]),
      ).toThrow(BadRequestException);
    });
  });

  describe('Rechazos y Validaciones Estrictas', () => {
    it('should reject document without items (empty array, null, undefined)', () => {
      expect(() => service.calculateDocument([])).toThrow(BadRequestException);
      expect(() => service.calculateDocument(null as any)).toThrow(BadRequestException);
      expect(() => service.calculateDocument(undefined as any)).toThrow(BadRequestException);
      expect(() => service.calculateDocument({} as any)).toThrow(BadRequestException);
      expect(() => service.calculateDocument({ items: [] })).toThrow(BadRequestException);
    });

    it('should reject zero quantity', () => {
      expect(() =>
        service.calculateItem({ quantity: 0, unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: '0', unitPrice: '10.00' }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({
          quantity: new Prisma.Decimal(0),
          unitPrice: '10.00',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject negative quantity', () => {
      expect(() =>
        service.calculateItem({ quantity: -1, unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: '-0.0001', unitPrice: '10.00' }),
      ).toThrow(BadRequestException);
    });

    it('should reject zero unit price', () => {
      expect(() =>
        service.calculateItem({ quantity: 1, unitPrice: 0 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: '1', unitPrice: '0' }),
      ).toThrow(BadRequestException);
    });

    it('should reject negative unit price', () => {
      expect(() =>
        service.calculateItem({ quantity: 1, unitPrice: -10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: '1', unitPrice: '-0.01' }),
      ).toThrow(BadRequestException);
    });

    it('should reject non-finite values (NaN, Infinity, -Infinity)', () => {
      expect(() =>
        service.calculateItem({ quantity: NaN, unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: 1, unitPrice: Infinity }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: -Infinity, unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({
          quantity: new Prisma.Decimal(NaN),
          unitPrice: 10,
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject non-numeric string values', () => {
      expect(() =>
        service.calculateItem({ quantity: 'abc', unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: '', unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: '  ', unitPrice: 10 }),
      ).toThrow(BadRequestException);
    });

    it('should reject null or undefined fields within an item', () => {
      expect(() =>
        service.calculateItem({ quantity: null as any, unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: 1, unitPrice: undefined as any }),
      ).toThrow(BadRequestException);
    });

    it('should reject non-numeric and non-string types such as booleans, arrays and objects', () => {
      expect(() =>
        service.calculateItem({ quantity: true as any, unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: [1] as any, unitPrice: 10 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.calculateItem({ quantity: 1, unitPrice: { amount: 10 } as any }),
      ).toThrow(BadRequestException);
    });

    it('should reject invalid item object', () => {
      expect(() => service.calculateItem(null as any)).toThrow(BadRequestException);
      expect(() => service.calculateItem('not-an-object' as any)).toThrow(BadRequestException);
    });

    it('should include item index in document-level errors', () => {
      try {
        service.calculateDocument([
          { quantity: 1, unitPrice: 10 },
          { quantity: -5, unitPrice: 20 },
        ]);
        fail('Expected calculateDocument to throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.message).toContain('ítem #2');
      }
    });
  });

  describe('Método Auxiliar roundMoney()', () => {
    it('should round monetary amounts using HALF_UP', () => {
      expect(service.roundMoney('10.005').toString()).toBe('10.01');
      expect(service.roundMoney('10.004').toString()).toBe('10');
      expect(service.roundMoney(new Prisma.Decimal('123.456')).toString()).toBe('123.46');
    });

    it('should reject non-finite values in roundMoney', () => {
      expect(() => service.roundMoney(NaN)).toThrow(BadRequestException);
      expect(() => service.roundMoney(Infinity)).toThrow(BadRequestException);
    });
  });
});
