import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  WebhookDnsSafetyService,
  WebhookDnsSafetyModule,
  DnsResolver,
  GENERIC_DNS_SAFETY_ERROR_MESSAGE,
  isPrivateOrRestrictedIPv4,
  isPrivateOrRestrictedIPv6,
  isPublicRoutableIp,
} from '../src/webhook-dns-safety';

describe('WebhookDnsSafetyService', () => {
  let service: WebhookDnsSafetyService;
  let mockResolver: jest.Mocked<DnsResolver>;

  beforeEach(async () => {
    mockResolver = {
      resolve4: jest.fn().mockResolvedValue([]),
      resolve6: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [WebhookDnsSafetyModule],
    })
      .overrideProvider(WebhookDnsSafetyService)
      .useValue(new WebhookDnsSafetyService(mockResolver))
      .compile();

    service = module.get<WebhookDnsSafetyService>(WebhookDnsSafetyService);
  });

  describe('Instanciación Pura y Módulo', () => {
    it('debe poder instanciarse directamente sin NestJS con o sin resolver personalizado', () => {
      const pureDefault = new WebhookDnsSafetyService();
      expect(pureDefault).toBeInstanceOf(WebhookDnsSafetyService);

      const pureCustom = new WebhookDnsSafetyService(mockResolver);
      expect(pureCustom).toBeInstanceOf(WebhookDnsSafetyService);
    });

    it('debe estar provisto por WebhookDnsSafetyModule', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Resolución de IPs Públicas Válidas (IPv4, IPv6 y Mixtas)', () => {
    it('debe aceptar y normalizar respuesta exclusiva con IPv4 públicas', async () => {
      mockResolver.resolve4.mockResolvedValueOnce(['93.184.216.34', '198.51.200.1']);
      mockResolver.resolve6.mockResolvedValueOnce([]);

      const result = await service.validateWebhookDestination('https://example.com/webhook');

      expect(result).toEqual({
        allowed: true,
        addresses: ['93.184.216.34', '198.51.200.1'],
      });
      expect(mockResolver.resolve4).toHaveBeenCalledWith('example.com');
      expect(mockResolver.resolve6).toHaveBeenCalledWith('example.com');
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.addresses)).toBe(true);
    });

    it('debe aceptar y normalizar respuesta exclusiva con IPv6 públicas', async () => {
      mockResolver.resolve4.mockResolvedValueOnce([]);
      mockResolver.resolve6.mockResolvedValueOnce(['2606:2800:220:1:248:1893:25c8:1946']);

      const result = await service.validateWebhookDestination('https://ipv6.example.com/hook');

      expect(result).toEqual({
        allowed: true,
        addresses: ['2606:2800:220:1:248:1893:25c8:1946'],
      });
    });

    it('debe aceptar respuestas mixtas con IPv4 e IPv6 públicas deduplicadas', async () => {
      mockResolver.resolve4.mockResolvedValueOnce(['93.184.216.34', '93.184.216.34']);
      mockResolver.resolve6.mockResolvedValueOnce(['2606:2800:220:1:248:1893:25c8:1946']);

      const result = await service.validateWebhookDestination('https://dualstack.example.com:8443/notify?token=abc');

      expect(result).toEqual({
        allowed: true,
        addresses: ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'],
      });
    });

    it('debe aceptar IP pública literal directa sin necesidad de consultar DNS', async () => {
      const result = await service.validateWebhookDestination('https://93.184.216.34/webhook');

      expect(result).toEqual({
        allowed: true,
        addresses: ['93.184.216.34'],
      });
      expect(mockResolver.resolve4).not.toHaveBeenCalled();
      expect(mockResolver.resolve6).not.toHaveBeenCalled();
    });
  });

  describe('Detección y Bloqueo de Direcciones Privadas, Reservadas y Peligrosas', () => {
    const dangerousIpv4 = [
      '127.0.0.1',       // Loopback 127.0.0.0/8
      '127.0.1.1',
      '10.0.0.1',        // Private 10.0.0.0/8
      '10.254.0.1',
      '172.16.0.1',      // Private 172.16.0.0/12
      '172.31.255.255',
      '192.168.1.1',     // Private 192.168.0.0/16
      '192.168.0.254',
      '100.64.0.1',      // CGNAT 100.64.0.0/10
      '100.127.255.254',
      '169.254.169.254', // Link-local / Cloud metadata service
      '0.0.0.0',         // Current network 0.0.0.0/8
      '0.1.2.3',
      '224.0.0.1',       // Multicast 224.0.0.0/4
      '239.255.255.250',
      '240.0.0.1',       // Reserved 240.0.0.0/4
      '255.255.255.255', // Broadcast
      '192.0.2.1',       // TEST-NET-1
      '198.51.100.1',    // TEST-NET-2
      '203.0.113.1',     // TEST-NET-3
      '198.18.0.1',      // Benchmarking
    ];

    dangerousIpv4.forEach((ip) => {
      it(`debe rechazar resolución que retorne la IPv4 restringida: ${ip}`, async () => {
        mockResolver.resolve4.mockResolvedValueOnce([ip]);
        mockResolver.resolve6.mockResolvedValueOnce([]);

        await expect(service.validateWebhookDestination('https://bad-host.com/hook'))
          .rejects.toThrow(BadRequestException);
      });
    });

    const dangerousIpv6 = [
      '::',                      // Unspecified ::/128
      '::1',                     // Loopback ::1/128
      '0:0:0:0:0:0:0:1',
      'fc00::1',                 // ULA fc00::/7
      'fd12:3456:789a:1::1',
      'fe80::1',                 // Link-local fe80::/10
      'febf::ffff',
      'ff02::1',                 // Multicast ff00::/8
      'ff05::2',
      '2001:db8::1',             // Documentation
      '::ffff:127.0.0.1',        // IPv4-mapped IPv6 loopback
      '::ffff:192.168.1.1',      // IPv4-mapped IPv6 private
      '::ffff:8.8.8.8',          // IPv4-mapped IPv6 public (prohibido explícitamente)
      '0:0:0:0:0:ffff:10.0.0.1',
    ];

    dangerousIpv6.forEach((ip) => {
      it(`debe rechazar resolución que retorne la IPv6 restringida: ${ip}`, async () => {
        mockResolver.resolve4.mockResolvedValueOnce([]);
        mockResolver.resolve6.mockResolvedValueOnce([ip]);

        await expect(service.validateWebhookDestination('https://bad-ipv6-host.com/hook'))
          .rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('Defensa contra DNS Rebinding (Cualquier IP restringida invalida todo)', () => {
    it('debe rechazar si la resolución retorna 1 IP pública legítima y 1 IP privada interna', async () => {
      // Clásico ataque de DNS rebinding: el atacante retorna tanto su IP pública como 127.0.0.1 o 169.254.169.254
      mockResolver.resolve4.mockResolvedValueOnce(['93.184.216.34', '169.254.169.254']);
      mockResolver.resolve6.mockResolvedValueOnce([]);

      await expect(service.validateWebhookDestination('https://rebinding-attack.com/hook'))
        .rejects.toThrow(BadRequestException);
    });

    it('debe rechazar si IPv4 es pública pero IPv6 es privada (ULA o loopback ::1)', async () => {
      mockResolver.resolve4.mockResolvedValueOnce(['93.184.216.34']);
      mockResolver.resolve6.mockResolvedValueOnce(['::1']);

      await expect(service.validateWebhookDestination('https://mixed-rebinding.com/hook'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('Control de Errores, Resultados Vacíos, Timeout y Exceso de Direcciones', () => {
    it('debe rechazar si la resolución DNS no devuelve ninguna dirección IP', async () => {
      mockResolver.resolve4.mockResolvedValueOnce([]);
      mockResolver.resolve6.mockResolvedValueOnce([]);

      await expect(service.validateWebhookDestination('https://empty-dns.com/hook'))
        .rejects.toThrow(BadRequestException);
    });

    it('debe rechazar ante fallo o excepción en la consulta DNS (ENOTFOUND, etc.)', async () => {
      mockResolver.resolve4.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND failing-dns.com'));
      mockResolver.resolve6.mockRejectedValueOnce(new Error('ENOTFOUND'));

      await expect(service.validateWebhookDestination('https://failing-dns.com/hook'))
        .rejects.toThrow(BadRequestException);
    });

    it('debe rechazar ante timeout de resolución DNS para evitar denegación de servicio', async () => {
      // Simula promesa colgada
      const hangingResolver = new Promise<string[]>(() => {});
      mockResolver.resolve4.mockReturnValueOnce(hangingResolver as any);
      mockResolver.resolve6.mockReturnValueOnce(hangingResolver as any);

      await expect(
        service.validateWebhookDestination('https://slow-dns.com/hook', { timeoutMs: 20 })
      ).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar si la cantidad de direcciones excede el límite permitido (anti-abuso)', async () => {
      // Más de 16 direcciones
      const manyIps = Array.from({ length: 20 }, (_, i) => `198.51.200.${i + 1}`);
      mockResolver.resolve4.mockResolvedValueOnce(manyIps);
      mockResolver.resolve6.mockResolvedValueOnce([]);

      await expect(service.validateWebhookDestination('https://huge-pool.com/hook'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('Validación Estricta de la URL de Entrada', () => {
    it('debe rechazar valores no string o vacíos', async () => {
      await expect(service.validateWebhookDestination(null)).rejects.toThrow(BadRequestException);
      await expect(service.validateWebhookDestination(undefined)).rejects.toThrow(BadRequestException);
      await expect(service.validateWebhookDestination('')).rejects.toThrow(BadRequestException);
      await expect(service.validateWebhookDestination('   ')).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar protocolos que no sean HTTPS (http, ftp, file, javascript)', async () => {
      await expect(service.validateWebhookDestination('http://example.com/hook')).rejects.toThrow(BadRequestException);
      await expect(service.validateWebhookDestination('ftp://example.com/file')).rejects.toThrow(BadRequestException);
      await expect(service.validateWebhookDestination('file:///etc/passwd')).rejects.toThrow(BadRequestException);
    });

    it('debe rechazar URLs con formato inválido o malicioso', async () => {
      await expect(service.validateWebhookDestination('https://')).rejects.toThrow(BadRequestException);
      await expect(service.validateWebhookDestination('not-a-valid-url')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Ausencia Estricta de Información Sensible en Excepciones', () => {
    it('el mensaje de error debe ser público y genérico, sin filtrar hostnames, IPs ni errores DNS', async () => {
      const maliciousUrl = 'https://super-secret-host.internal:8443/admin?token=secret123';
      mockResolver.resolve4.mockResolvedValueOnce(['127.0.0.1']);

      try {
        await service.validateWebhookDestination(maliciousUrl);
        fail('Debería haber lanzado BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.message).toBe(GENERIC_DNS_SAFETY_ERROR_MESSAGE);

        const errorStr = JSON.stringify(err);
        const response = typeof err.getResponse === 'function' ? err.getResponse() : err;
        const prohibitedDataFields = [
          'hostname',
          'url',
          'ip',
          'address',
          'addresses',
          'rawError',
          'dnsError',
          'code',
        ];
        for (const field of prohibitedDataFields) {
          expect(response[field]).toBeUndefined();
          expect(err[field]).toBeUndefined();
        }
        expect(errorStr).not.toContain('super-secret-host');
        expect(errorStr).not.toContain('secret123');
        expect(errorStr).not.toContain('127.0.0.1');
      }
    });
  });

  describe('Funciones Puras de Utilidad (isPrivateOrRestrictedIPv4, isPrivateOrRestrictedIPv6, isPublicRoutableIp)', () => {
    it('isPublicRoutableIp debe validar correctamente', () => {
      expect(isPublicRoutableIp('8.8.8.8')).toBe(true);
      expect(isPublicRoutableIp('1.1.1.1')).toBe(true);
      expect(isPublicRoutableIp('127.0.0.1')).toBe(false);
      expect(isPublicRoutableIp('::1')).toBe(false);
      expect(isPublicRoutableIp('not-an-ip')).toBe(false);
    });

    it('isPrivateOrRestrictedIPv4 debe devolver true para IPs malformadas', () => {
      expect(isPrivateOrRestrictedIPv4('999.999.999.999')).toBe(true);
      expect(isPrivateOrRestrictedIPv4('1.2.3')).toBe(true);
      expect(isPrivateOrRestrictedIPv4('abc')).toBe(true);
    });

    it('isPrivateOrRestrictedIPv6 debe devolver true para IPs malformadas', () => {
      expect(isPrivateOrRestrictedIPv6('not:an:ipv6')).toBe(true);
    });
  });
});
