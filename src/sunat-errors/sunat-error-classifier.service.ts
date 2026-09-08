import { Injectable } from '@nestjs/common';
import {
  CATEGORY_DEFAULT_MESSAGES,
  CATEGORY_RETRYABLE,
  EXPLICIT_ERROR_MAP,
} from './sunat-errors.constants';
import { ClassifiedSunatError } from './sunat-errors.interface';
import { SunatErrorCategory } from './sunat-error-category.enum';

@Injectable()
export class SunatErrorClassifierService {
  /**
   * Pure classification method that takes a CDR code, SOAP fault, or transport error
   * and returns exclusively { category, retryable, publicCode, publicMessage }.
   * Never leaks credentials, XML, ZIP/CDR data, file paths, stack traces, or raw messages.
   */
  classify(input: unknown): ClassifiedSunatError {
    const extractedCode = this.extractCanonicalCode(input);

    if (extractedCode && EXPLICIT_ERROR_MAP[extractedCode]) {
      const def = EXPLICIT_ERROR_MAP[extractedCode];
      return {
        category: def.category,
        retryable: CATEGORY_RETRYABLE[def.category],
        publicCode: def.publicCode,
        publicMessage: def.publicMessage,
      };
    }

    // Heuristic range classification for standard SUNAT numeric codes
    if (extractedCode && /^\d{4}$/.test(extractedCode)) {
      const num = parseInt(extractedCode, 10);

      // 2000 - 2999: Validation codes
      if (num >= 2000 && num < 3000) {
        return {
          category: SunatErrorCategory.VALIDATION,
          retryable: false,
          publicCode: extractedCode,
          publicMessage: CATEGORY_DEFAULT_MESSAGES[SunatErrorCategory.VALIDATION],
        };
      }

      // 3000 - 4999: Rejection codes
      if (num >= 3000 && num <= 4999) {
        return {
          category: SunatErrorCategory.REJECTED,
          retryable: false,
          publicCode: extractedCode,
          publicMessage: CATEGORY_DEFAULT_MESSAGES[SunatErrorCategory.REJECTED],
        };
      }
    }

    // Default: UNKNOWN category, non-retryable
    const safePublicCode =
      extractedCode && /^[a-zA-Z0-9_-]{1,20}$/.test(extractedCode)
        ? extractedCode
        : 'UNKNOWN';

    return {
      category: SunatErrorCategory.UNKNOWN,
      retryable: false,
      publicCode: safePublicCode,
      publicMessage: CATEGORY_DEFAULT_MESSAGES[SunatErrorCategory.UNKNOWN],
    };
  }

  /**
   * Dedicated classifier for CDR response codes (e.g. '0', '1033', '2014', '3001')
   */
  classifyCdrCode(code: string | number): ClassifiedSunatError {
    return this.classify(code);
  }

  /**
   * Dedicated classifier for SOAP Fault strings / codes
   */
  classifySoapFault(fault: string): ClassifiedSunatError {
    return this.classify(fault);
  }

  /**
   * Dedicated classifier for transport / network errors
   */
  classifyTransportError(error: unknown): ClassifiedSunatError {
    return this.classify(error);
  }

  /**
   * Extracts a normalized canonical code token from raw input strings or objects,
   * completely stripping out any credentials, XML payloads, file paths, or sensitive messages.
   */
  private extractCanonicalCode(input: unknown): string | null {
    if (input === null || input === undefined) {
      return null;
    }

    let text = '';
    if (typeof input === 'string' || typeof input === 'number') {
      text = String(input);
    } else if (input instanceof Error) {
      text = `${input.name} ${input.message}`;
    } else if (typeof input === 'object') {
      const obj = input as Record<string, any>;
      text = `${obj.code ?? ''} ${obj.statusCode ?? ''} ${obj.message ?? ''} ${obj.faultstring ?? ''}`;
    }

    text = text.trim();
    if (!text) {
      return null;
    }

    // 1. Direct match in dictionary
    if (EXPLICIT_ERROR_MAP[text]) {
      return text;
    }

    // 2. Timeout and network tokens (specific before generic)
    if (/esockettimedout/i.test(text)) {
      return 'ESOCKETTIMEDOUT';
    }
    if (/etimedout/i.test(text)) {
      return 'ETIMEDOUT';
    }
    if (/timed?\s*out|timeout/i.test(text)) {
      return 'TIMEOUT';
    }
    if (/econnreset|connection\s+reset/i.test(text)) {
      return 'ECONNRESET';
    }
    if (/econnrefused|connection\s+refused/i.test(text)) {
      return 'ECONNREFUSED';
    }
    if (/enotfound/i.test(text)) {
      return 'ENOTFOUND';
    }
    if (/eai_again/i.test(text)) {
      return 'EAI_AGAIN';
    }
    if (/aborterror|request\s+aborted/i.test(text)) {
      return 'ABORT_ERROR';
    }

    // 3. HTTP status codes (502, 503, 504, 500)
    const httpMatch = text.match(/\b(?:http[_\s]*)?(500|502|503|504)\b/i);
    if (httpMatch) {
      return `HTTP_${httpMatch[1]}`;
    }

    // 4. Standard 4-digit SUNAT code pattern (e.g. "0102", "1033", "2014", "3001")
    // Avoid matching 11-digit RUCs or dates
    const fourDigitMatch = text.match(/(?:^|[^\d])(0\d{3}|[1-4]\d{3})(?:[^\d]|$)/);
    if (fourDigitMatch) {
      return fourDigitMatch[1];
    }

    // 5. Clean alphanumeric token if short
    const cleaned = text.replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleaned.length > 0 && cleaned.length <= 20) {
      return cleaned;
    }

    return null;
  }
}
