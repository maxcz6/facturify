import { Module } from '@nestjs/common';
import { CdrService } from './cdr.service';

@Module({ providers: [CdrService], exports: [CdrService] })
export class CdrModule {}
