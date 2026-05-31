import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  ChangeDetectorRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LucideAngularModule } from 'lucide-angular';
import { DragDropModule, CdkDragEnd } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { safeDisplayText } from './safe-text.util';
import { environment } from '../../../environments/environment';
import { AssistantResponseMeta, AssistantWorkflowState } from '../../core/models/assistant.model';
import { ChatApiResponse, ChatHistoryMessage, ChatService, TtsResponse } from './chat.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { AssistantSyncService } from '../../core/services/assistant-sync.service';
import { ToastService } from '../../core/services/toast.service';
import { AssistantWorkflowService } from '../../core/services/assistant-workflow.service';
import { VoiceAssistantEvent, VoiceAssistantService, VoiceAssistantState } from './voice-assistant.service';
import { normalizeVoiceAiResponse } from './voice-response-normalizer';

type ChatMessageSender = 'user' | 'assistant' | 'system';
type ChatMessageOrigin = 'text' | 'voice' | 'system';
type RetryKind = 'text' | 'voice';
type MessageActionKind = 'route' | 'link' | 'confirm';
type ConfirmationState = 'pending' | 'executing' | 'success' | 'failure' | 'cancelled';
type ActionTone = 'success' | 'warning' | 'error' | 'neutral';
type UnknownRecord = Record<string, unknown>;

interface ChatReadResult {
  kind: 'read_result';
  toolName?: string | null;
  summary?: string | null;
  items?: unknown[];
  empty?: boolean;
  count?: number;
  data?: unknown;
  error?: unknown;
  backendStatus?: number | null;
}

interface PendingFlowStatus {
  intent?: string | null;
  agent?: string | null;
  status?: string | null;
  missingFields?: string[];
}

interface ConfirmationSummary {
  type?: string | null;
  date?: string | null;
  endDate?: string | null;
  time?: string | null;
  motif?: string | null;
}

interface ActionResultDisplay {
  text: string;
  tone: ActionTone;
}

interface ChatMessage {
  id: string;
  sender: ChatMessageSender;
  text: string;
  timestamp: Date;
  origin?: ChatMessageOrigin;
  intent?: string | null;
  audioUrl?: string | null;
  audioStatusLabel?: string | null;
  detectedLanguage?: string | null;
  fallbackLabel?: string | null;
  toolLabels?: string[];
  actionResultDisplay?: ActionResultDisplay | null;
  isError?: boolean;
  retryable?: boolean;
  retryKind?: RetryKind;
  retryPayload?: string;
  actionLabel?: string | null;
  actionTarget?: string | null;
  actionKind?: MessageActionKind | null;
  confirmationId?: string | null;
  confirmationPending?: boolean;
  confirmationResolved?: boolean;
  confirmationState?: ConfirmationState | null;
  confirmationDecision?: 'approved' | 'cancelled' | null;
  workflow?: AssistantWorkflowState | null;
  readResult?: ChatReadResult | null;
  pendingFlow?: PendingFlowStatus | null;
  confirmationSummary?: ConfirmationSummary | null;
  isStreaming?: boolean;
}

