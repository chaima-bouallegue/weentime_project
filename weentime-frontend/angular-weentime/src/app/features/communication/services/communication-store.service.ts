import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '@app/core/services/auth.service';
import { EMPTY, Observable, of, Subscription } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
  ChannelModel,
  CommunicationBootstrapResponse,
  EventReplayResponse,
  MessageModel,
  ProvisioningSyncResponse,
  ReadMarkerResponse,
  SendMessageRequest,
  UnreadSummaryModel,
  UpdateMessageRequest
} from '../models/communication.models';
import {
  CommunicationSocketEvent,
  TypingEventPayload,
  WebSocketErrorPayload
} from '../models/websocket-events.models';
import { CommunicationApiService } from './communication-api.service';
import {
  CommunicationEventReducerService,
  CommunicationReducerState
} from './communication-event-reducer.service';
import { CommunicationConnectionState, CommunicationWebSocketService } from './communication-websocket.service';

@Injectable({
  providedIn: 'root'
})
export class CommunicationStoreService {
  private readonly api = inject(CommunicationApiService);
  private readonly websocket = inject(CommunicationWebSocketService);
  private readonly reducer = inject(CommunicationEventReducerService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly channels = signal<ChannelModel[]>([]);
  readonly activeChannelId = signal<string | null>(null);
  readonly activeChannelError = signal<string | null>(null);
  readonly messagesByChannel = signal<Record<string, MessageModel[]>>({});
  readonly loadingChannels = signal(false);
  readonly loadingMessages = signal(false);
  readonly channelsError = signal<string | null>(null);
  readonly messagesError = signal<string | null>(null);
  readonly typingByChannel = signal<Record<string, string | null>>({});
  readonly unreadCountsByChannel = signal<Record<string, number>>({});
  readonly totalUnread = signal(0);
  readonly websocketError = signal<string | null>(null);
  readonly syncInProgress = signal(false);
  readonly bootstrapInProgress = signal(false);
  readonly syncResult = signal<ProvisioningSyncResponse | null>(null);
  readonly syncError = signal<string | null>(null);
  readonly pendingReadRetryByChannel = signal<Record<string, string | null>>({});
  readonly lastEventId = signal<string | null>(null);

  readonly connectionState = this.websocket.connectionState;
  readonly activeChannel = computed(() => {
    const channelId = this.activeChannelId();
    return channelId ? this.channels().find(channel => channel.id === channelId) ?? null : null;
  });
  readonly activeMessages = computed(() => {
    const channelId = this.activeChannelId();
    return channelId ? this.messagesByChannel()[channelId] ?? [] : [];
  });
  readonly directMessages = computed(() => this.channels().filter(channel => channel.type === 'DIRECT' || channel.type === 'GROUP_DM'));
  readonly visibleChannels = computed(() => this.channels().filter(channel => channel.type !== 'DIRECT' && channel.type !== 'GROUP_DM'));
  readonly canSend = computed(() => this.activeChannel()?.permissions.canWrite ?? false);
  readonly typingLabel = computed(() => {
    const channelId = this.activeChannelId();
    return channelId ? this.typingByChannel()[channelId] ?? null : null;
  });
  readonly canSync = computed(() => this.authService.hasRole('ADMIN'));
  readonly readRetryPending = computed(() => {
    const channelId = this.activeChannelId();
    return channelId ? !!this.pendingReadRetryByChannel()[channelId] : false;
  });

  private subscribedChannelId: string | null = null;
  private loadingMessagesChannelId: string | null = null;
  private messageLoadSubscription: Subscription | null = null;
  private unreadBootstrapped = false;
  private previousConnectionState: CommunicationConnectionState = 'disconnected';
  private recovering = false;
  private readonly adminBootstrapSessions = new Set<string>();
  private readonly seenEventIds = new Set<string>();
  private readonly seenEventOrder: string[] = [];
  private readonly failedMessageLoads = new Set<string>();
  private activeSessionKey: string | null = null;

  constructor() {
    this.websocket.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => this.applySocketEvent(event));

    effect(() => {
      const state = this.connectionState();
      if (state === 'connected' && this.previousConnectionState !== 'connected' && this.unreadBootstrapped) {
        this.recoverAfterReconnect();
      }
      this.previousConnectionState = state;
    });

    effect(() => {
      const connectionError = this.websocket.connectionError();
      const state = this.connectionState();
      if (connectionError) {
        this.websocketError.set(connectionError);
        return;
      }
      if (state === 'connected') {
        this.websocketError.set(null);
      }
    });

    effect(() => {
      const user = this.authService.currentUser();
      const sessionKey = this.communicationSessionKey(user);
      if (this.activeSessionKey !== sessionKey) {
        this.resetWorkspaceState();
        this.activeSessionKey = sessionKey;
      }
      if (!user) {
        this.adminBootstrapSessions.clear();
        return;
      }
      if (!sessionKey) {
        this.channelsError.set('La messagerie necessite une entreprise affectee a votre compte.');
        return;
      }
      this.ensureAdminBootstrapOnce();
    });
  }

