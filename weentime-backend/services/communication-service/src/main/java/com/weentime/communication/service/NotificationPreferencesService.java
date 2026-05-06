package com.weentime.communication.service;

import com.weentime.communication.dto.NotificationPreferencesResponse;
import com.weentime.communication.dto.UpdateChannelNotificationRequest;
import com.weentime.communication.dto.UpdateNotificationPreferencesRequest;
import com.weentime.communication.entity.CommChannelMember;
import com.weentime.communication.entity.CommUserNotificationPreference;
import com.weentime.communication.exception.CommunicationException;
import com.weentime.communication.repository.CommChannelMemberRepository;
import com.weentime.communication.repository.CommUserNotificationPreferenceRepository;
import com.weentime.communication.security.CommunicationUserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class NotificationPreferencesService {

    public static final String LEVEL_ALL = "ALL";
    public static final String LEVEL_MENTIONS = "MENTIONS";
    public static final String LEVEL_MUTED = "MUTED";

    private final CommUserNotificationPreferenceRepository preferenceRepository;
    private final CommChannelMemberRepository channelMemberRepository;
    private final MembershipService membershipService;

    @Transactional(readOnly = true)
    public NotificationPreferencesResponse getPreferences(CommunicationUserPrincipal currentUser) {
        return toResponse(resolve(currentUser.entrepriseId(), currentUser.userId()));
    }

    @Transactional
    public NotificationPreferencesResponse updatePreferences(
            UpdateNotificationPreferencesRequest request,
            CommunicationUserPrincipal currentUser
    ) {
        CommUserNotificationPreference preference = resolve(currentUser.entrepriseId(), currentUser.userId());
        if (request == null) {
            return toResponse(preference);
        }
        Instant now = Instant.now();
        if (preference.getCreatedAt() == null) {
            preference.setCreatedAt(now);
        }
        if (request.directMessageEnabled() != null) {
            preference.setDirectMessageEnabled(request.directMessageEnabled());
        }
        if (request.mentionEnabled() != null) {
            preference.setMentionEnabled(request.mentionEnabled());
        }
        if (request.reactionEnabled() != null) {
            preference.setReactionEnabled(request.reactionEnabled());
        }
        if (request.channelNotificationMode() != null && !request.channelNotificationMode().isBlank()) {
            preference.setChannelNotificationMode(normalizeLevel(request.channelNotificationMode()));
        }
        preference.setUpdatedAt(now);
        preferenceRepository.save(preference);
        return toResponse(preference);
    }

    @Transactional
    public void updateChannelNotificationLevel(
            UUID channelId,
            UpdateChannelNotificationRequest request,
            CommunicationUserPrincipal currentUser
    ) {
        CommChannelMember member = membershipService.assertActiveMember(channelId, currentUser);
        String level = normalizeLevel(request == null ? null : request.notificationLevel());
        member.setNotificationLevel(level);
        member.setMuted(LEVEL_MUTED.equals(level));
        channelMemberRepository.save(member);
    }

    @Transactional(readOnly = true)
    public CommUserNotificationPreference resolve(Long entrepriseId, Long userId) {
        return preferenceRepository.findByEntrepriseIdAndUserId(entrepriseId, userId)
                .orElseGet(() -> {
                    CommUserNotificationPreference preference = new CommUserNotificationPreference();
                    preference.setEntrepriseId(entrepriseId);
                    preference.setUserId(userId);
                    preference.setChannelNotificationMode(LEVEL_ALL);
                    return preference;
                });
    }

    public boolean allowsDirectMessage(CommUserNotificationPreference preference) {
        return preference.isDirectMessageEnabled();
    }

    public boolean allowsMention(CommUserNotificationPreference preference) {
        return preference.isMentionEnabled();
    }

    public boolean allowsChannelMessage(CommChannelMember member, CommUserNotificationPreference preference) {
        String level = normalizedLevelForMember(member, preference);
        return LEVEL_ALL.equals(level);
    }

    public boolean allowsReaction(CommUserNotificationPreference preference) {
        return preference.isReactionEnabled();
    }

    public String normalizedLevelForMember(CommChannelMember member, CommUserNotificationPreference preference) {
        if (member.isMuted()) {
            return LEVEL_MUTED;
        }
        String level = member.getNotificationLevel();
        if (level == null || level.isBlank()) {
            level = preference.getChannelNotificationMode();
        }
        return normalizeLevel(level);
    }

    private NotificationPreferencesResponse toResponse(CommUserNotificationPreference preference) {
        return NotificationPreferencesResponse.builder()
                .directMessageEnabled(preference.isDirectMessageEnabled())
                .mentionEnabled(preference.isMentionEnabled())
                .reactionEnabled(preference.isReactionEnabled())
                .channelNotificationMode(normalizeLevel(preference.getChannelNotificationMode()))
                .build();
    }

    private String normalizeLevel(String rawLevel) {
        String level = rawLevel == null || rawLevel.isBlank()
                ? LEVEL_ALL
                : rawLevel.trim().toUpperCase();
        if (!Set.of(LEVEL_ALL, LEVEL_MENTIONS, LEVEL_MUTED).contains(level)) {
            throw new CommunicationException(HttpStatus.BAD_REQUEST, "COMM_NOTIFICATION_LEVEL_INVALID",
                    "Unsupported notification level.", Map.of("notificationLevel", rawLevel));
        }
        return level;
    }
}
