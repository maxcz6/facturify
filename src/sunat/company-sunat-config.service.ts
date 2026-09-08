import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsEncryptionService } from '../security/secrets-encryption.service';

export interface SaveSolCredentialInput {
  companyId: string;
  username: string;
  password: string;
}

export interface DecryptedSolCredential {
  ruc: string;
  username: string;
  password: string;
  environment: 'BETA' | 'PRODUCTION';
}

@Injectable()
export class CompanySunatConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsEncryptionService,
  ) {}

  async saveSolCredential(input: SaveSolCredentialInput): Promise<{ configured: true }> {
    const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new NotFoundException('Company not found.');
    if (!/^[A-Za-z0-9]{1,20}$/.test(input.username)) {
      throw new ConflictException('Invalid SOL username format.');
    }

    const encrypted = this.secrets.encrypt(input.password);
    await this.prisma.sunatCredential.upsert({
      where: { companyId: input.companyId },
      create: {
        companyId: input.companyId,
        solUsername: input.username,
        encryptedPassword: encrypted.encrypted,
        passwordIv: encrypted.iv,
        passwordAuthTag: encrypted.authTag,
      },
      update: {
        solUsername: input.username,
        encryptedPassword: encrypted.encrypted,
        passwordIv: encrypted.iv,
        passwordAuthTag: encrypted.authTag,
      },
    });
    return { configured: true };
  }

  async getDecryptedSolCredential(companyId: string): Promise<DecryptedSolCredential> {
    const credential = await this.prisma.sunatCredential.findUnique({
      where: { companyId },
      include: { company: true },
    });
    if (!credential) throw new NotFoundException('SUNAT credentials are not configured.');

    return {
      ruc: credential.company.ruc,
      username: credential.solUsername,
      password: this.secrets.decrypt({
        encrypted: credential.encryptedPassword,
        iv: credential.passwordIv,
        authTag: credential.passwordAuthTag,
      }),
      environment: credential.company.environment,
    };
  }
}
