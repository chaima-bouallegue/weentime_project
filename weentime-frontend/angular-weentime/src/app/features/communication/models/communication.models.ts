import { ChannelPermissionModel } from './permission.models';

export interface ApiErrorModel {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  warnings: string[];
  error: ApiErrorModel | null;
}

export interface SenderSummaryModel {
  id: number | null;
  fullName: string;
  role: string;
  avatarUrl: string | null;
}

export interface ReactionSummaryModel {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

export interface MessageThreadSummaryModel {
  replyCount: number;
  lastReplyAt: string | null;
}

export interface MessageModel {
  id: string;
  channelId: string;
  entrepriseId: number;
  sender: SenderSummaryModel;
  type: string;
  body: string | null;
  richBody: string | null;
  parentMessageId: string | null;
  thread: MessageThreadSummaryModel | null;
  reactions: ReactionSummaryModel[];
  status: string;
  clientMessageId: string | null;
  createdAt: string;
  editedAt: string | null;
  localState?: 'sending' | 'failed';
  localError?: string | null;
}

export interface ChannelModel {
  id: string;
  entrepriseId: number;
  type: string;
  visibility: string;
  slug: string | null;
  name: string;
  description: string | null;
  equipeId: number | null;
  workflowType: string | null;
  workflowEntityType: string | null;
  workflowEntityId: string | null;
  isPrivate: boolean;
  isArchived: boolean;
  memberCount: number;
  unreadCount: number;
  lastMessage: MessageModel | null;
  permissions: ChannelPermissionModel;
  createdAt: string;
  updatedAt: string;
}

export interface CursorMessagePageResponse {
  items: MessageModel[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CreateChannelRequest {
  type: string;
  name: string;
  description?: string | null;
  visibility?: string | null;
  slug?: string | null;
  isPrivate?: boolean;
  equipeId?: number | null;
  memberIds?: number[];
}

export interface OpenDirectRequest {
  userId: number;
}

export interface SendMessageRequest {
  clientMessageId: string;
  type: string;
  body: string;
  richBody?: string | null;
  parentMessageId?: string | null;
  mentions?: number[];
  metadata?: Record<string, unknown>;
}

export interface UpdateMessageRequest {
  body: string;
  richBody?: string | null;
  reason?: string | null;
}

export interface ReadMarkerResponse {
  channelId: string;
  messageId: string | null;
  readAt: string;
}

export interface MarkChannelReadRequest {
  messageId?: string | null;
}

export interface UnreadChannelSummaryModel {
  channelId: string;
  unreadCount: number;
}

export interface UnreadSummaryModel {
  totalUnread: number;
  channels: UnreadChannelSummaryModel[];
}

export interface EventReplayResponse {
  events: import('./websocket-events.models').CommunicationSocketEvent[];
  reloadRequired: boolean;
  reloadReason: string | null;
  lastEventId: string | null;
}

export interface ProvisioningSyncResponse {
  entrepriseId: number;
  channelsCreated: number;
  channelsUpdated: number;
  channelsArchived: number;
  membersAdded: number;
  membersRemoved: number;
  warnings: string[];
}

export interface CommunicationBootstrapResponse {
  entrepriseId: number;
  createdChannels: number;
  membershipsCreated: number;
  repairedUsers: number;
  warnings: string[];
}
