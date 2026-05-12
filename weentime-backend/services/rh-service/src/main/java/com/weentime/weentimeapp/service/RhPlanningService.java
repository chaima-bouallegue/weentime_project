package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.BulkNotificationRequest;
import com.weentime.weentimeapp.dto.BulkStatusRequest;
import com.weentime.weentimeapp.dto.response.PlanningResponseDTO;
import com.weentime.weentimeapp.enums.StatutJournee;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public interface RhPlanningService {
    List<PlanningResponseDTO> getPlanning(LocalDate start, LocalDate end, Long teamId, Long departmentId);

    StatutJournee getStatutJournee(Long userId, LocalDate date);

    Map<Long, Map<LocalDate, StatutJournee>> getBulkStatus(BulkStatusRequest request);

    void sendBulkNotification(BulkNotificationRequest request);
}
