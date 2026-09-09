export type ApiKeyEnvironment = 'live' | 'test';
export type ApiKeyStatus = 'ACTIVE' | 'REVOKED';

export interface ApiKeyRecord {
  id: string;
  companyId: string;
  name: string;
  prefix: string;
  lastFour: string;
  environment: ApiKeyEnvironment;
  status: ApiKeyStatus;
  createdAt: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
}

export interface CreatedApiKeyResult {
  id: string;
  companyId: string;
  name: string;
  apiKey: string; // Only returned once upon creation
  prefix: string;
  lastFour: string;
  environment: ApiKeyEnvironment;
  status: ApiKeyStatus;
  createdAt: Date;
}
