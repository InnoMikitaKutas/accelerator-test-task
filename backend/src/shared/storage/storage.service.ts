export interface PutResult {
  url: string;
  key: string;
}

/** Provider-agnostic object storage (architecture §File storage). Injection token. */
export abstract class StorageService {
  abstract put(key: string, body: Buffer, contentType: string): Promise<PutResult>;
  abstract delete(key: string): Promise<void>;
}
