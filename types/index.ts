export interface UploadedFileMeta {
  id?: string;
  originalName: string;
  relativePath: string;
  size: number;
  mimeType?: string;
  secureUrl: string;
  resourceType?: string;
  format?: string;
}

export interface UploadSuccessResponse {
  success: true;
  uniqueId: string;
  folderName: string;
  expiresAt: string;
  files: UploadedFileMeta[];
}

export interface UploadConflictResponse {
  success: false;
  code: "EXISTING_SHARE";
  message: string;
  uniqueId: string;
  expiresAt: string;
}

export interface UploadErrorResponse {
  success: false;
  code: string;
  message: string;
  offendingFile?: string;
}

export type UploadResponse = UploadSuccessResponse | UploadConflictResponse | UploadErrorResponse;

export interface ShareViewResponse {
  success: true;
  uniqueId: string;
  folderName: string;
  expiresAt: string;
  files: Array<{
    id: string;
    originalName: string;
    relativePath: string | null;
    size: number;
    mimeType: string | null;
    secureUrl: string;
  }>;
}

export interface ShareErrorResponse {
  success: false;
  code: "NOT_FOUND" | "EXPIRED" | "INVALID_ID";
  message: string;
}

export interface ClientFileEntry {
  file: File;
  relativePath: string;
}
