package com.weentime.communication.repository;

import com.weentime.communication.entity.CommUserNotificationPreference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CommUserNotificationPreferenceRepository extends JpaRepository<CommUserNotificationPreference, UUID> {

    Optional<CommUserNotificationPreference> findByEntrepriseIdAndUserId(Long entrepriseId, Long userId);
}
