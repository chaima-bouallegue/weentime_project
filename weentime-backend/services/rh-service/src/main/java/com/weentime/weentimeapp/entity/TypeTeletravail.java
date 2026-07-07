package com.weentime.weentimeapp.entity;

import com.weentime.weentimeapp.enums.PeriodeTeletravailEnum;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;

@Entity
@Table(name = "type_teletravails")
@Filter(name = "entrepriseFilter", condition = "entreprise_id = :entrepriseId")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeTeletravail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long entrepriseId;

    @Column(nullable = false)
    private String libelle;

    @Enumerated(EnumType.STRING)
    @Column(name = "periode")
    private PeriodeTeletravailEnum periode;

    @Builder.Default
    private Boolean active = true;

    private String icon;
    
    private String color;
}
