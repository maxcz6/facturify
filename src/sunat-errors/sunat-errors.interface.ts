import { SunatErrorCategory } from './sunat-error-category.enum';

export interface ClassifiedSunatError {
  category: SunatErrorCategory;
  retryable: boolean;
  publicCode: string;
  publicMessage: string;
}
