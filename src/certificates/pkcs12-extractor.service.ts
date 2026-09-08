import { BadRequestException, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSecureContext } from 'node:tls';

export interface ExtractedSigningMaterial {
  privateKeyPem: string;
  certificatePem: string;
}

@Injectable()
export class Pkcs12ExtractorService {
  async extract(pfx: Buffer, password: string): Promise<ExtractedSigningMaterial> {
    try {
      createSecureContext({ pfx, passphrase: password });
    } catch {
      throw new BadRequestException('Invalid PKCS#12 certificate or password.');
    }

    const directory = await mkdtemp(join(tmpdir(), 'facturify-pfx-'));
    const inputPath = join(directory, 'certificate.p12');
    try {
      await writeFile(inputPath, pfx, { mode: 0o600 });
      const privateKeyPem = await this.openssl(inputPath, password, ['-nocerts', '-nodes']);
      const certificatePem = await this.openssl(inputPath, password, ['-clcerts', '-nokeys']);
      return { privateKeyPem, certificatePem };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private openssl(inputPath: string, password: string, flags: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('openssl', ['pkcs12', '-in', inputPath, '-passin', 'stdin', ...flags], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      const stdout: Buffer[] = [];
      let size = 0;
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) child.kill();
        else stdout.push(chunk);
      });
      child.stderr.resume();
      child.on('error', () => reject(new BadRequestException('OpenSSL is unavailable for certificate extraction.')));
      child.on('close', (code) => {
        if (code !== 0 || size > 2 * 1024 * 1024) {
          reject(new BadRequestException('Unable to extract PKCS#12 signing material.'));
        } else resolve(Buffer.concat(stdout).toString('utf8'));
      });
      child.stdin.end(password);
    });
  }
}
