import type { SupportedLanguage, VocalIntent } from './vocal-intent.model';
import type { VocalResponse } from './vocal-response.model';

export type OrbState = 'idle' | 'listening' | 'processing' | 'responding' | 'error';

export interface VocalSession {
  id: string;
  timestamp: Date | string;
  langue: SupportedLanguage;
  intent: VocalIntent;
  response: VocalResponse;
  durationMs: number;
  orbState?: OrbState;
  transcript?: string;
  [key: string]: unknown;
}
