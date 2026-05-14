package com.weentime.communication.dto;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RealtimeNotificationPayloadTest {

    @Test
    void mentionNotificationPayloadCarriesTenantRecipientAndActionCategory() {
        UUID channelId = UUID.randomUUID();
        UUID messageId = UUID.randomUUID();

        RealtimeNotificationPayload payload = RealtimeNotificationPayload.builder()
                .notificationEventId("77:42:communication.mention.created:" + messageId)
                .recipientId(42L)
                .entrepriseId(77L)
                .eventType(NotificationEventTypes.COMMUNICATION_MENTION_CREATED)
                .category(NotificationCategory.ACTION_REQUIRED.name())
                .title("Amina vous a mentionne")
                .message("Amina vous a mentionne: merci de verifier")
                .actionUrl("/app/messages/channel/" + channelId)
                .channelId(channelId)
                .messageId(messageId)
                .metadata(Map.of(
                        "eventType", NotificationEventTypes.COMMUNICATION_MENTION_CREATED,
                        "category", NotificationCategory.ACTION_REQUIRED.name()
                ))
                .createdAt(Instant.parse("2026-05-14T10:15:30Z"))
                .build();

        assertThat(payload.entrepriseId()).isEqualTo(77L);
        assertThat(payload.recipientId()).isEqualTo(42L);
        assertThat(payload.eventType()).isEqualTo(NotificationEventTypes.COMMUNICATION_MENTION_CREATED);
        assertThat(payload.category()).isEqualTo(NotificationCategory.ACTION_REQUIRED.name());
        assertThat(payload.metadata()).containsEntry("category", NotificationCategory.ACTION_REQUIRED.name());
    }
}
