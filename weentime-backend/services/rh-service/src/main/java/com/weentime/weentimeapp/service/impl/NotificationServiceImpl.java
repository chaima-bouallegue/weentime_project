package com.weentime.weentimeapp.service.impl;

import com.weentime.weentimeapp.dto.NotificationDTO;
import com.weentime.weentimeapp.entity.Notification;
import com.weentime.weentimeapp.mapper.NotificationMapper;
import com.weentime.weentimeapp.repository.NotificationRepository;
import com.weentime.weentimeapp.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class NotificationServiceImpl implements NotificationService {

    private final NotificationRepository notificationRepository;
    private final NotificationMapper notificationMapper;

    @Override
    @Transactional(readOnly = true)
    public List<NotificationDTO> getMesNotifications(Long userId, Long entrepriseId, List<String> roles) {
        List<Notification> allNotifs = new ArrayList<>();

        // 1. Notifications spécifiques à l'utilisateur
        allNotifs.addAll(notificationRepository.findByDestinataireIdAndEntrepriseIdOrderByDateCreationDesc(userId, entrepriseId));

        // 2. Notifications de rôle
        if (roles != null) {
            for (String role : roles) {
                // Remove ROLE_ prefix if needed by how it's saved vs requested, 
                // but usually it's saved as "ROLE_RH" in DB. Let's assume it matches.
                allNotifs.addAll(notificationRepository.findByDestinataireRoleAndEntrepriseIdOrderByDateCreationDesc(role, entrepriseId));
            }
        }

        // Trier globalement par date desc
        allNotifs.sort(Comparator.comparing(Notification::getDateCreation).reversed());

        return notificationMapper.toDtoList(allNotifs);
    }

    @Override
    @Transactional(readOnly = true)
    public long countNonLues(Long userId, Long entrepriseId) {
        return notificationRepository.countByDestinataireIdAndLuFalseAndEntrepriseId(userId, entrepriseId);
    }

    @Override
    public void marquerCommeLue(Long notificationId, Long userId, Long entrepriseId) {
        notificationRepository.findById(notificationId).ifPresent(notif -> {
            // Un utilisateur peut mark-as-read ses notifs directes (destinataireId == userId)
            // ou les notifs de rôle qu'il a reçues. Pour simplifier, si destinataireId est présent 
            // et != userId, on rejette.
            if (notif.getDestinataireId() != null && !notif.getDestinataireId().equals(userId)) {
                return;
            }
            if (notif.getEntrepriseId().equals(entrepriseId)) {
                notif.setLu(true);
                notificationRepository.save(notif);
            }
        });
    }

    @Override
    public void toutMarquerCommeLu(Long userId, Long entrepriseId) {
        // En theorie on devrait aussi lier lu=true pour les notifs de role, 
        // mais c'est complexe car on partage 1 seule ligne de DB pour tout le role ?
        // ATTENTION : dans AsyncNotificationService.sendToRole, on itère sur les users => on sauvegarde 
        // 1 ligne PAR user avec destinataireId = uid. Donc les notifs de rôle ont BIEN un destinataireId !
        // C'est pourquoi on peut juste appeler markAllAsReadForUser(userId).
        
        notificationRepository.markAllAsReadForUser(userId, entrepriseId);
    }

    @Override
    public void toutEffacer(Long userId, Long entrepriseId) {
        notificationRepository.deleteByDestinataireIdAndEntrepriseId(userId, entrepriseId);
    }
}
