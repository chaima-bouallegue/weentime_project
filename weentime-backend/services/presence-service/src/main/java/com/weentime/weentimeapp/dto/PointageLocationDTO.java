package com.weentime.weentimeapp.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PointageLocationDTO {
    private Double latitude;
    private Double longitude;
    private Double accuracy;
    private String address;
    private String city;
    private String region;
    private String country;
}
