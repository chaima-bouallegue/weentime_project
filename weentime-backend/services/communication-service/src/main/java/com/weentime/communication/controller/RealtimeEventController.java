package com.weentime.communication.controller;

import com.weentime.communication.dto.ApiEnvelope;
import com.weentime.communication.dto.EventReplayResponse;
import com.weentime.communication.security.SecurityUtils;
import com.weentime.communication.service.RealtimeEventService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/communication")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class RealtimeEventController {

    private final RealtimeEventService realtimeEventService;

    @GetMapping({"/events/replay", "/events/missed"})
    public ApiEnvelope<EventReplayResponse> replayEvents(
            @RequestParam(name = "afterEventId", required = false) UUID afterEventId,
            @RequestParam(name = "after", required = false) UUID afterCursor,
            @RequestParam(required = false) Integer limit
    ) {
        return ApiEnvelope.success(realtimeEventService.replay(
                afterEventId != null ? afterEventId : afterCursor,
                limit,
                SecurityUtils.currentUser()
        ));
    }
}
