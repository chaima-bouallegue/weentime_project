package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.response.PresenceResponse;

import java.util.List;

public interface PresenceService {
    PresenceResponse checkIn();
    PresenceResponse checkOut();
    PresenceResponse getToday();
    List<PresenceResponse> getHistory();
}
