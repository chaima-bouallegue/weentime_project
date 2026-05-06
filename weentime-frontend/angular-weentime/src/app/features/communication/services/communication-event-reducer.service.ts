import { Injectable } from '@angular/core';
import {
  ChannelModel,
  MessageModel,
  UnreadSummaryModel
} from '../models/communication.models';
import {
  CommunicationSocketEvent,
  ReadReceiptEventPayload,
  ReactionEventPayload
} from '../models/websocket-events.models';

export interface CommunicationReducerState {
  channels: ChannelModel[];
  messagesByChannel: Record<string, MessageModel[]>;
  unreadCountsByChannel: Record<string, number>;
  totalUnread: number;
}

@Injectable({
  providedIn: 'root'
})
export class CommunicationEventReducerService {
  reduce(
    state: CommunicationReducerState,
    event: CommunicationSocketEvent,
    currentUserId: number | null
  ): CommunicationReducerState {
    switch (event.type) {
      case 'message.created':
      case 'message.updated':
      case 'message.deleted':
        return this.applyMessageEvent(state, event.data as MessageModel);
      case 'reaction.added':
      case 'reaction.removed':
        return this.applyReactionEvent(state, event.data as ReactionEventPayload);
      case 'unread.updated':
        return this.applyUnreadSummary(state, event.data as UnreadSummaryModel);
      case 'read.updated':
        return this.applyReadUpdated(state, event.data as ReadReceiptEventPayload, currentUserId);
      case 'typing.started':
      case 'typing.stopped':
      case 'error':
      default:
        return state;
    }
  }

  private applyMessageEvent(state: CommunicationReducerState, message: MessageModel): CommunicationReducerState {
    const messagesByChannel = {
      ...state.messagesByChannel,
      [message.channelId]: this.upsertMessage(state.messagesByChannel[message.channelId] ?? [], message)
    };

    const channels = this.sortChannels(state.channels.map(channel => {
      if (channel.id !== message.channelId) {
        return channel;
      }
      const nextLastMessage = this.shouldPromoteLastMessage(channel.lastMessage, message)
        ? message
        : channel.lastMessage;
      return {
        ...channel,
        lastMessage: nextLastMessage,
        updatedAt: nextLastMessage?.editedAt ?? nextLastMessage?.createdAt ?? channel.updatedAt
      };
    }));

    return {
      ...state,
      channels,
      messagesByChannel
    };
  }

  private applyReactionEvent(state: CommunicationReducerState, payload: ReactionEventPayload): CommunicationReducerState {
    return this.applyMessageEvent(state, payload.message);
  }

  private applyUnreadSummary(state: CommunicationReducerState, summary: UnreadSummaryModel): CommunicationReducerState {
    const unreadCountsByChannel = summary.channels.reduce<Record<string, number>>((accumulator, channel) => {
      accumulator[channel.channelId] = channel.unreadCount;
      return accumulator;
    }, {});

    const channels = state.channels.map(channel => ({
      ...channel,
      unreadCount: unreadCountsByChannel[channel.id] ?? 0
    }));

    return {
      ...state,
      channels,
      unreadCountsByChannel,
      totalUnread: summary.totalUnread
    };
  }

  private applyReadUpdated(
    state: CommunicationReducerState,
    payload: ReadReceiptEventPayload,
    currentUserId: number | null
  ): CommunicationReducerState {
    if (payload.userId !== currentUserId) {
      return state;
    }

    const unreadCountsByChannel = {
      ...state.unreadCountsByChannel,
      [payload.channelId]: 0
    };
    const channels = state.channels.map(channel => channel.id === payload.channelId
      ? { ...channel, unreadCount: 0 }
      : channel);

    return {
      ...state,
      channels,
      unreadCountsByChannel,
      totalUnread: Object.values(unreadCountsByChannel).reduce((total, value) => total + value, 0)
    };
  }

  private upsertMessage(messages: MessageModel[], message: MessageModel): MessageModel[] {
    const next = [...messages];
    const existingIndex = next.findIndex(item =>
      item.id === message.id || (!!message.clientMessageId && item.clientMessageId === message.clientMessageId)
    );

    const normalized: MessageModel = {
      ...message,
      localState: undefined,
      localError: null
    };

    if (existingIndex >= 0) {
      next[existingIndex] = { ...next[existingIndex], ...normalized };
    } else {
      next.push(normalized);
    }

    next.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    return next;
  }

  private sortChannels(channels: ChannelModel[]): ChannelModel[] {
    return [...channels].sort((left, right) => {
      const rightDate = right.lastMessage?.createdAt ?? right.updatedAt;
      const leftDate = left.lastMessage?.createdAt ?? left.updatedAt;
      return new Date(rightDate).getTime() - new Date(leftDate).getTime();
    });
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
}
