import type { SupportedLanguage } from './vocal-intent.model';

export interface VocalResponse {
  text: string;
  langue: SupportedLanguage;
  timestamp: Date | string;
  audioUrl?: string;
  [key: string]: unknown;
}
