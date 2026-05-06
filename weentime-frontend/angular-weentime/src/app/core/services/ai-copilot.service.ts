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
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat`,
      {
        message,
        channel: 'chat',
        user_id: user?.id ?? undefined,
      },
      { headers: this.authHeaders() },
    );
  }

  confirmAction(confirmationId: string, approved: boolean): Observable<AiCopilotEnvelope> {
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat/confirm`,
      { confirmation_id: confirmationId, approved },
      { headers: this.authHeaders() },
    );
  }

  private authHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
