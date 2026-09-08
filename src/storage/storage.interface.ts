export type ArtifactType = 'XML' | 'ZIP' | 'CDR';

export interface StorageSizeLimits {
  XML: number;
  ZIP: number;
  CDR: number;
}

export interface StoredArtifactMetadata {
  id: string;
  companyId: string;
  type: ArtifactType;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  filename: string;
  createdAt: Date;
}

export interface StoredArtifact {
  metadata: StoredArtifactMetadata;
  content: Buffer;
}

export interface DocumentStorage {
  save(
    companyId: string,
    type: ArtifactType,
    content: Buffer | string,
  ): Promise<StoredArtifactMetadata>;

  get(companyId: string, artifactId: string): Promise<StoredArtifact>;

  exists(companyId: string, artifactId: string): Promise<boolean>;

  delete(companyId: string, artifactId: string): Promise<boolean>;
}

export const DOCUMENT_STORAGE = Symbol('DocumentStorage');
