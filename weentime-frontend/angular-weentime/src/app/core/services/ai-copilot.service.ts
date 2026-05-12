import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
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

export interface AiCopilotChatData {
  type: 'answer' | 'ask' | 'confirm_action' | 'execute_action' | 'error' | string;
  text: string;
  intent?: string;
  confidence?: number;
  requiresConfirmation?: boolean;
  confirmationId?: string | null;
  toolCalls?: AiCopilotToolCall[];
  actionResult?: Record<string, unknown> | null;
  request_id?: string;
  requestId?: string;
}

export interface AiCopilotEnvelope<T = AiCopilotChatData> {
  success: boolean;
  data: T | null;
  warnings: string[];
  error: AiCopilotError | null;
}

@Injectable({ providedIn: 'root' })
export class AiCopilotService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly endpoint = (environment.aiServiceUrl || environment.aiUrl || 'http://localhost:8000').replace(/\/+$/, '');

  sendChatV2(message: string): Observable<AiCopilotEnvelope> {
    const user = this.authService.currentUser();
    const requestId = this.createRequestId('chat');
    this.debugRequest('chat.v2', requestId);
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat`,
      {
        message,
        channel: 'chat',
        user_id: user?.id ?? undefined,
      },
      { headers: this.authHeaders(requestId) },
    );
  }

  confirmAction(confirmationId: string, approved: boolean): Observable<AiCopilotEnvelope> {
    const requestId = this.createRequestId('confirm');
    this.debugRequest('chat.confirm', requestId);
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat/confirm`,
      { confirmation_id: confirmationId, approved },
      { headers: this.authHeaders(requestId) },
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
