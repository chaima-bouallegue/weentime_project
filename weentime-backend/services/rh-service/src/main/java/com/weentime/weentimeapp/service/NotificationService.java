package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.NotificationDTO;
import java.util.List;

public interface NotificationService {
    List<NotificationDTO> getMesNotifications(Long userId, Long entrepriseId, List<String> roles);
    long countNonLues(Long userId, Long entrepriseId);
    void marquerCommeLue(Long notificationId, Long userId, Long entrepriseId);
    void toutMarquerCommeLu(Long userId, Long entrepriseId);
    void toutEffacer(Long userId, Long entrepriseId);
}
