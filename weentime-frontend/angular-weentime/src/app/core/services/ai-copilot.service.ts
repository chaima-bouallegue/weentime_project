import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
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

export const AI_CHAT_SESSION_STORAGE_KEY = 'weentime.ai.chat.session_id';

export function resolveAiConversationId(): string {
  const generated = createBrowserRequestId('chat-session');
  if (typeof window === 'undefined') {
    return generated;
  }
  const existing = window.sessionStorage.getItem(AI_CHAT_SESSION_STORAGE_KEY);
  if (existing && existing.trim().length > 0) {
    return existing;
  }
  window.sessionStorage.setItem(AI_CHAT_SESSION_STORAGE_KEY, generated);
  return generated;
}

function createBrowserRequestId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveCurrentPage(): string {
  if (typeof window === 'undefined') {
    return 'unknown';
  }
  return `${window.location.pathname}${window.location.search || ''}` || 'unknown';
}

export interface AiChatMetadata {
  channel: 'chat';
  language: AiLanguageCode;
  chatbotPublicContext?: boolean;
  role?: string;
  userId?: number;
  entrepriseId?: number;
  companyId?: number;
  current_page?: string;
  currentPage?: string;
  conversation_id?: string;
  conversationId?: string;
  session_id?: string;
}

export interface AiChatRequestPayload {
  message: string;
  session_id?: string;
  user_id?: number;
  metadata: AiChatMetadata;
}

export function buildAiChatRequestPayload(
  message: string,
  options?: {
    userId?: number;
    role?: string | null;
    entrepriseId?: number | null;
    companyId?: number | null;
    currentPage?: string | null;
    sessionId?: string | null;
  },
): AiChatRequestPayload {
  const sessionId = options?.sessionId || resolveAiConversationId();
  const currentPage = options?.currentPage?.trim() || resolveCurrentPage();
  const metadata: AiChatMetadata = {
    channel: 'chat',
    language: resolvePreferredAiLanguage(
      typeof navigator !== 'undefined' ? navigator.language : null,
    ),
    chatbotPublicContext: environment.chatbotPublicMode === true,
    current_page: currentPage,
    currentPage,
    conversation_id: sessionId,
    conversationId: sessionId,
    session_id: sessionId,
  };
  if (options?.role && options.role.trim().length > 0) {
    metadata.role = options.role.trim().replace(/^ROLE_/i, '').toUpperCase();
  }
  if (typeof options?.userId === 'number' && options.userId > 0) {
    metadata.userId = options.userId;
  }
  if (typeof options?.entrepriseId === 'number' && options.entrepriseId > 0) {
    metadata.entrepriseId = options.entrepriseId;
  }
  const companyId = options?.companyId ?? options?.entrepriseId;
  if (typeof companyId === 'number' && companyId > 0) {
    metadata.companyId = companyId;
  }
  return {
    message,
    session_id: sessionId,
    user_id: options?.userId,
    metadata,
  };
}

@Injectable({ providedIn: 'root' })
export class AiCopilotService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly endpoint = resolveAiServiceEndpoint(environment.aiServiceUrl, environment.aiUrl);

  sendChatV2(message: string): Observable<AiCopilotEnvelope> {
    const user = this.authService.currentUser();
    const requestId = this.createRequestId('chat');
    this.debugRequest('chat.v2', requestId);
    const role = this.resolveRole(user);
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat`,
      buildAiChatRequestPayload(message, {
        userId: user?.id,
        role,
        entrepriseId: user?.entrepriseId ?? user?.entreprise?.id,
        companyId: user?.entrepriseId ?? user?.entreprise?.id,
        currentPage: this.currentPage(),
        sessionId: resolveAiConversationId(),
      }),
      {
        headers: this.authHeaders(requestId),
        context: withAiChatWidgetContext(),
      },
    );
  }

  resetSession(sessionId?: string): Observable<AiCopilotEnvelope> {
    // Calls /v2/chat/reset to drop any pending slot-fill flow and confirmation
    // queue for the current user/session. The chat widget uses this for the
    // "Effacer la conversation" header button so a stuck flow doesn't keep
    // eating the user's next prompt across page reloads.
    const requestId = this.createRequestId('reset');
    this.debugRequest('chat.reset', requestId);
    const user = this.authService.currentUser();
    const role = this.resolveRole(user);
    const sessionIdValue = sessionId || resolveAiConversationId();
    const currentPage = this.currentPage();
    const metadata: Record<string, unknown> = {
      channel: 'chat',
      language: resolvePreferredAiLanguage(
        typeof navigator !== 'undefined' ? navigator.language : null,
      ),
      chatbotPublicContext: environment.chatbotPublicMode === true,
      current_page: currentPage,
      currentPage,
      conversation_id: sessionIdValue,
      conversationId: sessionIdValue,
      session_id: sessionIdValue,
    };
    if (role) {
      metadata['role'] = role;
    }
    if (user?.id) {
      metadata['userId'] = user.id;
    }
    const entrepriseId = user?.entrepriseId ?? user?.entreprise?.id;
    if (typeof entrepriseId === 'number' && entrepriseId > 0) {
      metadata['entrepriseId'] = entrepriseId;
      metadata['companyId'] = entrepriseId;
    }
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat/reset`,
      { message: '', user_id: user?.id, session_id: sessionIdValue, metadata },
      {
        headers: this.authHeaders(requestId),
        context: withAiChatWidgetContext(),
      },
    );
  }

  confirmAction(confirmationId: string, approved: boolean): Observable<AiCopilotEnvelope> {
    const requestId = this.createRequestId('confirm');
    this.debugRequest('chat.confirm', requestId);
    const user = this.authService.currentUser();
    const role = this.resolveRole(user);
    const sessionId = resolveAiConversationId();
    const currentPage = this.currentPage();
    const metadata: Record<string, unknown> = {
      channel: 'chat',
      language: resolvePreferredAiLanguage(
        typeof navigator !== 'undefined' ? navigator.language : null,
      ),
      chatbotPublicContext: environment.chatbotPublicMode === true,
      current_page: currentPage,
      currentPage,
      conversation_id: sessionId,
      conversationId: sessionId,
      session_id: sessionId,
    };
    if (role) {
      metadata['role'] = role;
    }
    if (user?.id) {
      metadata['userId'] = user.id;
    }
    const entrepriseId = user?.entrepriseId ?? user?.entreprise?.id;
    if (typeof entrepriseId === 'number' && entrepriseId > 0) {
      metadata['entrepriseId'] = entrepriseId;
      metadata['companyId'] = entrepriseId;
    }
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat/confirm`,
      { confirmation_id: confirmationId, approved, user_id: user?.id, metadata },
      {
        headers: this.authHeaders(requestId),
        context: withAiChatWidgetContext(),
      },
    );
  }

  private resolveRole(user: ReturnType<AuthService['currentUser']>): string | null {
    if (!user) {
      return null;
    }
    const primary = typeof user.role === 'string' && user.role.trim().length > 0
      ? user.role.trim()
      : Array.isArray(user.roles) && user.roles.length > 0
        ? String(user.roles[0]).trim()
        : '';
    return primary.length > 0 ? primary.replace(/^ROLE_/i, '').toUpperCase() : null;
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
    return createBrowserRequestId(prefix);
  }

  private currentPage(): string {
    return this.router.url || resolveCurrentPage();
  }

  private debugRequest(flow: string, requestId: string): void {
    if (!environment.production) {
      console.debug('[ai-copilot]', flow, { requestId });
    }
  }
}
