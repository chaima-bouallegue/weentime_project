package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.service.RecruitmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Endpoint interne pour les callbacks inter-services.
 * NON exposé via le gateway — accessible uniquement sur le réseau Docker interne.
 * 
 * Utilisé par le ai-service Python pour envoyer les résultats d'analyse CV.
 */
@RestController
@RequestMapping("/api/v1/internal/recruitment")
@RequiredArgsConstructor
@Slf4j
public class InternalRecruitmentController {

    private final RecruitmentService recruitmentService;

    @Value("${weentime.internal.secret:WeenTimeInternalSecretKey2026}")
    private String internalSecret;

    /**
     * Reçoit le résultat de l'analyse IA d'un CV.
     * Appelé par le ai-service Python après évaluation Gemini.
     */
    @PostMapping("/applications/{id}/ai-result")
    public ResponseEntity<Map<String, String>> receiveAiResult(
            @PathVariable Long id,
            @RequestHeader(value = "X-Internal-Secret", required = false) String requestSecret,
            @RequestBody Map<String, Object> body) {
        
        log.info("📥 Callback IA reçu pour candidature #{}", id);

        if (requestSecret == null || !requestSecret.equals(internalSecret)) {
            log.warn("🚫 Accès non autorisé : Secret interne partagé invalide ou absent.");
            return ResponseEntity.status(org.springframework.http.HttpStatus.FORBIDDEN).body(Map.of(
                "status", "error",
                "message", "Access Denied: Invalid internal secret"
            ));
        }
        
        try {
            recruitmentService.processAiResult(id, body);
            return ResponseEntity.ok(Map.of(
                "status", "saved",
                "message", "Résultat IA enregistré pour la candidature #" + id
            ));
        } catch (Exception e) {
            log.error("❌ Erreur traitement callback IA pour candidature #{}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of(
                "status", "error",
                "message", e.getMessage()
            ));
        }
    }
}
