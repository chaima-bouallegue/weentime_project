import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { withAiChatWidgetContext } from '../http/request-context.tokens';
import { AuthService } from './auth.service';

export interface AiCopilotError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AiCopilotToolCall {
  name: string;
  arguments?: Record<string, unknown>;
  status?: string | null;
}

export interface AiCopilotFallback {
  provider?: string | null;
  message?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

export interface AiCopilotChatData {
  type: 'answer' | 'ask' | 'confirm_action' | 'execute_action' | 'error' | string;
  text: string;
  intent?: string;
  confidence?: number;
  requiresConfirmation?: boolean;
  confirmationId?: string | null;
  toolCalls?: AiCopilotToolCall[];
  actionResult?: Record<string, unknown> | null;
  fallback?: AiCopilotFallback | null;
  detectedLanguage?: string | null;
  audioUrl?: string | null;
  audioStatus?: string | null;
  request_id?: string;
  requestId?: string;
}

export interface AiCopilotEnvelope<T = AiCopilotChatData> {
  success: boolean;
  data: T | null;
  warnings?: string[];
  error: AiCopilotError | null;
}

export type AiLanguageCode = 'fr' | 'en' | 'ar' | 'tn';

export function resolvePreferredAiLanguage(browserLanguage?: string | null): AiLanguageCode {
  const normalized = String(browserLanguage ?? '').trim().toLowerCase().replace('_', '-');
  if (!normalized) {
    return 'fr';
  }
  if (normalized === 'tn' || normalized.endsWith('-tn')) {
    return 'tn';
  }
  if (normalized.startsWith('ar')) {
    return 'ar';
  }
  if (normalized.startsWith('en')) {
    return 'en';
  }
  return 'fr';
}

export function resolveAiServiceEndpoint(
  aiServiceUrl: string | null | undefined,
  aiDebugUrl: string | null | undefined,
): string {
  const gatewayCandidate = String(aiServiceUrl ?? '').trim().replace(/\/+$/, '');
  if (gatewayCandidate) {
    return gatewayCandidate;
  }

  const debugCandidate = String(aiDebugUrl ?? '').trim().replace(/\/+$/, '');
  if (debugCandidate) {
    return debugCandidate;
  }

  return 'http://localhost:8000';
}

export function buildAiChatRequestPayload(message: string, userId?: number): {
  message: string;
  user_id?: number;
  metadata: {
    channel: 'chat';
    language: AiLanguageCode;
  };
} {
  return {
    message,
    user_id: userId,
    metadata: {
      channel: 'chat',
      language: resolvePreferredAiLanguage(
        typeof navigator !== 'undefined' ? navigator.language : null,
      ),
    },
  };
}

@Injectable({ providedIn: 'root' })
export class AiCopilotService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly endpoint = resolveAiServiceEndpoint(environment.aiServiceUrl, environment.aiUrl);

  sendChatV2(message: string): Observable<AiCopilotEnvelope> {
    const user = this.authService.currentUser();
    const requestId = this.createRequestId('chat');
    this.debugRequest('chat.v2', requestId);
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat`,
      buildAiChatRequestPayload(message, user?.id),
      {
        headers: this.authHeaders(requestId),
        context: withAiChatWidgetContext(),
      },
    );
  }

  confirmAction(confirmationId: string, approved: boolean): Observable<AiCopilotEnvelope> {
    const requestId = this.createRequestId('confirm');
    this.debugRequest('chat.confirm', requestId);
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat/confirm`,
      { confirmation_id: confirmationId, approved },
      {
        headers: this.authHeaders(requestId),
        context: withAiChatWidgetContext(),
      },
    );
  }

  private authHeaders(requestId?: string): HttpHeaders {
    const token = this.authService.getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (requestId) {
      headers['X-Request-ID'] = requestId;
    }
    return new HttpHeaders(headers);
  }

  private createRequestId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private debugRequest(flow: string, requestId: string): void {
    if (!environment.production) {
      console.debug('[ai-copilot]', flow, { requestId });
    }
  }
}
