package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PresenceHistoryResponse {
    private String timezone;
    private List<PresenceSessionResponse> content;
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
    private boolean empty;
}
