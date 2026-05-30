package com.weentime.weentimeapp.service;

import com.weentime.weentimeapp.dto.CheckInRequest;
import com.weentime.weentimeapp.dto.CheckOutRequest;
import com.weentime.weentimeapp.dto.AttendanceSessionDTO;
import com.weentime.weentimeapp.dto.AttendanceSessionViewDTO;
import com.weentime.weentimeapp.dto.AttendanceSummaryDTO;
import com.weentime.weentimeapp.dto.GlobalPresenceAnalyticsDTO;
import com.weentime.weentimeapp.dto.PresenceStatsDTO;
import com.weentime.weentimeapp.dto.TeamStatusResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PresenceService {
    AttendanceSummaryDTO checkIn(Long utilisateurId, CheckInRequest request);
    AttendanceSummaryDTO checkOut(Long utilisateurId, CheckOutRequest request);
    AttendanceSummaryDTO getTodayAttendance(Long utilisateurId);
    Page<AttendanceSessionDTO> getAttendanceHistory(Long utilisateurId, Pageable pageable);
    TeamStatusResponse getTeamTodayStatus(Long managerId, Long teamId);
    Page<AttendanceSessionViewDTO> getTeamAttendanceHistory(Long managerId, Long teamId, Pageable pageable);
    TeamStatusResponse getCompanyTodayStatus(Long rhUserId);
    TeamStatusResponse getGlobalTodayStatus();
    PresenceStatsDTO getCompanyStats(Long rhUserId);
    GlobalPresenceAnalyticsDTO getGlobalAnalytics();
    PresenceStatsDTO getGlobalStats();
    PresenceStatsDTO getMyStats(Long utilisateurId);
    void detectAbsences();
    void autoCloseOpenSessions();
    void detectMissingCheckIns();
    java.util.Map<java.time.LocalDate, TeamStatusResponse> getStatusRange(Long entrepriseId, Long teamId, java.time.LocalDate start, java.time.LocalDate end);
}
