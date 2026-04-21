package com.weentime.weentimeapp.dto;

import lombok.Data;
import java.util.List;

@Data
public class InitialisationRequest {
    private List<Long> utilisateurIds;
}