  bootstrapUnreadTracking(): void {
    if (!this.authService.getToken() || !this.hasTenantContext()) {
      return;
    }

    this.unreadBootstrapped = true;
    this.websocket.connect();
    this.loadUnreadSummary();
  }

  initialize(): void {
    if (!this.hasTenantContext()) {
      this.channelsError.set('La messagerie necessite une entreprise affectee a votre compte.');
      this.loadingChannels.set(false);
      this.loadingMessages.set(false);
      return;
    }
    this.bootstrapUnreadTracking();
    if (this.channels().length === 0 && !this.loadingChannels() && !this.bootstrapInProgress()) {
      if (this.ensureAdminBootstrapOnce()) {
        return;
      }
      this.loadChannels();
    }
  }

  clearActiveChannel(): void {
    const previousChannelId = this.activeChannelId();
    this.cancelMessageLoad();
    if (this.subscribedChannelId) {
      this.websocket.unsubscribeFromChannel(this.subscribedChannelId);
      this.subscribedChannelId = null;
    }
    this.activeChannelId.set(null);
    this.activeChannelError.set(null);
    this.messagesError.set(null);
    if (previousChannelId) {
      this.typingByChannel.update(state => ({ ...state, [previousChannelId]: null }));
    }
  }

  loadChannels(): void {
    if (!this.hasTenantContext()) {
      this.channelsError.set('La messagerie necessite une entreprise affectee a votre compte.');
      this.loadingChannels.set(false);
      return;
    }
    this.loadingChannels.set(true);
    this.channelsError.set(null);
    this.api.getChannels()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          this.channelsError.set(this.toMessage(error, 'Impossible de charger les conversations.'));
          this.loadingChannels.set(false);
          return EMPTY;
        })
      )
      .subscribe(channels => {
        const nextChannels = this.sortChannels(channels.map(channel => this.mergeUnreadCount(channel)));
        this.channels.set(nextChannels);
        this.reconcileActiveChannel(nextChannels);
        this.loadingChannels.set(false);
      });
  }

  loadUnreadSummary(): void {
    if (!this.hasTenantContext()) {
      return;
    }
    this.api.getUnreadSummary()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => EMPTY)
      )
      .subscribe(summary => this.applyUnreadSummary(summary));
  }

  selectChannel(channelId: string): void {
    if (!this.hasTenantContext()) {
      this.activeChannelError.set('La messagerie necessite une entreprise affectee a votre compte.');
      return;
    }
    const alreadyActive = this.activeChannelId() === channelId;
    if (!alreadyActive) {
      this.cancelMessageLoad();
    }
    if (this.subscribedChannelId && this.subscribedChannelId !== channelId) {
      this.websocket.unsubscribeFromChannel(this.subscribedChannelId);
    }

    this.subscribedChannelId = channelId;
    this.activeChannelId.set(channelId);
    this.activeChannelError.set(null);
    this.messagesError.set(null);
    this.websocket.subscribeToChannel(channelId);
    if (!alreadyActive) {
      this.refreshChannel(channelId);
    }
    this.loadMessages(channelId);
  }

  openDirect(userId: number): Observable<ChannelModel> {
    return this.api.openDirectMessage(userId).pipe(
      tap(channel => {
        this.mergeChannel(channel);
        this.selectChannel(channel.id);
      })
    );
  }

  retryLoadMessages(): void {
    const channelId = this.activeChannelId();
    if (channelId) {
      this.loadMessages(channelId, { force: true });
    }
  }

  retryActiveChannel(): void {
    const channelId = this.activeChannelId();
    if (!channelId) {
      return;
    }
    this.refreshChannel(channelId);
    this.loadMessages(channelId, { force: true });
    this.retryPendingRead(channelId);
  }

  sendMessage(body: string): void {
    const channel = this.activeChannel();
    if (!channel || !this.canSend()) {
      return;
    }

    const request = this.buildSendMessageRequest(body);
    const optimistic = this.buildOptimisticMessage(channel.id, request);
    this.upsertMessage(channel.id, optimistic);
    this.bumpChannelWithMessage(channel.id, optimistic, false);

    this.api.sendMessage(channel.id, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          this.markMessageFailed(channel.id, optimistic.clientMessageId ?? optimistic.id,
            this.toMessage(error, 'Envoi impossible.'));
          return EMPTY;
        })
      )
      .subscribe(message => {
        this.upsertMessage(channel.id, message);
        this.bumpChannelWithMessage(channel.id, message, false);
        this.setUnreadCount(channel.id, 0);
      });
  }

  updateMessage(message: MessageModel, body: string): void {
    const payload: UpdateMessageRequest = {
      body: body.trim(),
      richBody: message.richBody,
      reason: null
    };
    this.api.updateMessage(message.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          this.messagesError.set(this.toMessage(error, 'Modification impossible.'));
          return EMPTY;
        })
      )
      .subscribe(updated => {
        this.upsertMessage(updated.channelId, updated);
        this.bumpChannelWithMessage(updated.channelId, updated, false);
      });
  }

  deleteMessage(message: MessageModel): void {
    this.api.deleteMessage(message.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          this.messagesError.set(this.toMessage(error, 'Suppression impossible.'));
          return EMPTY;
        })
      )
      .subscribe(updated => {
        this.upsertMessage(updated.channelId, updated);
        this.bumpChannelWithMessage(updated.channelId, updated, false);
      });
  }

  retryMessage(message: MessageModel): void {
    const channelId = this.activeChannelId();
    if (!channelId || !message.body) {
      return;
    }

    const request: SendMessageRequest = {
      clientMessageId: message.clientMessageId ?? this.createClientMessageId(),
      type: message.type || 'TEXT',
      body: message.body,
      richBody: message.richBody,
      parentMessageId: message.parentMessageId,
      metadata: {}
    };

    this.upsertMessage(channelId, {
      ...message,
      clientMessageId: request.clientMessageId,
      localState: 'sending',
      localError: null
    });

    this.api.sendMessage(channelId, request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          this.markMessageFailed(channelId, request.clientMessageId,
            this.toMessage(error, 'Nouvelle tentative echouee.'));
          return EMPTY;
        })
      )
      .subscribe(response => {
        this.upsertMessage(channelId, response);
        this.bumpChannelWithMessage(channelId, response, false);
      });
  }

  removeFailedMessage(message: MessageModel): void {
    const channelId = this.activeChannelId();
    if (!channelId) {
      return;
    }
    this.messagesByChannel.update(state => ({
      ...state,
      [channelId]: (state[channelId] ?? []).filter(item => item.id !== message.id && item.clientMessageId !== message.clientMessageId)
    }));
  }

  toggleReaction(message: MessageModel, emoji: string): void {
    const channel = this.channels().find(item => item.id === message.channelId);
    if (!this.hasTenantContext() || !channel?.permissions.canRead) {
      this.messagesError.set('Reaction impossible: acces au canal non confirme.');
      return;
    }

    const request$ = message.reactions.some(reaction => reaction.emoji === emoji && reaction.reactedByMe)
      ? this.api.removeReaction(message.id, emoji)
      : this.api.addReaction(message.id, emoji);

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => EMPTY)
      )
      .subscribe(updated => {
        this.upsertMessage(updated.channelId, updated);
        this.bumpChannelWithMessage(updated.channelId, updated, false);
      });
  }

  publishTyping(typing: boolean): void {
    const channelId = this.activeChannelId();
    if (channelId) {
      this.websocket.publishTyping(channelId, typing);
    }
  }

  runCommunicationSync(): void {
    if (!this.canSync() || this.syncInProgress()) {
      return;
    }

    this.syncInProgress.set(true);
    this.syncError.set(null);
    this.api.syncCommunication(this.authService.currentUser()?.entrepriseId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          this.syncError.set(this.toMessage(error, 'Synchronisation impossible.'));
          this.syncInProgress.set(false);
          return EMPTY;
        })
      )
      .subscribe(result => {
        this.syncResult.set(result);
        this.syncInProgress.set(false);
        this.loadChannels();
        this.loadUnreadSummary();
      });
  }

  private ensureAdminBootstrapOnce(): boolean {
    const user = this.authService.currentUser();
    if (!this.isAdminUser(user) || !user?.id || !user.entrepriseId) {
      return false;
    }

    const sessionKey = `${user.id}:${user.entrepriseId}`;
    if (this.adminBootstrapSessions.has(sessionKey) || this.bootstrapInProgress()) {
      return this.bootstrapInProgress();
    }

    this.adminBootstrapSessions.add(sessionKey);
    this.runAdminBootstrap();
    return true;
  }

  private runAdminBootstrap(): void {
    this.bootstrapInProgress.set(true);
    this.api.bootstrapCommunication()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          console.error('[communication-bootstrap] admin bootstrap failed', error);
          this.bootstrapInProgress.set(false);
          if (this.channels().length === 0 && !this.loadingChannels()) {
            this.loadChannels();
          }
          return EMPTY;
        })
      )
      .subscribe(result => {
        this.handleBootstrapSuccess(result);
      });
  }

  private refreshChannel(channelId: string): void {
    this.api.getChannel(channelId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          if (this.activeChannelId() === channelId) {
            this.activeChannelError.set(this.toMessage(error, 'Acces au canal refuse.'));
          }
          return EMPTY;
        })
      )
      .subscribe(channel => {
        this.activeChannelError.set(null);
        this.mergeChannel(channel);
      });
  }

  private reconcileActiveChannel(channels: ChannelModel[]): void {
    const channelId = this.activeChannelId();
    if (!channelId || channels.some(channel => channel.id === channelId)) {
      return;
    }

    this.cancelMessageLoad();
    if (this.subscribedChannelId === channelId) {
      this.websocket.unsubscribeFromChannel(channelId);
      this.subscribedChannelId = null;
    }
    this.activeChannelError.set('Conversation introuvable ou non autorisee.');
    this.messagesError.set('Conversation introuvable ou non autorisee.');
  }

  private loadMessages(channelId: string, options: { force?: boolean } = {}): void {
    if (!options.force && this.loadingMessagesChannelId === channelId) {
      return;
    }
    if (!options.force && this.failedMessageLoads.has(channelId)) {
      return;
    }
    if (!options.force && this.messagesByChannel()[channelId] !== undefined) {
      return;
    }

    this.messageLoadSubscription?.unsubscribe();
    this.loadingMessagesChannelId = channelId;
    this.loadingMessages.set(true);
    this.messagesError.set(null);
    this.messageLoadSubscription = this.api.getMessages(channelId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          const message = this.toMessage(error, 'Impossible de charger les messages.');
          if (this.activeChannelId() === channelId) {
            this.messagesError.set(message);
            this.activeChannelError.set(message);
            this.loadingMessages.set(false);
          }
          this.failedMessageLoads.add(channelId);
          this.loadingMessagesChannelId = null;
          return of(null);
        })
      )
      .subscribe(page => {
        if (!page) {
          return;
        }
        this.failedMessageLoads.delete(channelId);
        this.messagesByChannel.update(state => ({ ...state, [channelId]: page.items }));
        if (this.activeChannelId() === channelId) {
          this.loadingMessages.set(false);
          this.activeChannelError.set(null);
          this.messagesError.set(null);
        }
        this.loadingMessagesChannelId = null;
        const latest = page.items[page.items.length - 1];
        if (latest) {
          this.markChannelRead(channelId, latest.id);
        }
      });
  }

  private handleBootstrapSuccess(result: CommunicationBootstrapResponse): void {
    console.debug('[communication-bootstrap] completed', result);
    this.bootstrapInProgress.set(false);
    this.loadChannels();
    this.loadUnreadSummary();
  }

  private markChannelRead(channelId: string, messageId?: string | null): void {
    this.api.markChannelRead(channelId, messageId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => {
          this.pendingReadRetryByChannel.update(state => ({ ...state, [channelId]: messageId ?? null }));
          return EMPTY;
        })
      )
      .subscribe(response => this.applyReadMarker(response));
  }

  private retryPendingRead(channelId: string): void {
    const pendingMessageId = this.pendingReadRetryByChannel()[channelId];
    if (pendingMessageId != null) {
      this.markChannelRead(channelId, pendingMessageId);
    }
  }

  private recoverAfterReconnect(): void {
    if (this.recovering) {
      return;
    }

    this.recovering = true;
    this.websocketError.set(null);
    const activeChannelId = this.activeChannelId();
    const replayCursor = this.lastEventId();
    const replay$ = replayCursor ? this.api.replayEvents(replayCursor) : of(null as EventReplayResponse | null);

    replay$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(error => {
          this.websocketError.set(this.toMessage(error, 'Reprise des evenements impossible, rechargement local en cours.'));
          this.fullReconnectResync(activeChannelId);
          this.recovering = false;
          return EMPTY;
        })
      )
      .subscribe(response => {
        if (response?.reloadRequired) {
          this.websocketError.set('Historique temps reel indisponible, rechargement de la conversation.');
          this.fullReconnectResync(activeChannelId);
          this.recovering = false;
          return;
        }

        response?.events.forEach(event => this.applySocketEvent(event));
        if (response?.lastEventId) {
          this.rememberEventId(response.lastEventId);
        }

        this.loadUnreadSummary();
        if (activeChannelId) {
          this.refreshChannel(activeChannelId);
          this.resyncMessagesAfterReconnect(activeChannelId);
          this.retryPendingRead(activeChannelId);
        }
        this.recovering = false;
      });
  }

  private fullReconnectResync(activeChannelId: string | null): void {
    this.loadChannels();
    this.loadUnreadSummary();
    if (activeChannelId) {
      this.refreshChannel(activeChannelId);
      this.resyncMessagesAfterReconnect(activeChannelId);
      this.retryPendingRead(activeChannelId);
    }
  }

  private resyncMessagesAfterReconnect(channelId: string | null): void {
    if (!channelId || this.failedMessageLoads.has(channelId)) {
      return;
    }
    this.loadMessages(channelId, { force: true });
  }

  private cancelMessageLoad(): void {
    this.messageLoadSubscription?.unsubscribe();
    this.messageLoadSubscription = null;
    this.loadingMessagesChannelId = null;
    this.loadingMessages.set(false);
  }

  private resetWorkspaceState(): void {
    this.cancelMessageLoad();
    if (this.subscribedChannelId) {
      this.websocket.unsubscribeFromChannel(this.subscribedChannelId);
      this.subscribedChannelId = null;
    }
    this.websocket.disconnect();
    this.channels.set([]);
    this.activeChannelId.set(null);
    this.activeChannelError.set(null);
    this.messagesByChannel.set({});
    this.loadingChannels.set(false);
    this.loadingMessages.set(false);
    this.channelsError.set(null);
    this.messagesError.set(null);
    this.typingByChannel.set({});
    this.unreadCountsByChannel.set({});
    this.totalUnread.set(0);
    this.websocketError.set(null);
    this.syncInProgress.set(false);
    this.bootstrapInProgress.set(false);
    this.syncResult.set(null);
    this.syncError.set(null);
    this.pendingReadRetryByChannel.set({});
    this.lastEventId.set(null);
    this.unreadBootstrapped = false;
    this.previousConnectionState = 'disconnected';
    this.recovering = false;
    this.seenEventIds.clear();
    this.seenEventOrder.length = 0;
    this.failedMessageLoads.clear();
  }

  private applySocketEvent(event: CommunicationSocketEvent): void {
    if (!this.rememberEventId(event.eventId)) {
      return;
    }

    switch (event.type) {
      case 'typing.started':
        this.handleTypingStarted(event.data as TypingEventPayload);
        return;
      case 'typing.stopped':
        this.handleTypingStopped(event.data as TypingEventPayload);
        return;
      case 'error':
        this.handleWebSocketError(event.data as WebSocketErrorPayload);
        return;
      default:
        break;
    }

    const reduced = this.reducer.reduce(this.snapshotReducerState(), event, this.currentUserId());
    this.applyReducerState(reduced);

    if (event.type === 'message.created') {
      const message = event.data as MessageModel;
      const isActive = this.activeChannelId() === message.channelId;
      if (isActive && message.sender.id !== this.currentUserId()) {
        this.markChannelRead(message.channelId, message.id);
      }
    }
  }

  private handleTypingStarted(event: TypingEventPayload): void {
    if (event.userId === this.currentUserId()) {
      return;
    }
    this.typingByChannel.update(state => ({ ...state, [event.channelId]: event.fullName }));
  }

  private handleTypingStopped(event: TypingEventPayload): void {
    this.typingByChannel.update(state => ({ ...state, [event.channelId]: null }));
  }

  private handleWebSocketError(event: WebSocketErrorPayload): void {
    this.websocketError.set(event.message || 'Une erreur websocket est survenue.');
  }

  private applyReadMarker(response: ReadMarkerResponse): void {
    this.pendingReadRetryByChannel.update(state => ({
      ...state,
      [response.channelId]: null
    }));
    this.setUnreadCount(response.channelId, 0);
  }

  private applyUnreadSummary(summary: UnreadSummaryModel): void {
    const reduced = this.reducer.reduce(this.snapshotReducerState(), {
      eventId: this.lastEventId() ?? 'local-unread-summary',
      type: 'unread.updated',
      entrepriseId: this.authService.currentUser()?.entrepriseId ?? null,
      channelId: null,
      actorId: null,
      data: summary,
      createdAt: new Date().toISOString()
    }, this.currentUserId());
    this.applyReducerState(reduced);
  }

  private mergeChannel(channel: ChannelModel): void {
    const mergedChannel = this.mergeUnreadCount(channel);
    this.channels.update(channels => this.sortChannels([
      ...channels.filter(existing => existing.id !== mergedChannel.id),
      mergedChannel
    ]));
  }

  private mergeUnreadCount(channel: ChannelModel): ChannelModel {
    const unreadMap = this.unreadCountsByChannel();
    return {
      ...channel,
      unreadCount: unreadMap[channel.id] ?? channel.unreadCount
    };
  }

  private bumpChannelWithMessage(channelId: string, message: MessageModel, incrementUnread: boolean): void {
    if (incrementUnread) {
      const currentUnread = this.unreadCountsByChannel()[channelId] ?? this.channels().find(channel => channel.id === channelId)?.unreadCount ?? 0;
      this.setUnreadCount(channelId, currentUnread + 1);
    }

    this.channels.update(channels => this.sortChannels(channels.map(channel => {
      if (channel.id !== channelId) {
        return channel;
      }
      const nextLastMessage = this.shouldPromoteLastMessage(channel.lastMessage, message)
        ? message
        : channel.lastMessage;
      return {
        ...channel,
        lastMessage: nextLastMessage,
        unreadCount: this.unreadCountsByChannel()[channelId] ?? channel.unreadCount
      };
    })));
  }

  private setUnreadCount(channelId: string, unreadCount: number): void {
    const nextUnreadMap = {
      ...this.unreadCountsByChannel(),
      [channelId]: Math.max(0, unreadCount)
    };
    this.unreadCountsByChannel.set(nextUnreadMap);
    this.totalUnread.set(Object.values(nextUnreadMap).reduce((total, value) => total + value, 0));
    this.channels.update(channels => channels.map(channel => channel.id === channelId
      ? { ...channel, unreadCount: nextUnreadMap[channelId] ?? 0 }
      : channel));
  }

  private upsertMessage(channelId: string, message: MessageModel): void {
    this.messagesByChannel.update(state => {
      const current = [...(state[channelId] ?? [])];
      const matchIndex = current.findIndex(item =>
        item.id === message.id
        || (!!message.clientMessageId && item.clientMessageId === message.clientMessageId)
      );

      const normalized: MessageModel = {
        ...message,
        localState: undefined,
        localError: null
      };

      if (matchIndex >= 0) {
        current[matchIndex] = { ...current[matchIndex], ...normalized };
      } else {
        current.push(normalized);
      }

      current.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
      return { ...state, [channelId]: current };
    });
  }

  private markMessageFailed(channelId: string, clientMessageId: string, error: string): void {
    this.messagesByChannel.update(state => ({
      ...state,
      [channelId]: (state[channelId] ?? []).map(message => message.clientMessageId === clientMessageId
        ? { ...message, localState: 'failed', localError: error }
        : message)
    }));
  }

  private buildSendMessageRequest(body: string): SendMessageRequest {
    return {
      clientMessageId: this.createClientMessageId(),
      type: 'TEXT',
      body: body.trim(),
      richBody: null,
      parentMessageId: null,
      mentions: [],
      metadata: {}
    };
  }

  private buildOptimisticMessage(channelId: string, request: SendMessageRequest): MessageModel {
    const user = this.authService.currentUser();
    const fullName = `${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim() || user?.email || 'Utilisateur';
    const role = user?.role || user?.roles?.[0] || 'EMPLOYEE';
    return {
      id: request.clientMessageId,
      channelId,
      entrepriseId: user?.entrepriseId ?? 0,
      sender: {
        id: user?.id ?? null,
        fullName,
        role,
        avatarUrl: user?.photo ?? null
      },
      type: request.type,
      body: request.body,
      richBody: request.richBody ?? null,
      parentMessageId: request.parentMessageId ?? null,
      thread: null,
      reactions: [],
      status: 'ACTIVE',
      clientMessageId: request.clientMessageId,
      createdAt: new Date().toISOString(),
      editedAt: null,
      localState: 'sending',
      localError: null
    };
  }

  private createClientMessageId(): string {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    return randomUuid ?? `comm-${Date.now()}-${Math.round(Math.random() * 100000)}`;
  }

  private sortChannels(channels: ChannelModel[]): ChannelModel[] {
    return [...channels].sort((left, right) => {
      const rightDate = right.lastMessage?.createdAt ?? right.updatedAt;
      const leftDate = left.lastMessage?.createdAt ?? left.updatedAt;
      return new Date(rightDate).getTime() - new Date(leftDate).getTime();
    });
  }

  private snapshotReducerState(): CommunicationReducerState {
    return {
      channels: this.channels(),
      messagesByChannel: this.messagesByChannel(),
      unreadCountsByChannel: this.unreadCountsByChannel(),
      totalUnread: this.totalUnread()
    };
  }

  private applyReducerState(state: CommunicationReducerState): void {
    this.channels.set(this.sortChannels(state.channels));
    this.messagesByChannel.set(state.messagesByChannel);
    this.unreadCountsByChannel.set(state.unreadCountsByChannel);
    this.totalUnread.set(state.totalUnread);
  }

  private rememberEventId(eventId: string | null | undefined): boolean {
    if (!eventId) {
      return true;
    }
    if (this.seenEventIds.has(eventId)) {
      return false;
    }
    this.seenEventIds.add(eventId);
    this.seenEventOrder.push(eventId);
    if (this.seenEventOrder.length > 1000) {
      const removed = this.seenEventOrder.shift();
      if (removed) {
        this.seenEventIds.delete(removed);
      }
    }
    this.lastEventId.set(eventId);
    return true;
  }

  private currentUserId(): number | null {
    return this.authService.currentUser()?.id ?? null;
  }

  private hasTenantContext(): boolean {
    return this.communicationSessionKey(this.authService.currentUser()) !== null;
  }

  private communicationSessionKey(user: ReturnType<AuthService['currentUser']>): string | null {
    if (!user?.id || !Number.isFinite(user.entrepriseId)) {
      return null;
    }
    return `${user.id}:${user.entrepriseId}`;
  }

  private isAdminUser(user: ReturnType<AuthService['currentUser']>): boolean {
    if (!user) {
      return false;
    }
    return user.role === 'ADMIN' || user.roles?.includes('ADMIN') === true;
  }

  private shouldPromoteLastMessage(currentLastMessage: MessageModel | null, candidate: MessageModel): boolean {
    if (!currentLastMessage) {
      return true;
    }
    if (currentLastMessage.id === candidate.id) {
      return true;
    }
    return new Date(candidate.createdAt).getTime() >= new Date(currentLastMessage.createdAt).getTime();
  }

  private toMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
