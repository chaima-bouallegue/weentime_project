package com.weentime.weentimeapp.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TypeCongeDTO {

    private Long id;

    @NotBlank(message = "Le libelle est obligatoire.")
    @Size(max = 150, message = "Le libelle ne peut pas depasser 150 caracteres.")
    private String libelle;

    @JsonAlias({"joursMax", "maxJours", "maxDays"})
    @PositiveOrZero(message = "Le nombre maximum de jours doit etre positif ou nul.")
    private Integer nombreJoursMax;

    @JsonAlias({"decompterJours", "decompter", "decompterJour"})
    private Boolean decompteJours;

    @JsonAlias({"justificatifExige", "justificatifRequired"})
    private Boolean requireJustificatif;

    @JsonProperty("joursMax")
    public Integer getJoursMax() {
        return nombreJoursMax;
    }

    @JsonProperty("joursMax")
    public void setJoursMax(Integer joursMax) {
        this.nombreJoursMax = joursMax;
    }

    @JsonProperty("decompterJours")
    public Boolean getDecompterJours() {
        return decompteJours;
    }

    @JsonProperty("decompterJours")
    public void setDecompterJours(Boolean decompterJours) {
        this.decompteJours = decompterJours;
    }

    @JsonProperty("justificatifExige")
    public Boolean getJustificatifExige() {
        return requireJustificatif;
    }

    @JsonProperty("justificatifExige")
    public void setJustificatifExige(Boolean justificatifExige) {
        this.requireJustificatif = justificatifExige;
    }
}
