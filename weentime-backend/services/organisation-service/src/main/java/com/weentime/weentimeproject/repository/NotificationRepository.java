package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Notification;
import com.weentime.weentimeproject.enums.NotificationType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findTop50ByUser_IdOrderByCreatedAtDesc(Long userId);

    long countByUser_IdAndIsReadFalse(Long userId);

    Optional<Notification> findByIdAndUser_Id(Long id, Long userId);

    List<Notification> findByUser_IdAndIsReadFalse(Long userId);

    boolean existsByUser_IdAndTypeAndTitleAndCreatedAtBetween(
            Long userId,
            NotificationType type,
            String title,
            LocalDateTime start,
            LocalDateTime end
    );
}
