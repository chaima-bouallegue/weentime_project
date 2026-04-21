import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { LucideAngularModule } from 'lucide-angular';
import { DragDropModule, CdkDragEnd } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { AssistantResponseMeta, AssistantWorkflowState } from '../../core/models/assistant.model';
import { ChatApiResponse, ChatHistoryMessage, ChatService, TtsResponse } from './chat.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { AssistantSyncService } from '../../core/services/assistant-sync.service';
import { ToastService } from '../../core/services/toast.service';
import { AssistantWorkflowService } from '../../core/services/assistant-workflow.service';
import { VoiceAssistantEvent, VoiceAssistantService, VoiceAssistantState } from './voice-assistant.service';

type ChatMessageSender = 'user' | 'assistant' | 'system';
type RetryKind = 'text' | 'voice';
type MessageActionKind = 'route' | 'link' | 'confirm';

interface ChatMessage {
  id: string;
  sender: ChatMessageSender;
  text: string;
  timestamp: Date;
  intent?: string | null;
  audioUrl?: string | null;
  isError?: boolean;
  retryable?: boolean;
  retryKind?: RetryKind;
  retryPayload?: string;
  actionLabel?: string | null;
  actionTarget?: string | null;
  actionKind?: MessageActionKind | null;
  workflow?: AssistantWorkflowState | null;
}

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, DragDropModule],
  templateUrl: './chat-widget.component.html',
  styleUrl: './chat-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWidgetComponent implements AfterViewChecked, OnDestroy {
  @ViewChild('messageContainer') private messageContainer?: ElementRef<HTMLDivElement>;

  private readonly chatService = inject(ChatService);
  private readonly voiceAssistant = inject(VoiceAssistantService);
  private readonly assistantWorkflow = inject(AssistantWorkflowService);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly assistantSync = inject(AssistantSyncService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly isOpen = signal(false);
  readonly input = signal('');
  readonly loading = signal(false);
  readonly voiceState = signal<VoiceAssistantState>('idle');
  readonly liveTranscript = signal('');
  readonly loadingHistory = signal(false);
  readonly messages = signal<ChatMessage[]>([]);
  readonly panelPosition = signal({ x: 0, y: 0 });
  readonly handsFreeMode = signal(true);
  readonly speaking = signal(false);

  readonly currentUserName = computed(() => {
    const user = this.authService.currentUser();
    return user?.prenom || user?.nom || user?.email || 'collaborateur';
  });
  readonly assistantRole = computed(() => this.resolveRole(this.authService.currentUser()) ?? 'EMPLOYEE');
  readonly roleLabel = computed(() => {
    switch (this.assistantRole()) {
      case 'MANAGER':
        return 'Manager';
      case 'RH':
        return 'RH';
      case 'ADMIN':
        return 'Admin';
      default:
        return 'Employe';
    }
  });
  readonly panelTitle = computed(() => `${this.roleLabel()} Copilot`);
  readonly recording = computed(() => this.voiceState() === 'listening');
  readonly canSend = computed(() => this.input().trim().length > 0 && !this.loading() && !this.recording());
  readonly quickActions = computed(() => {
    switch (this.assistantRole()) {
      case 'MANAGER':
        return [
          'Montre-moi les demandes equipe',
          'Approuve le conge 42',
          'Quelles validations sont en attente ?',
        ];
      case 'RH':
        return [
          'Montre-moi les notifications RH',
          'Ouvre le document 12',
          'Donne-moi les stats entreprise',
        ];
      case 'ADMIN':
        return [
          'Donne-moi l etat systeme',
          'Montre-moi les analytics globaux',
          'As-tu des notifications admin ?',
        ];
      default:
        return [
          'Je veux un conge demain',
          'Montre mes demandes',
          'Demande un bulletin de paie',
        ];
    }
  });
  readonly statusLabel = computed(() => {
    if (this.speaking()) {
      return 'Speaking...';
    }
    switch (this.voiceState()) {
      case 'listening':
        return 'Listening...';
      case 'processing':
        return 'Processing...';
      case 'responding':
        return 'Thinking...';
      case 'error':
        return 'Assistant temporairement indisponible';
      default:
        return this.loading() ? 'Thinking...' : `${this.roleLabel()} | ${this.currentUserName()}`;
    }
  });

  private shouldScrollToBottom = false;
  private loadedHistoryForUserId: number | null = null;
  private lastSubmittedText: string | null = null;
  private voiceSubscription?: Subscription;
  private animationHandles = new Set<number>();
  private activeAudio?: HTMLAudioElement;
  private autoListenHandle: number | null = null;

  constructor() {
    this.voiceSubscription = this.voiceAssistant.events$.subscribe(event => this.handleVoiceEvent(event));
    effect(() => {
      const user = this.authService.currentUser();
      if (!user?.id || this.loadedHistoryForUserId === user.id) {
        return;
      }
      this.loadedHistoryForUserId = user.id;
      this.loadHistory();
    });
    effect(() => {
      const shouldAutoListen = this.isOpen()
        && this.handsFreeMode()
        && !this.loading()
        && !this.activeAudio
        && this.voiceState() === 'idle'
        && this.input().trim().length === 0;
      if (!shouldAutoListen) {
        this.clearAutoListen();
        return;
      }
      this.scheduleAutoListen(250);
    });
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScrollToBottom) {
      return;
    }
    this.shouldScrollToBottom = false;
    this.scrollToBottom();
  }

  ngOnDestroy(): void {
    this.voiceSubscription?.unsubscribe();
    for (const handle of this.animationHandles) {
      window.clearTimeout(handle);
    }
    this.animationHandles.clear();
    this.clearAutoListen();
    this.stopAudioPlayback();
    void this.voiceAssistant.stop();
  }

  toggleChat(): void {
    const next = !this.isOpen();
    this.isOpen.set(next);
    if (!next) {
      this.clearAutoListen();
      this.stopAudioPlayback();
      void this.voiceAssistant.stop();
    }
    this.shouldScrollToBottom = true;
  }

  closeChat(): void {
    this.isOpen.set(false);
    this.clearAutoListen();
    this.stopAudioPlayback();
    void this.voiceAssistant.stop();
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
    if (!message || this.loading()) {
      return;
    }

    this.pushMessage({ id: this.createMessageId(), sender: 'user', text: message, timestamp: new Date() });
    this.lastSubmittedText = message;
    this.input.set('');
    this.loading.set(true);

    this.chatService.sendMessage(message).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: response => {
        this.pushAssistantReply(response, 'text');
      },
      error: error => this.handleRequestFailure(this.resolveErrorMessage(error), 'text'),
    });
  }

  async toggleRecording(): Promise<void> {
    if (this.recording()) {
      await this.voiceAssistant.stop();
      return;
    }
    this.liveTranscript.set('');
    await this.voiceAssistant.start();
  }

  playMessageAudio(message: ChatMessage): void {
    if (message.audioUrl) {
      this.playAudio(message.audioUrl, false);
      return;
    }
    this.chatService.textToSpeech(message.text).subscribe({
      next: (response: TtsResponse) => {
        message.audioUrl = response.audio_url;
        this.playAudio(response.audio_url, false);
      },
      error: error => this.handleRequestFailure(this.resolveErrorMessage(error), 'text'),
    });
  }

  onDragEnd(event: CdkDragEnd): void {
    this.panelPosition.set(event.source.getFreeDragPosition());
  }

  sendQuickAction(prompt: string): void {
    if (this.loading()) {
      return;
    }
    this.input.set(prompt);
    this.sendMessage();
  }

  retryFailedMessage(message: ChatMessage): void {
    if (this.loading()) {
      return;
    }
    if (message.retryKind === 'voice') {
      this.liveTranscript.set('');
      this.voiceState.set('idle');
      void this.voiceAssistant.start();
      return;
    }
    if (!message.retryPayload) {
      return;
    }
    this.sendStoredText(message.retryPayload);
  }

  runMessageAction(message: ChatMessage): void {
    if (!message.actionTarget) {
      return;
    }
    if (message.actionKind === 'confirm') {
      this.sendStoredText(message.actionTarget);
      return;
    }
    if (message.actionKind === 'route') {
      void this.router.navigateByUrl(message.actionTarget);
      return;
    }
    this.openExternalLink(message.actionTarget);
  }

  trackByMessageId(_: number, message: ChatMessage): string {
    return message.id;
  }

  formatTimestamp(timestamp: Date): string {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
  }

  private loadHistory(): void {
    this.loadingHistory.set(true);
    this.chatService.getHistory().pipe(finalize(() => this.loadingHistory.set(false))).subscribe({
      next: response => {
        const history = response.items.map(item => this.mapHistoryMessage(item));
        this.messages.set(history.length > 0 ? history : [this.buildWelcomeMessage()]);
        this.shouldScrollToBottom = true;
      },
      error: () => {
        this.messages.set([this.buildWelcomeMessage()]);
        this.toast.warning("L'historique AI n'a pas pu etre charge.");
      },
    });
  }

  private pushAssistantReply(
    response: ChatApiResponse,
    retryKind: RetryKind,
  ): { isError: boolean; audioUrl: string | null } {
    const meta = this.chatService.extractAssistantMeta(response);
    this.handleAssistantMeta(meta, retryKind);
    const text = this.extractAssistantText(response);
    const audioUrl = this.extractAudioUrl(response);
    const workflow = this.extractWorkflow(response, meta);
    const messageAction = this.buildMessageAction(response, meta);
    const isWorkflowFailure = response.type === 'workflow' && response.status === 'failed';
    const isHardError = response.type === 'error';
    const isError = isHardError || isWorkflowFailure;

    const message: ChatMessage = {
      id: this.createMessageId(),
      sender: isHardError ? 'system' : 'assistant',
      text: isHardError ? text : '',
      timestamp: new Date(),
      intent: response.intent ?? null,
      audioUrl,
      isError,
      retryable: isHardError || (isWorkflowFailure && workflow?.can_retry === true),
      retryKind: (isHardError || isWorkflowFailure) ? retryKind : undefined,
      retryPayload: isHardError
        ? (retryKind === 'text' ? this.lastSubmittedText ?? undefined : undefined)
        : isWorkflowFailure && workflow?.can_retry
          ? 'reprends le workflow'
          : undefined,
      actionLabel: isHardError || isWorkflowFailure ? null : messageAction?.label ?? null,
      actionTarget: isHardError || isWorkflowFailure ? null : messageAction?.target ?? null,
      actionKind: isHardError || isWorkflowFailure ? null : messageAction?.kind ?? null,
      workflow,
    };
    this.pushMessage(message);

    if (isHardError) {
      return { isError, audioUrl };
    }

    this.animateAssistantText(message.id, text);
    if (response.intent === 'OPEN_DOCUMENT' && messageAction?.kind === 'link' && messageAction.target) {
      this.openExternalLink(messageAction.target);
    }
    if (audioUrl) {
      this.playAudio(audioUrl, retryKind === 'voice');
    }
    return { isError, audioUrl };
  }

  private sendStoredText(message: string): void {
    this.lastSubmittedText = message;
    this.loading.set(true);
    this.chatService.sendMessage(message).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: response => {
        this.pushAssistantReply(response, 'text');
      },
      error: error => this.handleRequestFailure(this.resolveErrorMessage(error), 'text'),
    });
  }

  private handleVoiceEvent(event: VoiceAssistantEvent): void {
    if (event.type === 'state') {
      this.voiceState.set(event.state);
      this.loading.set(event.state === 'processing' || event.state === 'responding');
      return;
    }
    if (event.type === 'partial') {
      this.liveTranscript.set(event.text);
      return;
    }
    if (event.type === 'final') {
      if (this.isSoftVoiceResponse(event.response)) {
        this.liveTranscript.set('');
        this.voiceState.set('idle');
        this.loading.set(false);
        this.pushMessage({
          id: this.createMessageId(),
          sender: 'assistant',
          text: this.extractAssistantText(event.response),
          timestamp: new Date(),
          retryable: true,
          retryKind: 'voice',
        });
        this.scheduleAutoListen(300);
        return;
      }

      const transcription = event.response.transcription?.trim();
      if (transcription) {
        this.pushMessage({ id: this.createMessageId(), sender: 'user', text: transcription, timestamp: new Date() });
      }
      this.liveTranscript.set('');
      const result = this.pushAssistantReply(event.response, 'voice');
      this.voiceState.set('idle');
      this.loading.set(false);
      if (!result.isError && !result.audioUrl) {
        this.scheduleAutoListen(300);
      }
      return;
    }
    this.liveTranscript.set('');
    this.loading.set(false);
    if (this.isSoftNoSpeechMessage(event.message)) {
      this.voiceState.set('idle');
      this.pushMessage({
        id: this.createMessageId(),
        sender: 'assistant',
        text: event.message,
        timestamp: new Date(),
      });
      this.scheduleAutoListen(300);
      return;
    }
    this.voiceState.set('error');
    this.toast.error(event.message);
    this.pushSystemError(event.message);
  }

  private animateAssistantText(messageId: string, fullText: string): void {
    const tokens = fullText.split(/(\s+)/).filter(token => token.length > 0);
    if (tokens.length <= 1) {
      this.updateMessageText(messageId, fullText);
      return;
    }

    let index = 0;
    const tick = () => {
      index = Math.min(index + 2, tokens.length);
      this.updateMessageText(messageId, tokens.slice(0, index).join(''));
      if (index < tokens.length) {
        const handle = window.setTimeout(tick, 28);
        this.animationHandles.add(handle);
        return;
      }
      this.animationHandles.clear();
    };
    tick();
  }

  private updateMessageText(messageId: string, text: string): void {
    this.messages.update(messages =>
      messages.map(message => message.id === messageId ? { ...message, text } : message)
    );
    this.shouldScrollToBottom = true;
  }

  private pushSystemError(message: string, retryKind?: RetryKind): void {
    this.pushMessage({
      id: this.createMessageId(),
      sender: 'system',
      text: message,
      timestamp: new Date(),
      isError: true,
      retryable: !!retryKind,
      retryKind,
      retryPayload: retryKind === 'text' ? this.lastSubmittedText ?? undefined : undefined,
    });
  }

  private pushMessage(message: ChatMessage): void {
    const current = this.messages();
    const last = current[current.length - 1];
    if (last && last.sender === message.sender && last.text.trim() === message.text.trim()) {
      return;
    }
    this.messages.update(messages => [...messages, message]);
    this.shouldScrollToBottom = true;
  }

  private handleAssistantMeta(meta: AssistantResponseMeta, retryKind: RetryKind): void {
    this.assistantWorkflow.consumeResponse(meta);
    this.assistantSync.publish(meta, retryKind === 'voice' ? 'voice' : 'chat');

    if (meta.action_result?.executed) {
      this.notificationService.getNotifications().subscribe();
    }
  }

  private scrollToBottom(): void {
    const container = this.messageContainer?.nativeElement;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }

  private extractAssistantText(response: ChatApiResponse | null | undefined): string {
    if (!response) {
      return "Le service AI n'a retourne aucune reponse.";
    }
    return this.toDisplayText(response.text)
      || this.toDisplayText(response.message)
      || this.toDisplayText(response.response)
      || this.toDisplayText(response.error)
      || "Le service AI n'a retourne ni texte ni detail exploitable.";
  }

  private extractAudioUrl(response: ChatApiResponse | null | undefined): string | null {
    if (typeof response?.audio_url === 'string' && response.audio_url.trim()) {
      return response.audio_url.trim();
    }
    if (response?.data && typeof response.data === 'object') {
      const data = response.data as Record<string, unknown>;
      return typeof data['audio_url'] === 'string' ? data['audio_url'] : null;
    }
    return null;
  }

  private mapHistoryMessage(item: ChatHistoryMessage): ChatMessage {
    return {
      id: this.createMessageId(),
      sender: item.sender === 'user' ? 'user' : 'assistant',
      text: this.toDisplayText(item.message) ?? '',
      timestamp: new Date(item.timestamp),
    };
  }

  private buildWelcomeMessage(): ChatMessage {
    const role = this.assistantRole();
    const text = role === 'MANAGER'
      ? "Bonjour. Je peux vous aider a approuver les demandes equipe et suivre vos validations."
      : role === 'RH'
        ? "Bonjour. Je peux vous aider a traiter les demandes RH, ouvrir les documents et consulter les indicateurs."
        : role === 'ADMIN'
          ? "Bonjour. Je peux vous donner l'etat du systeme AI, les analytics globaux et le contexte d'exploitation."
          : 'Bonjour. Je peux automatiser vos demandes de conge, vos autorisations, vos documents et votre pointage.';
    return {
      id: this.createMessageId(),
      sender: 'assistant',
      text,
      timestamp: new Date(),
    };
  }

  private playAudio(url: string, resumeVoiceAfterPlayback: boolean): void {
    this.stopAudioPlayback();
    const audio = new Audio(url);
    this.activeAudio = audio;
    this.speaking.set(true);

    audio.onended = () => {
      if (this.activeAudio === audio) {
        this.activeAudio = undefined;
      }
      this.speaking.set(false);
      if (resumeVoiceAfterPlayback) {
        this.scheduleAutoListen(250);
      }
    };
    audio.onerror = () => {
      if (this.activeAudio === audio) {
        this.activeAudio = undefined;
      }
      this.speaking.set(false);
      if (resumeVoiceAfterPlayback) {
        this.scheduleAutoListen(250);
      }
    };

    void audio.play().catch(() => {
      if (this.activeAudio === audio) {
        this.activeAudio = undefined;
      }
      this.speaking.set(false);
      if (resumeVoiceAfterPlayback) {
        this.scheduleAutoListen(250);
      }
    });
  }

  private handleRequestFailure(message: string, retryKind: RetryKind): void {
    if (this.isSoftNoSpeechMessage(message)) {
      this.pushMessage({
        id: this.createMessageId(),
        sender: 'assistant',
        text: message,
        timestamp: new Date(),
        retryable: retryKind === 'voice',
        retryKind: retryKind === 'voice' ? 'voice' : undefined,
      });
      if (retryKind === 'voice') {
        this.scheduleAutoListen(300);
      }
      return;
    }
    this.pushSystemError(message, retryKind);
  }

  private resolveErrorMessage(error: unknown): string {
    return error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Une erreur inattendue a interrompu la reponse de l'assistant.";
  }

  private isSoftNoSpeechMessage(message: string | null | undefined): boolean {
    const normalized = (message || '').trim().toLowerCase();
    return normalized.includes("je n'ai pas bien entendu")
      || normalized.includes("je n'ai pas bien compris")
      || normalized.includes("je n'ai rien entendu")
      || normalized.includes("je n'ai pas entendu");
  }

  private isSoftVoiceResponse(response: ChatApiResponse | null | undefined): boolean {
    const status = (response?.status || '').trim().toLowerCase();
    return status === 'retry' || status === 'no_input' || status === 'no_speech';
  }

  private toDisplayText(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (value && typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    }
    return null;
  }

  private createMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private buildMessageAction(
    response: ChatApiResponse,
    meta: AssistantResponseMeta,
  ): { label: string; target: string; kind: MessageActionKind } | null {
    if (response.status === 'confirm') {
      return { label: 'Confirmer', target: 'oui confirme', kind: 'confirm' };
    }

    if (response.type === 'workflow' && response.status === 'failed') {
      return null;
    }

    const downloadUrl = this.extractDownloadUrl(response, meta);
    if (downloadUrl) {
      return { label: 'Ouvrir le document', target: downloadUrl, kind: 'link' };
    }

    if (response.type === 'ask') {
      return null;
    }

    const route = this.defaultRouteForIntent(meta.intent);
    if (!route) {
      return null;
    }

    const label = meta.action_result?.executed ? 'Voir la page' : 'Ouvrir';
    return { label, target: route, kind: 'route' };
  }

  private extractDownloadUrl(response: ChatApiResponse, meta: AssistantResponseMeta): string | null {
    const directUrl = meta.entities?.['download_url'];
    if (typeof directUrl === 'string' && directUrl.trim().length > 0) {
      return directUrl.trim();
    }

    const detailUrl = meta.action_result?.details?.['download_url'];
    if (typeof detailUrl === 'string' && detailUrl.trim().length > 0) {
      return detailUrl.trim();
    }

    const data = response.data && typeof response.data === 'object'
      ? response.data as Record<string, unknown>
      : null;
    const result = data?.['result'];
    if (result && typeof result === 'object') {
      const nested = (result as Record<string, unknown>)['download_url'];
      if (typeof nested === 'string' && nested.trim().length > 0) {
        return nested.trim();
      }
    }
    const payloadUrl = data?.['download_url'];
    return typeof payloadUrl === 'string' && payloadUrl.trim().length > 0 ? payloadUrl.trim() : null;
  }

  private extractWorkflow(response: ChatApiResponse, meta: AssistantResponseMeta): AssistantWorkflowState | null {
    if (meta.workflow) {
      return meta.workflow;
    }
    if (response.type !== 'workflow' && !Array.isArray(response.steps)) {
      return null;
    }

    return {
      workflow_id: null,
      name: response.action ?? response.intent ?? 'workflow',
      status: response.status ?? 'success',
      pending_step: null,
      completed_steps: Array.isArray(response.steps)
        ? response.steps
          .filter(step => step.status === 'success' || step.status === 'warning')
          .map(step => step.key)
        : [],
      can_retry: response.status === 'failed',
      steps: Array.isArray(response.steps) ? response.steps : [],
    };
  }

  workflowStatusLabel(workflow: AssistantWorkflowState | null | undefined): string {
    const status = workflow?.status;
    if (status === 'failed') {
      return 'Workflow interrompu';
    }
    if (status === 'success') {
      return 'Workflow termine';
    }
    return 'Workflow';
  }

  workflowStepIcon(status: string | undefined): string {
    switch (status) {
      case 'success':
        return 'check-circle-2';
      case 'warning':
        return 'triangle-alert';
      case 'failed':
        return 'circle-x';
      case 'running':
        return 'loader-2';
      default:
        return 'circle';
    }
  }

  private defaultRouteForIntent(intent?: string): string | null {
    switch (intent) {
      case 'CREATE_LEAVE':
      case 'GET_LEAVE_BALANCE':
      case 'GET_MY_REQUESTS':
        return '/app/employee/conges';
      case 'CREATE_AUTORISATION':
        return '/app/employee/autorisations';
      case 'CREATE_TELEWORK':
        return '/app/employee/teletravail';
      case 'REQUEST_DOCUMENT':
      case 'OPEN_DOCUMENT':
        return this.assistantRole() === 'RH' ? '/app/rh/documents' : '/app/employee/documents';
      case 'GET_NOTIFICATIONS':
        return '/app/notifications';
      case 'GET_TEAM_REQUESTS':
      case 'GET_PENDING_VALIDATIONS':
      case 'APPROVE_REQUEST':
      case 'REJECT_REQUEST':
        return '/app/manager/approbations';
      case 'GET_RH_STATS':
        return '/app/rh/dashboard';
      case 'GET_ALL_REQUESTS':
      case 'PROCESS_REQUEST':
        return '/app/rh/requests';
      default:
        return null;
    }
  }

  private openExternalLink(target: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  private scheduleAutoListen(delayMs: number): void {
    if (!this.handsFreeMode() || !this.isOpen() || this.loading() || this.voiceState() !== 'idle' || this.activeAudio) {
      return;
    }
    this.clearAutoListen();
    this.autoListenHandle = window.setTimeout(() => {
      this.autoListenHandle = null;
      if (!this.isOpen() || this.loading() || this.voiceState() !== 'idle' || this.input().trim().length > 0 || this.activeAudio) {
        return;
      }
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
    if (!this.activeAudio) {
      this.speaking.set(false);
      return;
    }
    this.activeAudio.pause();
    this.activeAudio.currentTime = 0;
    this.activeAudio = undefined;
    this.speaking.set(false);
  }

  private resolveRole(user: ReturnType<AuthService['currentUser']>): string | null {
    if (!user) {
      return null;
    }
    const primaryRole = typeof user.role === 'string' && user.role.trim().length > 0
      ? user.role.trim()
      : Array.isArray(user.roles) && user.roles.length > 0
        ? String(user.roles[0]).trim()
        : '';
    return primaryRole.length > 0 ? primaryRole.replace(/^ROLE_/i, '').toUpperCase() : null;
  }
}
