import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
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

const AI_ARABIC_RE = /[\u0600-\u06FF]/;
const AI_LATIN_RE = /[a-zA-ZÀ-ÿ']+/g;
const AI_EN_HINTS = new Set([
  'i', 'want', 'request', 'leave', 'tomorrow', 'check', 'clock', 'in', 'out',
  'document', 'telework', 'remote', 'hours', 'week', 'policy', 'status',
  'attendance', 'presence', 'team', 'admin', 'manager', 'open', 'download',
  'my', 'need', 'would', 'like', 'from', 'home', 'show', 'summary', 'daily',
  'today', 'platform', 'stats', 'statistics', 'display', 'please', 'hello', 'hi',
]);
const AI_FR_HINTS = new Set([
  'je', 'veux', 'conge', 'congé', 'demain', 'pointage', 'pointe', 'pointer',
  'sortie', 'entree', 'entrée', 'teletravail', 'télétravail', 'document',
  'attestation', 'autorisation', 'heures', 'semaine', 'solde', 'statut',
  'demande', 'demander', 'besoin', 'souhaite', 'voudrais', 'vacances',
  'absence', 'presence', 'equipe', 'aujourd', 'hui', 'montre', 'affiche',
  'résumé', 'resume', 'jour', 'état', 'etat',
]);
const AI_TN_HINTS = new Set([
  'nheb', 'n7eb', 'nhib', 'bghit', 'tounsi', 'tounes', 'ghodwa', 'baad',
  'ba3d', 'pointi', 'npointi', 'pointit', 'rani', 'jit', 'dakhla', 'dakhel',
  'khrajt', 'khrouj', 'kharrej', 'nokhrej', 'konji', 'congi', 'ena', 'chkon',
  'chnowa', 'chkoun', 'kadeh', 'adech', 'mazeli', 'fama', 'famma', 'swaye3',
  'war9a', 'khidma', 'nkhdem', 'khirja', 'dok', 'taw', 'aandi', 'andi',
  '3andi', 'naamel', 'naamela', 'najem', 'aatini', 'nzid', 'nchouf', 'tasrih',
  'warini', 'lyoum', 'hedha', 'hetha', 'kifeh', '9adeh', '9addeh',
  'ma3andich', 'chniya', 'chneya', 'shnowa', 'achnowa',
]);
const AI_ARABIC_TN_HINTS = [
  'شنوة', 'شنو', 'اشنو', 'آشنو', 'قداش', 'فما', 'نحب', 'توا', 'تو', 'هاذا',
  'هذا', 'كيفاش', 'علاش', 'اليوم',
];

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

export function detectAiMessageLanguage(
  message: string | null | undefined,
  browserLanguage?: string | null,
): AiLanguageCode {
  const value = String(message ?? '').trim().toLowerCase();
  const fallback = resolvePreferredAiLanguage(browserLanguage);
  if (!value) {
    return fallback;
  }
  if (AI_ARABIC_RE.test(value)) {
    return AI_ARABIC_TN_HINTS.some(term => value.includes(term)) ? 'tn' : 'ar';
  }
  const tokens = new Set(value.match(AI_LATIN_RE) ?? []);
  if ([...tokens].some(token => AI_TN_HINTS.has(token))) {
    return 'tn';
  }
  const enScore = [...tokens].filter(token => AI_EN_HINTS.has(token)).length;
  const frScore = [...tokens].filter(token => AI_FR_HINTS.has(token)).length;
  if (enScore > frScore && enScore > 0) {
    return 'en';
  }
  if (frScore > 0 || /[éèêàùç]/.test(value)) {
    return 'fr';
  }
  return fallback;
}

export function resolveAiServiceEndpoint(
  aiServiceUrl: string | null | undefined,
  aiDebugUrl: string | null | undefined,
): string {
  const configuredCandidate = String(aiServiceUrl ?? '').trim().replace(/\/+$/, '');
  if (configuredCandidate) {
    return configuredCandidate;
  }

  const debugCandidate = String(aiDebugUrl ?? '').trim().replace(/\/+$/, '');
  if (debugCandidate) {
    return debugCandidate;
  }

  return 'http://127.0.0.1:8000';
}

export const AI_CHAT_SESSION_STORAGE_KEY = 'weentime.ai.chat.session_id';
export const AI_CHAT_LANGUAGE_STORAGE_KEY = 'weentime.ai.chat.response_language';

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

export function rememberAiConversationLanguage(language: AiLanguageCode): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(AI_CHAT_LANGUAGE_STORAGE_KEY, language);
}

