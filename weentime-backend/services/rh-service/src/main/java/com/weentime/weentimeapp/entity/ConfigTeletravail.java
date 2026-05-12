package com.weentime.weentimeapp.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "config_teletravail")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConfigTeletravail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Long entrepriseId;

    private Integer quotaMensuel;
}