interface CachedChatMessage {
  sender: ChatMessageSender;
  text: string;
  timestamp: string;
  origin?: ChatMessageOrigin;
  intent?: string | null;
  isError?: boolean;
  detectedLanguage?: string | null;
  audioStatusLabel?: string | null;
  fallbackLabel?: string | null;
  confirmationResolved?: boolean;
  confirmationState?: ConfirmationState | null;
  confirmationDecision?: 'approved' | 'cancelled' | null;
}

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, DragDropModule],
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidgetComponent implements AfterViewChecked, AfterViewInit, OnDestroy {
  private static readonly SESSION_CACHE_LIMIT = 24;
  private static readonly SESSION_CACHE_PREFIX = 'weentime.ai.chat.session.';

  @ViewChild('messageContainer') private messageContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('chatPanel') private chatPanel?: ElementRef<HTMLElement>;

  // FIX 3: References for chip arrow navigation
  @ViewChild('chipsScrollTrack') private chipsScrollTrack?: ElementRef<HTMLDivElement>;
  @ViewChild('chipsArrowLeft') private chipsArrowLeft?: ElementRef<HTMLButtonElement>;
  @ViewChild('chipsArrowRight') private chipsArrowRight?: ElementRef<HTMLButtonElement>;

  private readonly chatService = inject(ChatService);
  private readonly voiceAssistant = inject(VoiceAssistantService);
  private readonly assistantWorkflow = inject(AssistantWorkflowService);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly assistantSync = inject(AssistantSyncService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly isOpen = signal(false);
  readonly resetting = signal(false);
  readonly input = signal('');
  readonly loading = signal(false);
  readonly voiceState = signal<VoiceAssistantState>('idle');
  readonly liveTranscript = signal('');
  readonly loadingHistory = signal(false);
  readonly messages = signal<ChatMessage[]>([]);
  readonly panelPosition = signal({ x: 0, y: 0 });
  readonly handsFreeMode = signal(true);
  readonly speaking = signal(false);

  readonly speechSupported = signal<boolean>(
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof MediaRecorder !== 'undefined'
  );
  readonly statusPillVisible = signal(true);
  readonly doneFlash = signal(false);
  readonly ghostText = signal('');
  readonly ghostActive = signal(false);
  readonly ghostDisappearing = signal(false);

  private _doneFlashTimer?: any;
  private statusPillTimeout?: any;

  readonly recordingTime = signal(0);
  private recordingTimerInterval?: any;

  // FIX 3: chip scroll intersection observer
  private chipsScrollObserver?: IntersectionObserver;

  readonly currentUserName = computed(() => {
    const user = this.authService.currentUser();
    return user?.prenom || user?.nom || user?.email || 'collaborateur';
  });

  readonly assistantRole = computed<'EMPLOYEE' | 'MANAGER' | 'RH' | 'ADMIN'>(() => {
    return (this.resolveRole(this.authService.currentUser()) as 'EMPLOYEE' | 'MANAGER' | 'RH' | 'ADMIN') ?? 'EMPLOYEE';
  });

  readonly activeAgent = computed(() => {
    switch (this.assistantRole()) {
      case 'MANAGER':
        return {
          name: 'Assistant Manager',
          role: 'Manager',
          icon: 'users',
          avatarBg: 'linear-gradient(135deg, #8B5CF6 0%, #C084FC 100%)'
        };
      case 'RH':
        return {
          name: 'Assistant RH',
          role: 'Ressources Humaines',
          icon: 'briefcase',
          avatarBg: 'linear-gradient(135deg, #DC2626 0%, #FB7185 100%)'
        };
      case 'ADMIN':
        return {
          name: 'Assistant Admin',
          role: 'Administrateur',
          icon: 'shield',
          avatarBg: 'linear-gradient(135deg, #1F2937 0%, #475569 100%)'
        };
      default:
        return {
          name: 'Assistant Collaborateur',
          role: 'Collaborateur',
          icon: 'user',
          avatarBg: 'linear-gradient(135deg, #6C47FF 0%, #54D1FF 100%)'
        };
    }
  });

  readonly roleLabel = computed(() => {
    switch (this.assistantRole()) {
      case 'MANAGER': return 'Manager';
      case 'RH': return 'RH';
      case 'ADMIN': return 'Admin';
      default: return 'Employee';
    }
  });
  readonly panelTitle = computed(() => `${this.roleLabel()} AI`);
  readonly recording = computed(() => this.voiceState() === 'listening');
  readonly voiceBusy = computed(() => this.isVoiceBusyState(this.voiceState()));
  readonly canSend = computed(() => this.input().trim().length > 0 && !this.loading() && !this.recording());
  readonly voiceDisabled = computed(() => this.loading() || this.voiceState() === 'authExpired');

  readonly currentVisualState = computed<'idle' | 'recording' | 'processing' | 'responding' | 'error'>(() => {
    if (this.voiceState() === 'audioError' || this.voiceState() === 'authExpired') return 'error';
    if (this.voiceState() === 'listening') return 'recording';
    if (this.voiceState() === 'stopping' || this.voiceState() === 'uploading' || this.voiceState() === 'transcribing') return 'processing';
    if (this.voiceState() === 'responding' || this.speaking() || this.loading()) return 'responding';
    return 'idle';
  });

  readonly formattedRecordingTime = computed(() => {
    const totalSecs = this.recordingTime();
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  readonly quickActions = computed(() => {
    switch (this.assistantRole()) {
      case 'MANAGER':
        return [
          { label: 'Demandes en attente', action: 'manager.pending_approvals' },
          { label: 'Présence équipe', action: 'get_team_presence' },
          { label: 'Mes horaires', action: 'telework.list_manager_requests' },
          { label: 'Résumé équipe', action: "Today's team summary" }
        ];
      case 'RH':
        return [
          { label: 'Mes demandes de congé', action: 'leave.list_manager_requests' },
          { label: 'Suivi dossiers RH', action: 'RH backlog' },
          { label: 'Présence équipe', action: 'get_team_presence' },
          { label: 'Validations en cours', action: 'Pending validations' }
        ];
      case 'ADMIN':
        return [
          { label: 'Santé système', action: 'System health' },
          { label: 'Statut provider IA', action: 'AI provider status' },
          { label: 'Redis status', action: 'Redis status' }
        ];
      default:
        return [
          { label: 'Mes demandes de congé', action: 'leave.list_manager_requests' },
          { label: 'Mes horaires', action: 'telework.list_manager_requests' },
          { label: 'Solde de congés', action: 'Check my leave balance' },
          { label: 'Résumé quotidien', action: 'Show my daily summary' }
        ];
    }
  });

  readonly inputPlaceholder = computed(() => {
    switch (this.assistantRole()) {
      case 'MANAGER': return "Ask about approvals, team presence, or today's team summary...";
      case 'RH': return 'Ask about RH backlog, validations, or documents...';
      case 'ADMIN': return 'Ask about system health, provider status, or tenant issues...';
      default: return 'Ask about leave, attendance, documents, or use voice...';
    }
  });

  readonly voiceButtonIcon = computed(() => {
    if (this.recording()) return 'square';
    if (this.isVoiceBusyState(this.voiceState())) return 'loader-2';
    if (this.voiceState() === 'authExpired') return 'shield-alert';
    return 'mic';
  });

  readonly voiceButtonLabel = computed(() => {
    switch (this.voiceState()) {
      case 'listening': return 'Arreter l enregistrement';
      case 'stopping': return 'Arret de l enregistrement';
      case 'uploading': return 'Envoi du message vocal';
      case 'transcribing': return 'Transcription en cours';
      case 'responding': return 'Generation de la reponse vocale';
      case 'success': return 'Reponse vocale prete';
      case 'authExpired': return 'Session expiree';
      case 'audioError': return 'Assistant vocal indisponible';
      default: return 'Enregistrer un message vocal';
    }
  });

  readonly voiceStatusText = computed(() => {
    switch (this.voiceState()) {
      case 'listening': return 'Recording in progress';
      case 'stopping': return 'Stopping recording';
      case 'uploading': return 'Uploading voice message';
      case 'transcribing': return 'Transcribing your message';
      case 'responding': return 'Generating reply';
      case 'success': return 'Voice reply ready';
      case 'authExpired': return 'Session expired';
      case 'audioError': return 'Voice unavailable';
      default: return this.handsFreeMode() ? 'Voice auto ready' : 'Voice manual ready';
    }
  });

  readonly statusLabel = computed(() => {
    if (this.speaking()) return 'Audio reply playing';
    switch (this.voiceState()) {
      case 'listening': return 'Recording...';
      case 'stopping': return 'Stopping recording...';
      case 'uploading': return 'Uploading voice message...';
      case 'transcribing': return 'Transcribing...';
      case 'responding': return 'Preparing answer...';
      case 'success': return 'Voice reply ready';
      case 'authExpired': return 'Session expirée, reconnectez-vous.';
      case 'audioError': return 'Voice currently unavailable';
      default: return this.loading() ? 'Assistant is working...' : `${this.panelTitle()} | ${this.currentUserName()}`;
    }
  });

  private shouldScrollToBottom = false;
  private loadedHistoryForUserId: number | null = null;
  private lastSubmittedText: string | null = null;
  private voiceSubscription?: Subscription;
  private animationHandles = new Set<number>();
  private activeAudio?: HTMLAudioElement;
  private autoListenHandle: number | null = null;
  private readonly inFlightConfirmations = new Set<string>();
  private readonly resolvedConfirmations = new Set<string>();

  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    this.voiceSubscription = this.voiceAssistant.events$.subscribe(event => this.handleVoiceEvent(event));
    effect(() => {
      const user = this.authService.currentUser();
      if (!user?.id || this.loadedHistoryForUserId === user.id) return;
      this.loadedHistoryForUserId = user.id;
      this.loadHistory();
    });
    effect(() => {
      const userId = this.authService.currentUser()?.id;
      const messages = this.messages();
      if (!userId || messages.length === 0) return;
      this.persistSessionHistory(userId, messages);
    });
    effect(() => {
      const shouldAutoListen = this.isOpen()
        && this.handsFreeMode()
        && !this.loading()
        && !this.activeAudio
        && this.voiceState() === 'idle'
        && this.input().trim().length === 0;
      if (!shouldAutoListen) { this.clearAutoListen(); return; }
      this.scheduleAutoListen(250);
    });
    effect(() => {
      if (this.voiceState() === 'listening') {
        this.recordingTime.set(0);
        if (this.recordingTimerInterval) clearInterval(this.recordingTimerInterval);
        this.recordingTimerInterval = setInterval(() => {
          this.recordingTime.update(t => t + 1);
        }, 1000);
      } else {
        if (this.recordingTimerInterval) {
          clearInterval(this.recordingTimerInterval);
          this.recordingTimerInterval = undefined;
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // FIX 3: Setup chip scroll arrow observer after view initializes
    this.setupChipsScrollObserver();
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScrollToBottom) return;
    this.shouldScrollToBottom = false;
    this.scrollToBottom();
  }

  ngOnDestroy(): void {
    this.voiceSubscription?.unsubscribe();
    for (const handle of this.animationHandles) window.clearTimeout(handle);
    this.animationHandles.clear();
    this.clearAutoListen();
    this.stopAudioPlayback();
    if (this._doneFlashTimer) clearTimeout(this._doneFlashTimer);
    if (this.statusPillTimeout) clearTimeout(this.statusPillTimeout);
    if (this.recordingTimerInterval) clearInterval(this.recordingTimerInterval);
    this.chipsScrollObserver?.disconnect();
    void this.voiceAssistant.stop();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isOpen()) this.closeChat();
  }

  toggleChat(): void {
    const next = !this.isOpen();
    this.isOpen.set(next);
    if (!next) {
      this.blurActiveElementInPanel();
      this.clearAutoListen();
      this.stopAudioPlayback();
      void this.voiceAssistant.stop();
    } else {
      window.setTimeout(() => this.chatPanel?.nativeElement.focus(), 0);
      // Re-initialize scroll arrows when panel opens
      window.setTimeout(() => this.setupChipsScrollObserver(), 50);
    }
    this.shouldScrollToBottom = true;
  }

  closeChat(): void {
    this.isOpen.set(false);
    this.blurActiveElementInPanel();
    this.clearAutoListen();
    this.stopAudioPlayback();
    void this.voiceAssistant.stop();
  }

  clearConversation(): void {
    if (this.resetting()) return;
    this.resetting.set(true);
    this.chatService.resetSession().subscribe({
      next: () => {
        this.messages.set([this.buildWelcomeMessage()]);
        this.input.set('');
        this.loading.set(false);
        this.shouldScrollToBottom = true;
      },
      error: () => {
        this.messages.set([this.buildWelcomeMessage()]);
        this.input.set('');
        this.loading.set(false);
        this.shouldScrollToBottom = true;
      },
      complete: () => { this.resetting.set(false); },
    });
  }

  toggleHandsFreeMode(): void {
    this.handsFreeMode.update(value => !value);
    if (!this.handsFreeMode()) {
      this.clearAutoListen();
    } else if (this.isOpen()) {
      this.scheduleAutoListen(250);
    }
  }

  onInputChange(value: string): void {
    this.input.set(value);
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage(): void {
    const message = this.input().trim();
    if (!message || this.loading()) return;
    this.pushMessage({
      id: this.createMessageId(),
      sender: 'user',
      text: message,
      timestamp: new Date(),
      origin: 'text',
    });
    this.lastSubmittedText = message;
    this.input.set('');
    this.loading.set(true);
    this.chatService.sendMessage(message).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: response => { this.pushAssistantReply(response, 'text'); },
      error: error => this.handleRequestFailure(this.resolveErrorMessage(error), 'text'),
    });
  }

  async toggleRecording(): Promise<void> {
    if (!this.speechSupported()) return;
    if (this.recording()) {
      await this.voiceAssistant.stop();
      return;
    }
    this.liveTranscript.set('');
    this.ghostText.set('');
    this.ghostActive.set(false);
    this.ghostDisappearing.set(false);
    await this.voiceAssistant.start();
  }

  playMessageAudio(message: ChatMessage): void {
    if (message.audioUrl) {
      this.playAudio(message.audioUrl, false);
      return;
    }
    this.chatService.textToSpeech(message.text).subscribe({
      next: (response: TtsResponse) => {
        this.patchMessage(message.id, { audioUrl: response.audio_url, audioStatusLabel: 'Audio reply ready' });
        this.playAudio(response.audio_url, false);
      },
      error: error => {
        this.patchMessage(message.id, { audioStatusLabel: 'Audio unavailable' });
        this.handleRequestFailure(this.resolveErrorMessage(error), 'text');
      },
    });
  }

  onDragEnd(event: CdkDragEnd): void {
    this.panelPosition.set(event.source.getFreeDragPosition());
  }

  sendQuickAction(prompt: string): void {
    if (this.loading()) return;
    this.input.set(prompt);
    this.sendMessage();
  }

  retryFailedMessage(message: ChatMessage): void {
    if (this.loading()) return;
    if (message.retryKind === 'voice') {
      this.liveTranscript.set('');
      this.voiceState.set('idle');
      void this.voiceAssistant.start();
      return;
    }
    if (!message.retryPayload) return;
    this.sendStoredText(message.retryPayload);
  }

  runMessageAction(message: ChatMessage): void {
    if (!message.actionTarget) return;
    if (message.actionKind === 'confirm') {
      this.sendStoredText(message.actionTarget);
      return;
    }
    if (message.actionKind === 'route') {
      void this.router.navigateByUrl(message.actionTarget)
        .then(navigated => { if (!navigated) this.pushSystemError('Navigation refusee par les permissions ou les guards.'); })
        .catch(() => { this.pushSystemError('Navigation refusee par les permissions ou les guards.'); });
      return;
    }
    this.openExternalLink(message.actionTarget);
  }

  confirmAssistantAction(message: ChatMessage, approved: boolean): void {
    const confirmationId = message.confirmationId;
    if (!confirmationId || message.confirmationPending || message.confirmationResolved || this.loading()) return;
    if (this.inFlightConfirmations.has(confirmationId) || this.resolvedConfirmations.has(confirmationId)) return;
    this.inFlightConfirmations.add(confirmationId);
    this.markConfirmationPending(message.id, true);
    this.loading.set(true);
    this.chatService.confirmAction(confirmationId, approved).pipe(finalize(() => {
      this.loading.set(false);
      this.inFlightConfirmations.delete(confirmationId);
    })).subscribe({
      next: response => {
        const confirmationState = this.resolveConfirmationState(response, approved);
        if (confirmationState !== 'pending' && confirmationState !== 'executing') {
          this.resolvedConfirmations.add(confirmationId);
        }
        this.markConfirmationResolved(message.id, confirmationState);
        this.pushAssistantReply(response, 'text');
      },
      error: error => {
        this.markConfirmationPending(message.id, false);
        this.handleRequestFailure(this.resolveErrorMessage(error), 'text');
      },
    });
  }

  trackByMessageId(_: number, message: ChatMessage): string {
    return message.id;
  }

  formatTimestamp(timestamp: Date): string {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
  }

  readResultItems(readResult: ChatReadResult | null | undefined): unknown[] {
    if (!readResult || readResult.empty) return [];
    return (Array.isArray(readResult.items) ? readResult.items : []).slice(0, 5);
  }

  readResultFailed(readResult: ChatReadResult | null | undefined): boolean {
    if (!readResult) {
      return false;
    }
    if (readResult.error !== null && readResult.error !== undefined) {
      return true;
    }
    return typeof readResult.backendStatus === 'number' && readResult.backendStatus >= 500;
  }

  readResultRetryable(readResult: ChatReadResult | null | undefined): boolean {
    if (!readResult || !this.readResultFailed(readResult)) {
      return false;
    }
    const code = this.readResultErrorCode(readResult);
    return code === 'backend_unavailable'
      || code === 'backend_unreachable'
      || (typeof readResult.backendStatus === 'number' && readResult.backendStatus >= 500);
  }

  readResultRequiresLogin(readResult: ChatReadResult | null | undefined): boolean {
    const code = this.readResultErrorCode(readResult);
    return code === 'auth_required'
      || code === 'missing_jwt'
      || code === 'invalid_jwt'
      || code === 'expired_jwt'
      || readResult?.backendStatus === 401;
  }

  readResultAccessDenied(readResult: ChatReadResult | null | undefined): boolean {
    const code = this.readResultErrorCode(readResult);
    return code === 'access_denied'
      || code === 'permission_denied'
      || code === 'forbidden'
      || readResult?.backendStatus === 403;
  }

  readResultErrorTitle(message: ChatMessage): string {
    if (this.readResultRequiresLogin(message.readResult)) {
      switch (this.normalizedMessageLanguage(message)) {
        case 'en':
          return 'Session expired';
        case 'ar':
          return 'انتهت الجلسة';
        case 'tn':
          return 'Session wfet';
        default:
          return 'Session expirée';
      }
    }
    if (this.readResultAccessDenied(message.readResult)) {
      switch (this.normalizedMessageLanguage(message)) {
        case 'en':
          return 'Access denied';
        case 'ar':
          return 'تم رفض الوصول';
        case 'tn':
          return 'Access refusé';
        default:
          return 'Accès refusé';
      }
    }
    switch (this.normalizedMessageLanguage(message)) {
      case 'en':
        return 'Backend unavailable';
      case 'ar':
        return 'الخدمة غير متاحة';
      case 'tn':
        return 'Service moch disponible';
      default:
        return 'Service indisponible';
    }
  }

  readResultErrorMessage(readResult: ChatReadResult | null | undefined): string {
    if (!readResult) {
      return '';
    }
    const record = this.asRecord(readResult.error);
    return this.firstDisplayString(
      record?.['user_message'],
      record?.['userMessage'],
      record?.['message'],
      readResult.summary,
    ) ?? '';
  }

  reconnectButtonLabel(message: ChatMessage): string {
    switch (this.normalizedMessageLanguage(message)) {
      case 'en':
        return 'Log in';
      case 'ar':
        return 'تسجيل الدخول';
      case 'tn':
        return 'Connecti';
      default:
        return 'Reconnecter';
    }
  }

  readResultModuleLabel(readResult: ChatReadResult | null | undefined): string | null {
    if (!readResult) {
      return null;
    }
    const record = this.asRecord(readResult.error);
    const module = this.firstDisplayString(record?.['module']);
    if (module) {
      return module;
    }
    const toolName = readResult.toolName ?? '';
    if (!toolName) {
      return null;
    }
    return toolName.includes('.') ? toolName.split('.', 1)[0] : toolName.split('_', 1)[0];
  }

  readItemLabel(item: unknown): string {
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (!item || typeof item !== 'object') return 'Element';
    const record = item as UnknownRecord;
    return this.firstDisplayString(
      record['title'], record['label'], record['name'], record['nom'],
      record['type'], record['typeLabel'], record['typeDemande'],
      record['objet'], record['motif'], record['statut'], record['status'],
    ) ?? 'Element';
  }

  readItemStatus(item: unknown): string | null {
    if (!item || typeof item !== 'object') return null;
    const record = item as UnknownRecord;
    return this.firstDisplayString(
      record['status'], record['statut'], record['date'],
      record['dateDebut'], record['createdAt'],
    );
  }

  pendingFieldLabel(field: string): string {
    switch (field) {
      case 'date': return 'date';
      case 'time': case 'start_time': return 'horaire';
      case 'type': return 'type';
      case 'reason': return 'motif';
      default: return field;
    }
  }

  confirmationSummaryRows(summary: ConfirmationSummary | null | undefined): Array<{ label: string; value: string }> {
    if (!summary) return [];
    return [
      { label: 'Type', value: summary.type ?? '' },
      { label: 'Date', value: summary.endDate && summary.endDate !== summary.date ? `${summary.date} -> ${summary.endDate}` : summary.date ?? '' },
      { label: 'Horaire', value: summary.time ?? '' },
      { label: 'Motif', value: summary.motif ?? '' },
    ].filter(row => row.value.trim().length > 0);
  }

  messageSenderLabel(message: ChatMessage): string {
    if (message.sender === 'user') return 'You';
    if (message.sender === 'assistant') return this.panelTitle();
    return 'System';
  }

  formatDetectedLanguage(value: unknown): string | null {
    const safe = safeDisplayText(value);
    if (!safe) return null;
    switch (safe.toLowerCase()) {
      case 'fr': return 'FR';
      case 'en': return 'EN';
      case 'ar': return 'AR';
      case 'tn': return 'TN';
      default: return safe.toUpperCase();
    }
  }

  confirmationResolutionLabel(message: ChatMessage): string {
    switch (message.confirmationState) {
      case 'failure': return 'Execution failed';
      case 'cancelled': return 'Action cancelled';
      case 'executing': return 'Execution in progress';
      case 'success': return 'Action approved';
      default: return message.confirmationDecision === 'cancelled' ? 'Action cancelled' : 'Action approved';
    }
  }

  retryButtonLabel(message: ChatMessage): string {
    switch (this.normalizedMessageLanguage(message)) {
      case 'en':
        return 'Retry';
      case 'ar':
        return 'إعادة المحاولة';
      case 'tn':
        return 'Aawed';
      default:
        return 'Reessayer';
    }
  }

  actionToneIcon(tone: ActionTone | undefined): string {
    switch (tone) {
      case 'success': return 'check-circle-2';
      case 'warning': return 'triangle-alert';
      case 'error': return 'circle-x';
      default: return 'info';
    }
  }

  // FIX 3: Scroll chips track left or right
  scrollChips(delta: number): void {
    const track = this.chipsScrollTrack?.nativeElement;
    if (!track) return;
    track.scrollBy({ left: delta, behavior: 'smooth' });
    // Update arrow visibility after scroll settles
    window.setTimeout(() => this.updateChipsArrows(track), 350);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  // FIX 3: Setup IntersectionObserver on first and last chip
  private setupChipsScrollObserver(): void {
    this.chipsScrollObserver?.disconnect();

    const track = this.chipsScrollTrack?.nativeElement;
    if (!track) return;

    // Also update arrows on scroll events
    track.addEventListener('scroll', () => this.updateChipsArrows(track), { passive: true });
    this.updateChipsArrows(track);
  }

  private updateChipsArrows(track: HTMLElement): void {
    const leftArrow = this.chipsArrowLeft?.nativeElement;
    const rightArrow = this.chipsArrowRight?.nativeElement;
    if (!leftArrow || !rightArrow) return;

    const atStart = track.scrollLeft <= 4;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;

    leftArrow.classList.toggle('hidden', atStart);
    rightArrow.classList.toggle('hidden', atEnd);
  }

  private loadHistory(): void {
    const cachedMessages = this.readSessionHistory();
    this.loadingHistory.set(true);
    this.chatService.getHistory().pipe(finalize(() => this.loadingHistory.set(false))).subscribe({
      next: response => {
        const history = response.items.map(item => this.mapHistoryMessage(item));
        this.messages.set(
          history.length > 0 ? history :
          cachedMessages.length > 0 ? cachedMessages :
          [this.buildWelcomeMessage()]
        );
        this.shouldScrollToBottom = true;
      },
      error: () => {
        this.messages.set(cachedMessages.length > 0 ? cachedMessages : [this.buildWelcomeMessage()]);
        this.toast.warning("L'historique AI n'a pas pu etre charge.");
      },
    });
  }

  private pushAssistantReply(
    response: ChatApiResponse,
    retryKind: RetryKind,
  ): { isError: boolean; audioUrl: string | null } {
    const normalized = normalizeVoiceAiResponse(response);
    const meta = this.chatService.extractAssistantMeta(response);
    this.handleAssistantMeta(meta, retryKind);
    const readResult = this.extractReadResult(normalized.actionResult ?? response.actionResult ?? response.action_result ?? response.data);
    const text = normalized.assistantText ?? readResult?.summary ?? normalized.error ?? this.extractAssistantText(response);
    const audioUrl = normalized.audioUrl ?? this.extractAudioUrl(response);
    const audioStatusLabel = this.resolveAudioStatusLabel(normalized.audioStatus, !!audioUrl, retryKind);
    const detectedLanguage = normalized.detectedLanguage ?? response.detectedLanguage ?? null;
    const workflow = this.extractWorkflow(response, meta);
    const messageAction = this.buildMessageAction(response, meta);
    const confirmationId = normalized.confirmationId ?? this.extractConfirmationId(response);
    const pendingFlow = this.extractPendingFlow(normalized.actionResult ?? response.actionResult ?? response.action_result ?? response.data);
    const confirmationSummary = this.extractConfirmationSummary(normalized.actionResult ?? response.actionResult ?? response.action_result ?? response.data);
    const toolLabels = this.extractToolLabels(response, normalized.toolCalls);
    const actionResultDisplay = this.extractActionResultDisplay(
      normalized.actionResult ?? response.actionResult ?? response.action_result
    );
    const actionResultSource = normalized.actionResult ?? response.actionResult ?? response.action_result;
    const fallbackLabel = this.extractFallbackLabel(normalized.fallback, normalized.warnings);
    const requiresConfirmation = normalized.requiresConfirmation || !!confirmationId || response.requiresConfirmation === true || response.requires_confirmation === true;
    const isWorkflowFailure = response.type === 'workflow' && response.status === 'failed';
    // capability_unavailable / capability_hint cards are informational, not
    // hard errors. Some agents return them with type='error' (e.g. manager
    // approve on an unsupported request type) so we explicitly recognise the
    // actionResult.kind and prevent the red error rendering.
    const isCapabilityCard = this.isCapabilityUnavailableKind(
      normalized.actionResult ?? response.actionResult ?? response.action_result
    );
    const readResultFailed = this.readResultFailed(readResult);
    const readResultRetryable = this.readResultRetryable(readResult);
    const readResultRequiresLogin = this.readResultRequiresLogin(readResult);
    const actionRequiresLogin = this.actionResultRequiresLogin(actionResultSource);
    const actionAccessDenied = this.actionResultAccessDenied(actionResultSource);
    const isHardError = !isCapabilityCard
      && ((response.type === 'error' && !readResult) || (normalized.success === false && !requiresConfirmation && !readResult));
    const isError = isHardError || isWorkflowFailure || readResultFailed;
    const loginActionNeeded = readResultRequiresLogin || actionRequiresLogin;
    const retryableHardError = isHardError && !loginActionNeeded && !actionAccessDenied;
    const actionOverride = loginActionNeeded
      ? { label: this.reconnectButtonLabel({ detectedLanguage } as ChatMessage), target: '/login', kind: 'route' as const }
      : null;

    const message: ChatMessage = {
      id: this.createMessageId(),
      sender: isHardError ? 'system' : 'assistant',
      text: isHardError || requiresConfirmation ? text : '',
      timestamp: new Date(),
      origin: retryKind === 'voice' ? 'voice' : 'text',
      intent: normalized.intent ?? response.intent ?? null,
      audioUrl,
      audioStatusLabel,
      detectedLanguage,
      fallbackLabel,
      toolLabels,
      actionResultDisplay,
      isError,
      retryable: retryableHardError || readResultRetryable || (isWorkflowFailure && workflow?.can_retry === true),
      retryKind: (retryableHardError || readResultRetryable || isWorkflowFailure) ? retryKind : undefined,
      retryPayload: retryableHardError
        ? (retryKind === 'text' ? this.lastSubmittedText ?? undefined : undefined)
        : readResultRetryable
          ? (retryKind === 'text' ? this.lastSubmittedText ?? undefined : undefined)
        : isWorkflowFailure && workflow?.can_retry
          ? 'reprends le workflow'
          : undefined,
      actionLabel: actionOverride?.label ?? (isHardError || readResultFailed || isWorkflowFailure || requiresConfirmation ? null : messageAction?.label ?? null),
      actionTarget: actionOverride?.target ?? (isHardError || readResultFailed || isWorkflowFailure || requiresConfirmation ? null : messageAction?.target ?? null),
      actionKind: actionOverride?.kind ?? (isHardError || readResultFailed || isWorkflowFailure || requiresConfirmation ? null : messageAction?.kind ?? null),
      confirmationId: requiresConfirmation ? confirmationId : null,
      confirmationPending: false,
      confirmationResolved: confirmationId ? this.resolvedConfirmations.has(confirmationId) : false,
      confirmationState: requiresConfirmation ? (this.resolvedConfirmations.has(confirmationId ?? '') ? 'success' : 'pending') : null,
      confirmationDecision: null,
      workflow,
      readResult,
      pendingFlow,
      confirmationSummary,
    };
    this.pushMessage(message);

    if (audioUrl && !isHardError) this.playAudio(audioUrl, retryKind === 'voice');
    if (isHardError || requiresConfirmation) return { isError, audioUrl };

    this.streamAssistantText(message.id, text);
    if (response.intent === 'OPEN_DOCUMENT' && messageAction?.kind === 'link' && messageAction.target) {
      this.openExternalLink(messageAction.target);
    }
    return { isError, audioUrl };
  }

  private sendStoredText(message: string): void {
    this.lastSubmittedText = message;
    this.loading.set(true);
    this.chatService.sendMessage(message).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: response => { this.pushAssistantReply(response, 'text'); },
      error: error => this.handleRequestFailure(this.resolveErrorMessage(error), 'text'),
    });
  }

  private handleVoiceEvent(event: VoiceAssistantEvent): void {
    if (event.type === 'state') {
      this.voiceState.set(event.state);
      this.loading.set(this.isVoiceBusyState(event.state));
      return;
    }
    if (event.type === 'partial') {
      this.liveTranscript.set(event.text);
      this.ghostText.set(event.text);
      this.ghostActive.set(true);
      this.ghostDisappearing.set(false);
      return;
    }
    if (event.type === 'final') {
      this.ghostActive.set(false);
      this.ghostDisappearing.set(true);
      const ghostTimeout = window.setTimeout(() => {
        this.ghostText.set('');
        this.ghostDisappearing.set(false);
        this.animationHandles.delete(ghostTimeout);
      }, 400);
      this.animationHandles.add(ghostTimeout);

      const normalized = normalizeVoiceAiResponse(event.response);
      if (this.isSoftVoiceResponse(event.response)) {
        this.liveTranscript.set('');
        this.voiceState.set('idle');
        this.loading.set(false);
        this.pushMessage({
          id: this.createMessageId(),
          sender: 'assistant',
          text: normalized.assistantText ?? normalized.error ?? this.extractAssistantText(event.response),
          timestamp: new Date(),
          origin: 'voice',
          detectedLanguage: normalized.detectedLanguage,
          audioStatusLabel: this.resolveAudioStatusLabel(normalized.audioStatus, !!normalized.audioUrl, 'voice'),
          fallbackLabel: this.extractFallbackLabel(normalized.fallback, normalized.warnings),
          retryable: true,
          retryKind: 'voice',
        });
        this.scheduleAutoListen(300);
        return;
      }

      const rawTranscription = event.response.transcription;
      const transcription = normalized.transcript?.trim() ?? (typeof rawTranscription === 'string' ? rawTranscription.trim() : null);
      if (transcription) {
        this.pushMessage({
          id: this.createMessageId(),
          sender: 'user',
          text: transcription,
          timestamp: new Date(),
          origin: 'voice',
          detectedLanguage: normalized.detectedLanguage,
        });
      }
      this.liveTranscript.set('');
      const result = this.pushAssistantReply(event.response, 'voice');
      this.voiceState.set('idle');
      this.loading.set(false);
      if (!result.isError && !result.audioUrl) this.scheduleAutoListen(300);
      return;
    }
    this.ghostActive.set(false);
    this.ghostDisappearing.set(false);
    this.ghostText.set('');
    this.liveTranscript.set('');
    this.loading.set(false);
    if (this.isSoftNoSpeechMessage(event.message)) {
      this.voiceState.set('idle');
      this.pushMessage({
        id: this.createMessageId(),
        sender: 'assistant',
        text: event.message,
        timestamp: new Date(),
        origin: 'voice',
      });
      this.scheduleAutoListen(300);
      return;
    }
    if (event.kind === 'authExpired') {
      this.voiceState.set('authExpired');
      this.pushSessionExpiredMessage('voice');
      return;
    }
    this.voiceState.set('audioError');
    this.toast.error(event.message);
    this.pushSystemError(event.message, 'voice');
  }

  private streamAssistantText(messageId: string, fullText: string): void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      this.animateAssistantText(messageId, fullText);
      return;
    }
    const token = this.authService.getToken();
    const sessionId = sessionStorage.getItem('weentime.ai.chat.session_id') || 'default';
    const sseUrl = `${environment.aiServiceUrl}/v2/chat/stream?session_id=${encodeURIComponent(sessionId)}` +
                   (token ? `&token=${encodeURIComponent(token)}` : '');
    this.patchMessage(messageId, { isStreaming: true, text: '' });
    this.changeDetector.markForCheck();
    const eventSource = new EventSource(sseUrl);
    let hasReceivedMessage = false;
    eventSource.onmessage = (event) => {
      hasReceivedMessage = true;
      if (event.data === '[DONE]') {
        this.patchMessage(messageId, { isStreaming: false });
        eventSource.close();
        this.triggerDoneFlash();
        this.changeDetector.markForCheck();
        return;
      }
      this.messages.update(messages =>
        messages.map(msg => msg.id === messageId ? { ...msg, text: msg.text + event.data } : msg)
      );
      this.shouldScrollToBottom = true;
      this.changeDetector.markForCheck();
    };
    eventSource.onerror = () => {
      eventSource.close();
      if (!hasReceivedMessage) {
        this.animateAssistantText(messageId, fullText);
      } else {
        this.patchMessage(messageId, { isStreaming: false });
        this.changeDetector.markForCheck();
      }
    };
  }

  private animateAssistantText(messageId: string, fullText: string): void {
    const tokens = fullText.split(/(\s+)/).filter(token => token.length > 0);
    this.patchMessage(messageId, { isStreaming: true });
    if (tokens.length <= 1) {
      this.updateMessageText(messageId, fullText);
      this.patchMessage(messageId, { isStreaming: false });
      this.triggerDoneFlash();
      return;
    }
    let index = 0;
    const tick = () => {
      index = Math.min(index + 2, tokens.length);
      const isDone = index >= tokens.length;
      this.patchMessage(messageId, { text: tokens.slice(0, index).join(''), isStreaming: !isDone });
      this.shouldScrollToBottom = true;
      if (!isDone) {
        const handle = window.setTimeout(tick, 28);
        this.animationHandles.add(handle);
        return;
      }
      this.triggerDoneFlash();
      this.animationHandles.clear();
    };
    tick();
  }

  triggerStatusPill(): void {
    this.statusPillVisible.set(true);
    if (this.statusPillTimeout) clearTimeout(this.statusPillTimeout);
    this.statusPillTimeout = setTimeout(() => { this.statusPillVisible.set(false); }, 3000);
  }

  triggerDoneFlash(): void {
    this.doneFlash.set(true);
    if (this._doneFlashTimer) clearTimeout(this._doneFlashTimer);
    this._doneFlashTimer = setTimeout(() => {
      this.doneFlash.set(false);
      this._doneFlashTimer = undefined;
    }, 800);
  }

  onPanelClick(event: MouseEvent): void {
    this.triggerStatusPill();
  }

  private updateMessageText(messageId: string, text: string): void {
    this.patchMessage(messageId, { text });
    this.shouldScrollToBottom = true;
  }

  private patchMessage(messageId: string, patch: Partial<ChatMessage>): void {
    this.messages.update(messages =>
      messages.map(message => message.id === messageId ? { ...message, ...patch } : message)
    );
  }

  private pushSystemError(message: string, retryKind?: RetryKind): void {
    this.pushMessage({
      id: this.createMessageId(),
      sender: 'system',
      text: message,
      timestamp: new Date(),
      origin: 'system',
      isError: true,
      retryable: !!retryKind,
      retryKind,
      retryPayload: retryKind === 'text' ? this.lastSubmittedText ?? undefined : undefined,
    });
  }

  private pushSessionExpiredMessage(origin: RetryKind | 'system'): void {
    this.pushMessage({
      id: this.createMessageId(),
      sender: 'system',
      text: 'Session expirée, reconnectez-vous.',
      timestamp: new Date(),
      origin: origin === 'voice' ? 'voice' : origin === 'text' ? 'text' : 'system',
      isError: true,
      actionLabel: 'Se reconnecter',
      actionTarget: '/login',
      actionKind: 'route',
    });
  }

  private pushMessage(message: ChatMessage): void {
    const current = this.messages();
    const last = current[current.length - 1];
    if (last && last.sender === message.sender && last.text.trim() === message.text.trim()) return;
    this.messages.update(messages => [...messages, message]);
    this.shouldScrollToBottom = true;
  }

  private handleAssistantMeta(meta: AssistantResponseMeta, retryKind: RetryKind): void {
    this.assistantWorkflow.consumeResponse(meta);
    this.assistantSync.publish(meta, retryKind === 'voice' ? 'voice' : 'chat');
    if (meta.action_result?.executed) this.notificationService.getNotifications().subscribe();
  }

  private scrollToBottom(): void {
    const container = this.messageContainer?.nativeElement;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }

  private extractAssistantText(response: ChatApiResponse | null | undefined): string {
    if (!response) return "Le service AI n'a retourne aucune reponse.";
    const normalized = normalizeVoiceAiResponse(response);
    if (normalized.assistantText) return normalized.assistantText;
    const readResult = this.extractReadResult(normalized.actionResult ?? response.actionResult ?? response.action_result ?? response.data);
    return readResult?.summary
      || this.toDisplayText(response.text)
      || this.toDisplayText(response.message)
      || this.toDisplayText(response.response)
      || this.toDisplayText(response.error)
      || "Le service AI n'a retourne ni texte ni detail exploitable.";
  }

  private extractAudioUrl(response: ChatApiResponse | null | undefined): string | null {
    const normalized = normalizeVoiceAiResponse(response);
    if (normalized.audioUrl) return normalized.audioUrl;
    if (typeof response?.audio_url === 'string' && response.audio_url.trim()) return response.audio_url.trim();
    if (typeof response?.audioUrl === 'string' && response.audioUrl.trim()) return response.audioUrl.trim();
    if (response?.data && typeof response.data === 'object') {
      const data = response.data as Record<string, unknown>;
      return this.firstDisplayString(data['audioUrl'], data['audio_url']);
    }
    return null;
  }

  private resolveAudioStatusLabel(rawStatus: string | null | undefined, hasAudioUrl: boolean, retryKind: RetryKind): string | null {
    if (hasAudioUrl) return 'Audio reply ready';
    const status = String(rawStatus ?? '').trim().toLowerCase();
    if (!status) return retryKind === 'voice' ? 'Text reply only' : null;
    if (status === 'ready' || status === 'generated' || status === 'ok') return 'Audio reply ready';
    if (status === 'tts_unavailable' || status === 'unavailable' || status === 'text_only') return 'Text reply only';
    if (status === 'disabled') return 'Audio disabled';
    return status.replace(/_/g, ' ');
  }

  private extractToolLabels(response: ChatApiResponse, toolCalls: unknown[]): string[] {
    const explicitCalls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
    const merged = explicitCalls.length > 0 ? explicitCalls : toolCalls;
    return merged
      .map(call => {
        const record = this.asRecord(call);
        return this.firstDisplayString(record?.['name'], record?.['tool']);
      })
      .filter((value): value is string => !!value)
      .slice(0, 3);
  }

  private isCapabilityUnavailableKind(value: unknown): boolean {
    const action = this.asRecord(value);
    if (!action) return false;
    const kind = typeof action['kind'] === 'string' ? (action['kind'] as string).toLowerCase() : '';
    return kind === 'capability_unavailable' || kind === 'capability_hint';
  }

  isArabicText(value: string | null | undefined): boolean {
    if (!value) return false;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0x0600 && code <= 0x06FF) return true;
      if (code >= 0x0750 && code <= 0x077F) return true;
      if (code >= 0x08A0 && code <= 0x08FF) return true;
    }
    return false;
  }

  messageDirection(message: ChatMessage): 'rtl' | 'ltr' {
    return this.isArabicText(message.text) ? 'rtl' : 'ltr';
  }

  renderMessageHtml(message: ChatMessage): string {
    const text = safeDisplayText(message.text);
    if (!text) {
      return '';
    }
    return this.renderMarkdownText(text);
  }

  private renderMarkdownText(text: string): string {
    const normalized = text.replace(/\r\n?/g, '\n');
    const codeBlockPattern = /```([a-zA-Z0-9_-]+)?\n?([\s\S]*?)```/g;
    let cursor = 0;
    let output = '';
    let match: RegExpExecArray | null;

    while ((match = codeBlockPattern.exec(normalized)) !== null) {
      output += this.renderMarkdownBlocks(normalized.slice(cursor, match.index));
      const code = match[2] ?? '';
      output += `<pre><code>${this.escapeHtml(code.trimEnd())}</code></pre>`;
      cursor = match.index + match[0].length;
    }

    output += this.renderMarkdownBlocks(normalized.slice(cursor));
    return output || `<p>${this.escapeHtml(normalized)}</p>`;
  }

  private renderMarkdownBlocks(text: string): string {
    const lines = text.split('\n');
    const html: string[] = [];
    let paragraph: string[] = [];
    let listItems: string[] = [];
    let listType: 'ul' | 'ol' | null = null;

    const flushParagraph = () => {
      if (paragraph.length === 0) {
        return;
      }
      html.push(`<p>${this.renderInlineMarkdown(paragraph.join(' ').trim())}</p>`);
      paragraph = [];
    };

    const flushList = () => {
      if (!listType || listItems.length === 0) {
        return;
      }
      html.push(`<${listType}>${listItems.join('')}</${listType}>`);
      listItems = [];
      listType = null;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }

      const unordered = trimmed.match(/^[-*]\s+(.+)$/);
      const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (unordered || ordered) {
        flushParagraph();
        const nextType: 'ul' | 'ol' = unordered ? 'ul' : 'ol';
        if (listType && listType !== nextType) {
          flushList();
        }
        listType = nextType;
        listItems.push(`<li>${this.renderInlineMarkdown((unordered ?? ordered)?.[1] ?? '')}</li>`);
        continue;
      }

      flushList();
      paragraph.push(trimmed);
    }

    flushParagraph();
    flushList();
    return html.join('');
  }

  private renderInlineMarkdown(text: string): string {
    const parts = text.split(/(`[^`]*`)/g);
    return parts.map(part => {
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return `<code>${this.escapeHtml(part.slice(1, -1))}</code>`;
      }
      return this.renderLinksAndEmphasis(part);
    }).join('');
  }

  private renderLinksAndEmphasis(text: string): string {
    const markdownLinkPattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let output = '';
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = markdownLinkPattern.exec(text)) !== null) {
      output += this.renderPlainInline(text.slice(cursor, match.index));
      const label = this.renderPlainInline(match[1] ?? '');
      const href = this.escapeAttribute(match[2] ?? '');
      output += `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      cursor = match.index + match[0].length;
    }

    output += this.renderPlainInline(text.slice(cursor));
    return output;
  }

  private renderPlainInline(text: string): string {
    const urlPattern = /https?:\/\/[^\s<>()]+/g;
    let output = '';
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = urlPattern.exec(text)) !== null) {
      output += this.renderEmphasis(text.slice(cursor, match.index));
      const url = match[0];
      const href = this.escapeAttribute(url);
      output += `<a href="${href}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(url)}</a>`;
      cursor = match.index + url.length;
    }

    output += this.renderEmphasis(text.slice(cursor));
    return output;
  }

  private renderEmphasis(text: string): string {
    return this.escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\b__([^_]+)__\b/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value).replace(/`/g, '&#96;');
  }
  private extractActionResultDisplay(value: unknown): ActionResultDisplay | null {
    const result = this.asRecord(value);
    if (!result) return null;
    const status = this.firstDisplayString(result['status'])?.toLowerCase() ?? 'neutral';
    const message = this.firstDisplayString(
      result['message'],
      this.asRecord(result['details'])?.['message'],
      this.asRecord(result['details'])?.['summary'],
    );
    if (!message && status === 'neutral') return null;
    const tone: ActionTone = status === 'success' ? 'success' : status === 'pending' ? 'warning' : status === 'failed' ? 'error' : 'neutral';
    return { text: message ?? `Action ${status}`, tone };
  }

  private extractFallbackLabel(fallback: UnknownRecord | null, warnings: string[]): string | null {
    const provider = this.firstDisplayString(fallback?.['provider'], fallback?.['provider_name'], fallback?.['providerName']);
    if (provider) return `Fallback provider: ${provider}`;
    const warning = warnings.find(item => item.toLowerCase().includes('fallback'));
    return warning ? 'Provider fallback used' : null;
  }

  private extractConfirmationId(response: ChatApiResponse | null | undefined): string | null {
    const normalized = normalizeVoiceAiResponse(response);
    if (normalized.confirmationId) return normalized.confirmationId;
    const data = this.asRecord(response?.data);
    return this.firstDisplayString(
      response?.confirmationId,
      (response as UnknownRecord | null | undefined)?.['confirmation_id'],
      data?.['confirmationId'],
      data?.['confirmation_id'],
    );
  }

  private extractReadResult(value: unknown): ChatReadResult | null {
    const root = this.asRecord(value);
    if (!root) return null;
    const data = this.asRecord(root['data']);
    const candidate = this.asRecord(data?.['read_result']) ?? this.asRecord(root['read_result']) ?? (root['kind'] === 'read_result' ? root : null);
    if (!candidate || candidate['kind'] !== 'read_result') return null;
    const items = Array.isArray(candidate['items']) ? candidate['items'] : [];
    const count = typeof candidate['count'] === 'number' && Number.isFinite(candidate['count']) ? candidate['count'] : items.length;
    return {
      kind: 'read_result',
      toolName: this.firstDisplayString(candidate['toolName'], candidate['tool_name']),
      summary: this.firstDisplayString(candidate['summary']) ?? (count > 0 ? `${count} resultat(s) trouve(s).` : 'Aucune donnee a afficher.'),
      items,
      empty: candidate['empty'] === true || count === 0,
      count,
      data: candidate['data'],
      error: candidate['error'] ?? null,
      backendStatus: typeof candidate['backendStatus'] === 'number' ? candidate['backendStatus'] : typeof candidate['backend_status'] === 'number' ? candidate['backend_status'] : null,
    };
  }

  private extractPendingFlow(value: unknown): PendingFlowStatus | null {
    const root = this.asRecord(value);
    const data = this.asRecord(root?.['data']);
    const candidate = this.asRecord(root?.['pendingFlow']) ?? this.asRecord(data?.['pendingFlow']) ?? this.asRecord(root?.['pending_flow']) ?? this.asRecord(data?.['pending_flow']);
    if (!candidate) return null;
    const missing = Array.isArray(candidate['missingFields'])
      ? candidate['missingFields'].filter((f): f is string => typeof f === 'string')
      : Array.isArray(candidate['missing_fields'])
        ? candidate['missing_fields'].filter((f): f is string => typeof f === 'string')
        : [];
    const status = this.firstDisplayString(candidate['status']);
    if (status && status !== 'pending') return null;
    return { intent: this.firstDisplayString(candidate['intent']), agent: this.firstDisplayString(candidate['agent']), status, missingFields: missing };
  }

  private extractConfirmationSummary(value: unknown): ConfirmationSummary | null {
    const root = this.asRecord(value);
    const data = this.asRecord(root?.['data']);
    const summary = this.asRecord(root?.['summary']) ?? this.asRecord(data?.['summary']);
    if (!summary) return null;
    return {
      type: this.firstDisplayString(summary['type']),
      date: this.firstDisplayString(summary['date']),
      endDate: this.firstDisplayString(summary['endDate'], summary['end_date']),
      time: this.firstDisplayString(summary['time']),
      motif: this.firstDisplayString(summary['motif'], summary['reason']),
    };
  }

  private mapHistoryMessage(item: ChatHistoryMessage): ChatMessage {
    return {
      id: this.createMessageId(),
      sender: item.sender === 'user' ? 'user' : 'assistant',
      text: this.toDisplayText(item.message) ?? '',
      timestamp: new Date(item.timestamp),
      origin: 'text',
    };
  }

  private buildWelcomeMessage(): ChatMessage {
    const role = this.assistantRole();
    const text = role === 'MANAGER'
      ? 'Manager AI is ready for approvals, team summaries, and attendance anomalies.'
      : role === 'RH'
        ? 'RH AI is ready for backlog review, validations, and document workload.'
        : role === 'ADMIN'
          ? 'Admin AI is ready for system health, provider status, and tenant issues.'
          : 'Employee AI is ready for daily summaries, leave balance, and attendance help.';
    return { id: this.createMessageId(), sender: 'assistant', text, timestamp: new Date(), origin: 'system' };
  }

  private persistSessionHistory(userId: number, messages: ChatMessage[]): void {
    try {
      const snapshots: CachedChatMessage[] = messages
        .slice(-ChatWidgetComponent.SESSION_CACHE_LIMIT)
        .map(message => ({
          sender: message.sender,
          text: message.text,
          timestamp: message.timestamp.toISOString(),
          origin: message.origin,
          intent: message.intent ?? null,
          isError: message.isError === true,
          detectedLanguage: message.detectedLanguage ?? null,
          audioStatusLabel: message.audioStatusLabel ?? null,
          fallbackLabel: message.fallbackLabel ?? null,
          confirmationResolved: message.confirmationResolved === true,
          confirmationState: message.confirmationState ?? null,
          confirmationDecision: message.confirmationDecision ?? null,
        }));
      localStorage.setItem(this.sessionCacheKey(userId), JSON.stringify(snapshots));
    } catch {}
  }

  private readSessionHistory(): ChatMessage[] {
    const userId = this.authService.currentUser()?.id;
    if (!userId) return [];
    try {
      const raw = localStorage.getItem(this.sessionCacheKey(userId));
      if (!raw) return [];
      const cached = JSON.parse(raw) as CachedChatMessage[];
      if (!Array.isArray(cached)) return [];
      return cached
        .filter(item => typeof item?.text === 'string' && item.text.trim().length > 0)
        .map(item => ({
          id: this.createMessageId(),
          sender: item.sender,
          text: item.text,
          timestamp: new Date(item.timestamp),
          origin: item.origin ?? 'text',
          intent: item.intent ?? null,
          isError: item.isError === true,
          detectedLanguage: item.detectedLanguage ?? null,
          audioStatusLabel: item.audioStatusLabel ?? null,
          fallbackLabel: item.fallbackLabel ?? null,
          confirmationResolved: item.confirmationResolved === true,
          confirmationState: item.confirmationState ?? (item.confirmationResolved === true ? (item.confirmationDecision === 'cancelled' ? 'cancelled' : 'success') : null),
          confirmationDecision: item.confirmationDecision ?? null,
        }));
    } catch { return []; }
  }

  private sessionCacheKey(userId: number): string {
    return `${ChatWidgetComponent.SESSION_CACHE_PREFIX}${userId}`;
  }

  private playAudio(url: string, resumeVoiceAfterPlayback: boolean): void {
    this.stopAudioPlayback();
    const audio = new Audio(url);
    this.activeAudio = audio;
    this.speaking.set(true);
    const onEnd = () => {
      if (this.activeAudio === audio) this.activeAudio = undefined;
      this.speaking.set(false);
      if (resumeVoiceAfterPlayback) this.scheduleAutoListen(250);
    };
    audio.onended = onEnd;
    audio.onerror = onEnd;
    void audio.play().catch(onEnd);
  }

  private handleRequestFailure(message: string, retryKind: RetryKind): void {
    if (this.isAuthExpiredMessage(message)) {
      this.pushSessionExpiredMessage(retryKind);
      return;
    }
    if (this.isPermissionDeniedMessage(message)) {
      this.pushSystemError(message);
      return;
    }
    if (this.isSoftNoSpeechMessage(message)) {
      this.pushMessage({
        id: this.createMessageId(),
        sender: 'assistant',
        text: message,
        timestamp: new Date(),
        origin: retryKind === 'voice' ? 'voice' : 'text',
        retryable: retryKind === 'voice',
        retryKind: retryKind === 'voice' ? 'voice' : undefined,
      });
      if (retryKind === 'voice') this.scheduleAutoListen(300);
      return;
    }
    this.pushSystemError(message, retryKind);
  }

  private resolveErrorMessage(error: unknown): string {
    const raw = error instanceof Error && error.message.trim() ? error.message.trim() : '';
    if (!raw) return "Je n'ai pas pu récupérer cette information, veuillez réessayer.";
    const normalized = raw.toLowerCase();
    if ((normalized.includes('session') && normalized.includes('expire')) || normalized.includes('auth_required') || raw.includes('401')) {
      return 'Session expirée, reconnectez-vous.';
    }
    if (normalized.includes('permission') || normalized.includes('forbidden') || raw.includes('403')) {
      return "Vous n'avez pas les droits necessaires pour cette action.";
    }
    if (normalized.includes('429') || normalized.includes('trop de requetes') || normalized.includes('too many')) {
      return 'Le service AI limite temporairement les requetes. Reessayez dans quelques instants.';
    }
    if (
      normalized.includes('backend metier')
      || normalized.includes('backend métier')
      || normalized.includes('backend_unavailable')
      || normalized.includes('all connection attempts failed')
      || normalized.includes('backend service is temporarily unavailable')
      || normalized.includes('service metier')
      || normalized.includes('service métier')
    ) {
      return 'Backend métier indisponible.';
    }
    if (
      normalized.includes('service ia indisponible')
      || normalized.includes('gateway ai est indisponible')
      || normalized.includes('backend ai')
      || normalized.includes('network')
      || normalized.includes('inaccessible')
    ) {
      return 'Service IA indisponible.';
    }
    if (normalized.includes('route ai') || normalized.includes('404 not found') || normalized.includes('http failure response')) {
      return "La route IA est introuvable sur le service AI.";
    }
    if (normalized.includes('provider ai') || normalized.includes('assistant temporairement indisponible') || normalized.includes('ollama')) {
      return 'Le provider AI est temporairement indisponible.';
    }
    if (normalized.includes('invalid audio')) {
      return 'Audio invalide. Reessayez avec un nouvel enregistrement.';
    }
    if (raw.includes('409') || normalized.includes('conflict')) {
      return "Cette action existe deja ou a deja ete traitee.";
    }
    return raw;
  }

  private isSoftNoSpeechMessage(message: string | null | undefined): boolean {
    const normalized = (message || '').trim().toLowerCase();
    return normalized.includes("je n'ai pas bien entendu") || normalized.includes("je n'ai pas bien compris") || normalized.includes("je n'ai rien entendu") || normalized.includes("je n'ai pas entendu");
  }

  private isAuthExpiredMessage(message: string | null | undefined): boolean {
    const normalized = (message || '').trim().toLowerCase();
    return (normalized.includes('session') && normalized.includes('expir'))
      || normalized.includes('session wfet')
      || normalized.includes('انتهت الجلسة');
  }

  private isPermissionDeniedMessage(message: string | null | undefined): boolean {
    const normalized = (message || '').trim().toLowerCase();
    return normalized.includes('permission')
      || normalized.includes('forbidden')
      || normalized.includes('access denied')
      || normalized.includes('accès refus')
      || normalized.includes('acces refus')
      || normalized.includes('droits necessaires')
      || normalized.includes('droits nécessaires')
      || normalized.includes('تم رفض الوصول');
  }

  private isVoiceBusyState(state: VoiceAssistantState): boolean {
    return state === 'stopping' || state === 'uploading' || state === 'transcribing' || state === 'responding';
  }

  private isSoftVoiceResponse(response: ChatApiResponse | null | undefined): boolean {
    const normalized = normalizeVoiceAiResponse(response);
    const status = (normalized.status || response?.status || '').trim().toLowerCase();
    const text = `${normalized.assistantText ?? ''} ${normalized.error ?? ''}`.toLowerCase();
    return status === 'retry' || status === 'no_input' || status === 'no_speech' || status === 'unclear_audio' || status === 'invalid_audio' || text.includes("je n'ai pas bien compris") || text.includes("je n'ai rien entendu") || text.includes("je n'ai pas entendu");
  }

  private toDisplayText(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }

  private normalizedMessageLanguage(message: ChatMessage): 'fr' | 'en' | 'ar' | 'tn' {
    const value = String(message.detectedLanguage ?? '').trim().toLowerCase();
    if (value.startsWith('en')) {
      return 'en';
    }
    if (value.startsWith('ar')) {
      return 'ar';
    }
    if (value === 'tn' || value.includes('tunis')) {
      return 'tn';
    }
    return 'fr';
  }

  private readResultErrorCode(readResult: ChatReadResult | null | undefined): string {
    if (!readResult) {
      return '';
    }
    const record = this.asRecord(readResult.error);
    return String(
      record?.['code']
        ?? record?.['error_code']
        ?? record?.['kind']
        ?? '',
    ).trim().toLowerCase();
  }

  private actionResultRequiresLogin(value: unknown): boolean {
    const code = this.actionResultErrorCode(value);
    const status = this.actionResultStatusCode(value);
    return code === 'auth_required'
      || code === 'missing_jwt'
      || code === 'invalid_jwt'
      || code === 'expired_jwt'
      || status === 401;
  }

  private actionResultAccessDenied(value: unknown): boolean {
    const code = this.actionResultErrorCode(value);
    const status = this.actionResultStatusCode(value);
    return code === 'access_denied'
      || code === 'permission_denied'
      || code === 'forbidden'
      || status === 403;
  }

  private actionResultErrorCode(value: unknown): string {
    const root = this.asRecord(value);
    const data = this.asRecord(root?.['data']);
    const nestedError = this.asRecord(root?.['error']) ?? this.asRecord(data?.['error']);
    return String(
      root?.['error_code']
        ?? root?.['code']
        ?? root?.['kind']
        ?? data?.['error_code']
        ?? data?.['code']
        ?? data?.['kind']
        ?? nestedError?.['code']
        ?? nestedError?.['error_code']
        ?? '',
    ).trim().toLowerCase();
  }

  private actionResultStatusCode(value: unknown): number | null {
    const root = this.asRecord(value);
    const data = this.asRecord(root?.['data']);
    const raw = root?.['status_code']
      ?? root?.['statusCode']
      ?? root?.['backendStatus']
      ?? data?.['status_code']
      ?? data?.['statusCode']
      ?? data?.['backendStatus'];
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }

  private createMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private buildMessageAction(response: ChatApiResponse, meta: AssistantResponseMeta): { label: string; target: string; kind: MessageActionKind } | null {
    if (response.status === 'confirm') return { label: 'Confirmer', target: 'oui confirme', kind: 'confirm' };
    if (response.type === 'workflow' && response.status === 'failed') return null;
    const downloadUrl = this.extractDownloadUrl(response, meta);
    if (downloadUrl) return { label: 'Ouvrir le document', target: downloadUrl, kind: 'link' };
    if (response.type === 'ask') return null;
    const route = this.defaultRouteForIntent(meta.intent);
    if (!route) return null;
    const label = meta.action_result?.executed ? 'Voir la page' : 'Ouvrir';
    return { label, target: route, kind: 'route' };
  }

  private extractDownloadUrl(response: ChatApiResponse, meta: AssistantResponseMeta): string | null {
    const directUrl = meta.entities?.['download_url'];
    if (typeof directUrl === 'string' && directUrl.trim().length > 0) return directUrl.trim();
    const detailUrl = meta.action_result?.details?.['download_url'];
    if (typeof detailUrl === 'string' && detailUrl.trim().length > 0) return detailUrl.trim();
    const data = response.data && typeof response.data === 'object' ? response.data as Record<string, unknown> : null;
    const result = data?.['result'];
    if (result && typeof result === 'object') {
      const nested = (result as Record<string, unknown>)['download_url'];
      if (typeof nested === 'string' && nested.trim().length > 0) return nested.trim();
    }
    const payloadUrl = data?.['download_url'];
    return typeof payloadUrl === 'string' && payloadUrl.trim().length > 0 ? payloadUrl.trim() : null;
  }

  private extractWorkflow(response: ChatApiResponse, meta: AssistantResponseMeta): AssistantWorkflowState | null {
    if (meta.workflow) return meta.workflow;
    if (response.type !== 'workflow' && !Array.isArray(response.steps)) return null;
    return {
      workflow_id: null,
      name: response.action ?? response.intent ?? 'workflow',
      status: response.status ?? 'success',
      pending_step: null,
      completed_steps: Array.isArray(response.steps) ? response.steps.filter(s => s.status === 'success' || s.status === 'warning').map(s => s.key) : [],
      can_retry: response.status === 'failed',
      steps: Array.isArray(response.steps) ? response.steps : [],
    };
  }

  workflowStatusLabel(workflow: AssistantWorkflowState | null | undefined): string {
    const status = workflow?.status;
    if (status === 'failed') return 'Workflow interrompu';
    if (status === 'success') return 'Workflow termine';
    return 'Workflow';
  }

  workflowStepIcon(status: string | undefined): string {
    switch (status) {
      case 'success': return 'check-circle-2';
      case 'warning': return 'triangle-alert';
      case 'failed': return 'circle-x';
      case 'running': return 'loader-2';
      default: return 'circle';
    }
  }

  private defaultRouteForIntent(intent?: string): string | null {
    const role = this.assistantRole();
    switch (intent) {
      case 'CREATE_LEAVE': case 'GET_LEAVE_BALANCE': case 'GET_MY_REQUESTS': case 'leave.balance': case 'leave.list':
        if (role === 'RH') return '/app/rh/conges';
        if (role === 'MANAGER') return '/app/manager/approbations';
        return '/app/employee/conges';
      case 'CREATE_AUTORISATION': case 'authorization.list': return '/app/employee/autorisations';
      case 'CREATE_TELEWORK': case 'telework.list':
        if (role === 'RH') return '/app/rh/teletravail';
        if (role === 'MANAGER') return '/app/manager/teletravail';
        return '/app/employee/teletravail';
      case 'REQUEST_DOCUMENT': case 'OPEN_DOCUMENT': case 'document.list':
        if (role === 'RH') return '/app/rh/documents';
        if (role === 'MANAGER') return '/app/manager/documents';
        return '/app/employee/documents';
      case 'GET_NOTIFICATIONS': return '/app/notifications';
      case 'GET_TEAM_REQUESTS': case 'GET_PENDING_VALIDATIONS': case 'APPROVE_REQUEST': case 'REJECT_REQUEST': return '/app/manager/approbations';
      case 'GET_RH_STATS': return '/app/rh/dashboard';
      case 'GET_ALL_REQUESTS': case 'PROCESS_REQUEST': return '/app/rh/requests';
      default: return null;
    }
  }

  private openExternalLink(target: string): void {
    if (typeof window === 'undefined') return;
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  private scheduleAutoListen(delayMs: number): void {
    if (!this.handsFreeMode() || !this.isOpen() || this.loading() || this.voiceState() !== 'idle' || this.activeAudio) return;
    this.clearAutoListen();
    this.autoListenHandle = window.setTimeout(() => {
      this.autoListenHandle = null;
      if (!this.isOpen() || this.loading() || this.voiceState() !== 'idle' || this.input().trim().length > 0 || this.activeAudio) return;
      this.liveTranscript.set('');
      void this.voiceAssistant.start();
    }, delayMs);
  }

  private clearAutoListen(): void {
    if (this.autoListenHandle !== null) {
      window.clearTimeout(this.autoListenHandle);
      this.autoListenHandle = null;
    }
  }

  private stopAudioPlayback(): void {
    if (!this.activeAudio) { this.speaking.set(false); return; }
    this.activeAudio.pause();
    this.activeAudio.currentTime = 0;
    this.activeAudio = undefined;
    this.speaking.set(false);
  }

  private resolveConfirmationState(response: ChatApiResponse, approved: boolean): ConfirmationState {
    if (!approved) return response.type === 'error' ? 'failure' : 'cancelled';
    const actionResult = this.asRecord(response.actionResult ?? response.action_result);
    if (response.type === 'error') return 'failure';
    if (actionResult?.['success'] === false || actionResult?.['error']) return 'failure';
    const toolCalls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
    for (const call of toolCalls) {
      const status = this.firstDisplayString(this.asRecord(call)?.['status'])?.toLowerCase();
      if (status === 'failed' || status === 'denied' || status === 'business_conflict') return 'failure';
    }
    return 'success';
  }

  private markConfirmationPending(messageId: string, pending: boolean): void {
    this.patchMessage(messageId, { confirmationPending: pending, confirmationState: pending ? 'executing' : 'pending' });
  }

  private markConfirmationResolved(messageId: string, state: ConfirmationState): void {
    const resolved = state === 'success' || state === 'failure' || state === 'cancelled';
    this.patchMessage(messageId, {
      confirmationPending: state === 'executing',
      confirmationResolved: resolved,
      confirmationState: state,
      confirmationDecision: state === 'cancelled' ? 'cancelled' : state === 'success' ? 'approved' : null,
      actionLabel: resolved ? null : undefined,
      actionTarget: resolved ? null : undefined,
      actionKind: resolved ? null : undefined,
    });
  }

  private blurActiveElementInPanel(): void {
    const panel = this.chatPanel?.nativeElement;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (panel && active instanceof HTMLElement && panel.contains(active)) active.blur();
  }

  private asRecord(value: unknown): UnknownRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
  }

  private firstDisplayString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return null;
  }

  private resolveRole(user: ReturnType<AuthService['currentUser']>): string | null {
    if (!user) return null;
    const primaryRole = typeof user.role === 'string' && user.role.trim().length > 0
      ? user.role.trim()
      : Array.isArray(user.roles) && user.roles.length > 0
        ? String(user.roles[0]).trim()
        : '';
    return primaryRole.length > 0 ? primaryRole.replace(/^ROLE_/i, '').toUpperCase() : null;
  }
}