export function resolveStoredAiConversationLanguage(browserLanguage?: string | null): AiLanguageCode {
  if (typeof window === 'undefined') {
    return resolvePreferredAiLanguage(browserLanguage);
  }
  const stored = window.sessionStorage.getItem(AI_CHAT_LANGUAGE_STORAGE_KEY) as AiLanguageCode | null;
  if (stored === 'fr' || stored === 'en' || stored === 'ar' || stored === 'tn') {
    return stored;
  }
  return resolvePreferredAiLanguage(browserLanguage);
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
  detectedLanguage?: AiLanguageCode;
  detected_language?: AiLanguageCode;
  requested_language?: AiLanguageCode;
  requestedLanguage?: AiLanguageCode;
  response_language?: AiLanguageCode;
  responseLanguage?: AiLanguageCode;
  mode?: 'text' | 'voice';
  chatbotPublicContext?: boolean;
  role?: string;
  agentRole?: string;
  agent_role?: string;
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
  mode?: 'text' | 'voice';
  language?: AiLanguageCode;
  detectedLanguage?: AiLanguageCode;
  requested_language?: AiLanguageCode;
  response_language?: AiLanguageCode;
  metadata: AiChatMetadata;
}

export function buildAiChatRequestPayload(
  message: string,
  options?: number | {
    userId?: number;
    role?: string | null;
    entrepriseId?: number | null;
    companyId?: number | null;
    currentPage?: string | null;
    sessionId?: string | null;
  },
): AiChatRequestPayload {
  const resolvedOptions = typeof options === 'number' ? { userId: options } : options;
  const sessionId = resolvedOptions?.sessionId || resolveAiConversationId();
  const currentPage = resolvedOptions?.currentPage?.trim() || resolveCurrentPage();
  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language : null;
  const language = detectAiMessageLanguage(message, browserLanguage);
  rememberAiConversationLanguage(language);
  const metadata: AiChatMetadata = {
    channel: 'chat',
    language,
    detectedLanguage: language,
    detected_language: language,
    requested_language: language,
    requestedLanguage: language,
    response_language: language,
    responseLanguage: language,
    mode: 'text',
    chatbotPublicContext: environment.chatbotPublicMode === true,
    current_page: currentPage,
    currentPage,
    conversation_id: sessionId,
    conversationId: sessionId,
    session_id: sessionId,
  };
  if (resolvedOptions?.role && resolvedOptions.role.trim().length > 0) {
    const role = resolvedOptions.role.trim().replace(/^ROLE_/i, '').toUpperCase();
    metadata.role = role;
    metadata.agentRole = role;
    metadata.agent_role = role;
  }
  if (typeof resolvedOptions?.userId === 'number' && resolvedOptions.userId > 0) {
    metadata.userId = resolvedOptions.userId;
  }
  if (typeof resolvedOptions?.entrepriseId === 'number' && resolvedOptions.entrepriseId > 0) {
    metadata.entrepriseId = resolvedOptions.entrepriseId;
  }
  const companyId = resolvedOptions?.companyId ?? resolvedOptions?.entrepriseId;
  if (typeof companyId === 'number' && companyId > 0) {
    metadata.companyId = companyId;
  }
  return {
    message,
    session_id: sessionId,
    user_id: resolvedOptions?.userId,
    mode: 'text',
    language,
    detectedLanguage: language,
    requested_language: language,
    response_language: language,
    metadata,
  };
}

