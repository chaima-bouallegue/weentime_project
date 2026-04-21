package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.PresenceStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresenceNotificationDTO {

    private String title;
    private String actor;
    private String audience;
    private String category;
    private String priority;
    private String channel;
    private Long managerId;
    private Long userId;
    private Long entrepriseId;
    private String fullName;
    private String departement;
    private String equipe;
    private List<String> impactedUsers;
    private LocalDate date;
    private LocalDateTime eventTime;
    private PresenceStatus status;
    private String message;
}
