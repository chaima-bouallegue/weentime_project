package com.weentime.weentimeapp.dto;

import com.weentime.weentimeapp.enums.RSVPResponse;
import lombok.Data;

@Data
public class ReunionResponseRequest {
    private RSVPResponse reponse;
    private Integer rappelMinutes;
}