@Injectable({ providedIn: 'root' })
export class AiCopilotService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly endpoint = environment.gatewayUrl + '/api/v1/ai';

  sendChatV2(message: string): Observable<AiCopilotEnvelope> {
    const user = this.authService.currentUser();
    if (!this.authService.isAuthenticated()) {
      return throwError(() => new Error('Votre session a expiré. Veuillez vous reconnecter.'));
    }
    const requestId = this.createRequestId('chat');
    const role = this.resolveRole(user);
    const url = `${this.endpoint}/v2/chat`;
    const payload = buildAiChatRequestPayload(message, {
        userId: user?.id,
        role,
        entrepriseId: user?.entrepriseId ?? user?.entreprise?.id,
        companyId: user?.entrepriseId ?? user?.entreprise?.id,
        currentPage: this.currentPage(),
        sessionId: resolveAiConversationId(),
      });
    const headers = this.authHeaders(requestId, user);
    this.debugChatRequest('chat.v2', requestId, url, payload, headers);
    return this.http.post<AiCopilotEnvelope>(
      url,
      payload,
      {
        headers,
        withCredentials: true,
        context: withAiChatWidgetContext(),
        observe: 'response',
      },
    ).pipe(
      tap(response => this.debugChatResponse('chat.v2', requestId, response.status)),
      map(response => response.body ?? {
        success: false,
        data: null,
        error: {
          code: 'empty_ai_response',
          message: 'Service IA indisponible.',
        },
      }),
      catchError(error => {
        this.debugChatError('chat.v2', requestId, error);
        return throwError(() => error);
      }),
    );
  }

  resetSession(sessionId?: string): Observable<AiCopilotEnvelope> {
    const requestId = this.createRequestId('reset');
    this.debugRequest('chat.reset', requestId);
    const user = this.authService.currentUser();
    if (!this.authService.isAuthenticated()) {
      return throwError(() => new Error('Votre session a expiré. Veuillez vous reconnecter.'));
    }
    const role = this.resolveRole(user);
    const sessionIdValue = sessionId || resolveAiConversationId();
    const currentPage = this.currentPage();
    const language = resolveStoredAiConversationLanguage(
      typeof navigator !== 'undefined' ? navigator.language : null,
    );
    const metadata: Record<string, unknown> = {
      channel: 'chat',
      language,
      detectedLanguage: language,
      detected_language: language,
      requested_language: language,
      requestedLanguage: language,
      response_language: language,
      responseLanguage: language,
      mode: 'text',
      chatbotPublicContext: environment.chatbotPublicMode === true,
      current_page: currentPage,
      currentPage,
      conversation_id: sessionIdValue,
      conversationId: sessionIdValue,
      session_id: sessionIdValue,
    };
    if (role) {
      metadata['role'] = role;
      metadata['agentRole'] = role;
      metadata['agent_role'] = role;
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
      { message: '', user_id: user?.id, session_id: sessionIdValue, language, detectedLanguage: language, requested_language: language, response_language: language, metadata },
      {
        headers: this.authHeaders(requestId, user),
        withCredentials: true,
        context: withAiChatWidgetContext(),
      },
    );
  }

  confirmAction(confirmationId: string, approved: boolean, extraMetadata?: Record<string, unknown>): Observable<AiCopilotEnvelope> {
    const requestId = this.createRequestId('confirm');
    this.debugRequest('chat.confirm', requestId);
    const user = this.authService.currentUser();
    if (!this.authService.isAuthenticated()) {
      return throwError(() => new Error('Votre session a expiré. Veuillez vous reconnecter.'));
    }
    const role = this.resolveRole(user);
    const sessionId = resolveAiConversationId();
    const currentPage = this.currentPage();
    const language = resolveStoredAiConversationLanguage(
      typeof navigator !== 'undefined' ? navigator.language : null,
    );
    const metadata: Record<string, unknown> = {
      channel: 'chat',
      language,
      detectedLanguage: language,
      detected_language: language,
      requested_language: language,
      requestedLanguage: language,
      response_language: language,
      responseLanguage: language,
      mode: 'text',
      chatbotPublicContext: environment.chatbotPublicMode === true,
      current_page: currentPage,
      currentPage,
      conversation_id: sessionId,
      conversationId: sessionId,
      session_id: sessionId,
    };
    if (role) {
      metadata['role'] = role;
      metadata['agentRole'] = role;
      metadata['agent_role'] = role;
    }
    if (user?.id) {
      metadata['userId'] = user.id;
    }
    const entrepriseId = user?.entrepriseId ?? user?.entreprise?.id;
    if (typeof entrepriseId === 'number' && entrepriseId > 0) {
      metadata['entrepriseId'] = entrepriseId;
      metadata['companyId'] = entrepriseId;
    }
    // Merge caller-supplied metadata (e.g. GPS coordinates from check-in).
    if (extraMetadata) {
      Object.assign(metadata, extraMetadata);
    }
    return this.http.post<AiCopilotEnvelope>(
      `${this.endpoint}/v2/chat/confirm`,
      { confirmation_id: confirmationId, approved, user_id: user?.id, language, detectedLanguage: language, requested_language: language, response_language: language, metadata },
      {
        headers: this.authHeaders(requestId, user),
        withCredentials: true,
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

  private authHeaders(
    requestId?: string,
    user: ReturnType<AuthService['currentUser']> = this.authService.currentUser(),
  ): HttpHeaders {
    const headers: Record<string, string> = {};
    if (requestId) {
      headers['X-Request-ID'] = requestId;
    }
    const role = this.resolveRole(user);
    if (role) {
      headers['X-User-Role'] = role;
    }
    const entrepriseId = user?.entrepriseId ?? user?.entreprise?.id;
    if (typeof entrepriseId === 'number' && entrepriseId > 0) {
      const value = String(entrepriseId);
      headers['X-Entreprise-Id'] = value;
      headers['X-Company-Id'] = value;
      headers['X-Tenant-Id'] = value;
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

  private debugChatRequest(
    flow: string,
    requestId: string,
    url: string,
    payload: AiChatRequestPayload | Record<string, unknown>,
    headers: HttpHeaders,
  ): void {
    if (environment.production) {
      return;
    }
    console.debug('[ai-copilot]', flow, {
      requestId,
      url,
      payload,
      headers: this.redactHeaders(headers),
    });
  }

  private debugChatResponse(flow: string, requestId: string, status: number): void {
    if (environment.production) {
      return;
    }
    console.debug('[ai-copilot]', `${flow}.response`, { requestId, status });
  }

  private debugChatError(flow: string, requestId: string, error: unknown): void {
    if (environment.production) {
      return;
    }
    const httpError = error as { status?: unknown; message?: unknown; error?: unknown };
    console.debug('[ai-copilot]', `${flow}.error`, {
      requestId,
      status: typeof httpError?.status === 'number' ? httpError.status : null,
      message: typeof httpError?.message === 'string' ? httpError.message : String(error),
      error: httpError?.error ?? null,
    });
  }

  private redactHeaders(headers: HttpHeaders): Record<string, string> {
    return headers.keys().reduce<Record<string, string>>((acc, key) => {
      const value = headers.get(key) ?? '';
      acc[key] = key.toLowerCase() === 'authorization'
        ? value.replace(/^Bearer\s+.+$/i, 'Bearer ***')
        : value;
      return acc;
    }, {});
  }
}
