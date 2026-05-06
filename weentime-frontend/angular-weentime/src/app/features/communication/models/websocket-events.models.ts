import { MessageModel, UnreadSummaryModel } from './communication.models';

export type CommunicationEventType =
  | 'message.created'
  | 'message.updated'
  | 'message.deleted'
  | 'reaction.added'
  | 'reaction.removed'
  | 'read.updated'
  | 'typing.started'
  | 'typing.stopped'
  | 'unread.updated'
  | 'error';

export interface TypingEventPayload {
  channelId: string;
  userId: number;
  fullName: string;
}

export interface ReadReceiptEventPayload {
  channelId: string;
  messageId: string | null;
  userId: number;
  readAt: string;
}

export interface ReactionEventPayload {
  messageId: string;
  emoji: string;
  message: MessageModel;
}

export interface WebSocketErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown> | null;
}

export interface CommunicationSocketEvent<T = unknown> {
  eventId: string;
  type: CommunicationEventType;
  entrepriseId: number | null;
  channelId: string | null;
  actorId: number | null;
  data: T;
  createdAt: string;
}

export type CommunicationRealtimePayload =
  | MessageModel
  | ReactionEventPayload
  | TypingEventPayload
  | ReadReceiptEventPayload
  | UnreadSummaryModel
  | WebSocketErrorPayload;
