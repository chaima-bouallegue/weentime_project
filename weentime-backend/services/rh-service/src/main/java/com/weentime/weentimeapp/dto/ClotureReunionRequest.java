package com.weentime.weentimeapp.dto;

import lombok.Data;
import java.util.List;

@Data
public class ClotureReunionRequest {
    private List<Long> participantsPresents;
    private String compteRendu;
}
