export type CdrStatus = 'ACCEPTED' | 'OBSERVED' | 'REJECTED';

export interface ParsedCdr {
  responseCode: string;
  description: string;
  notes: string[];
  status: CdrStatus;
}
