package com.weentime.weentimeapp.dto;

import lombok.*;

/**
 * Réponse contenant l'URL presigned MinIO et le chemin du fichier.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PresignedUrlResponse {

    /** URL presignée MinIO — valide 5 minutes — pour un PUT direct depuis le navigateur */
    private String uploadUrl;

    /** Chemin relatif stocké en base : absences/{entrepriseId}/{annee}/{uuid}.{ext} */
    private String filePath;
}
