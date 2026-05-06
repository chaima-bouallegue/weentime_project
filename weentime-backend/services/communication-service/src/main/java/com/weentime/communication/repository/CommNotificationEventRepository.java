package com.weentime.communication.repository;

import com.weentime.communication.entity.CommNotificationEvent;
import com.weentime.communication.entity.NotificationEventStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommNotificationEventRepository extends JpaRepository<CommNotificationEvent, UUID> {

    Optional<CommNotificationEvent> findByNotificationEventId(String notificationEventId);

    long countByStatus(NotificationEventStatus status);

    List<CommNotificationEvent> findByNotificationEventIdIn(Collection<String> notificationEventIds);
}
