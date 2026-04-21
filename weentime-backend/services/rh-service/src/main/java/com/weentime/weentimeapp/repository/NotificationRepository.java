package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    /**
     * Notifications directes d'un utilisateur (destinataireId = userId).
     */
    List<Notification> findByDestinataireIdAndEntrepriseIdOrderByDateCreationDesc(
            Long destinataireId, Long entrepriseId);

    /**
     * Notifications broadcast d'un rôle.
     */
    List<Notification> findByDestinataireRoleAndEntrepriseIdOrderByDateCreationDesc(
            String destinataireRole, Long entrepriseId);

    /**
     * Nombre de notifications non lues (directes) pour un utilisateur.
     */
    long countByDestinataireIdAndLuFalseAndEntrepriseId(Long destinataireId, Long entrepriseId);

    /**
     * Marquer toutes les notifs d'un utilisateur comme lues.
     */
    @Modifying
    @Query("UPDATE Notification n SET n.lu = true WHERE n.destinataireId = :userId AND n.entrepriseId = :entrepriseId AND n.lu = false")
    void markAllAsReadForUser(@Param("userId") Long userId, @Param("entrepriseId") Long entrepriseId);

    /**
     * Supprimer toutes les notifs d'un utilisateur.
     */
    @Modifying
    void deleteByDestinataireIdAndEntrepriseId(Long destinataireId, Long entrepriseId);
}
