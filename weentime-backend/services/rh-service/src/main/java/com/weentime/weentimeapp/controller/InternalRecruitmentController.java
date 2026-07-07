package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.AiRecruitmentResultRequest;
import com.weentime.weentimeapp.security.InternalAuthUtils;
import com.weentime.weentimeapp.service.RecruitmentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

/**
 * Endpoint interne pour les callbacks inter-services.
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
            @RequestBody AiRecruitmentResultRequest body) {
        
        log.info("📥 Callback IA reçu pour candidature #{}", id);

        if (!isInternalSecretValid(requestSecret)) {
            log.warn("🚫 Accès non autorisé : Secret interne partagé invalide ou absent.");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
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
        } catch (ResponseStatusException e) {
            log.warn("Callback IA refusé pour candidature #{}: {}", id, e.getReason());
            return ResponseEntity.status(e.getStatusCode()).body(Map.of(
                "status", "error",
                "message", e.getReason() != null ? e.getReason() : "Callback IA invalide"
            ));
        } catch (Exception e) {
            log.error("❌ Erreur traitement callback IA pour candidature #{}: {}", id, e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of(
                "status", "error",
                "message", e.getMessage() != null ? e.getMessage() : "Erreur interne"
            ));
        }
    }

    private boolean isInternalSecretValid(String requestSecret) {
        return InternalAuthUtils.isInternalSecretValid(requestSecret, internalSecret);
    }
}
