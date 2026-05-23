package com.weentime.weentimeapp.controller;

import com.weentime.weentimeapp.dto.ApiResponse;
import com.weentime.weentimeapp.dto.UpdateStatutRequest;
import com.weentime.weentimeapp.dto.WorkflowStatusUpdateRequest;
import com.weentime.weentimeapp.enums.StatutDemandeEnum;
import com.weentime.weentimeapp.enums.StatutDocument;
import com.weentime.weentimeapp.security.SecurityUtils;

import com.weentime.weentimeapp.service.AutorisationService;
import com.weentime.weentimeapp.service.CongeService;
import com.weentime.weentimeapp.service.DocumentService;
import com.weentime.weentimeapp.service.TeletravailService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/rh")
@RequiredArgsConstructor
public class RhWorkflowCompatibilityController {

    private final CongeService congeService;
    private final AutorisationService autorisationService;
    private final TeletravailService teletravailService;
    private final DocumentService documentService;

    @PutMapping("/demandes/{id}/statut")
    @PreAuthorize("hasAnyRole('RH','ADMIN')")
    public ResponseEntity<ApiResponse<Object>> updateRequestStatus(
            @PathVariable Long id,
            @RequestBody WorkflowStatusUpdateRequest request
    ) {
        boolean approve = request.getStatut() == StatutDemandeEnum.APPROUVE;
        boolean reject = request.getStatut() == StatutDemandeEnum.REFUSE;
        if (request.getTypeDemande() == null || (!approve && !reject)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Le type de demande et un statut final sont requis.");
        }

        Object response = switch (request.getTypeDemande()) {
            case CONGE -> approve
                    ? congeService.validateByRH(id, SecurityUtils.getCurrentUserId())
                    : congeService.reject(id, SecurityUtils.getCurrentUserId(), request.getCommentaire());
            case AUTORISATION -> approve
                    ? autorisationService.validateRH(id, currentUserEmail())
                    : autorisationService.reject(id, currentUserEmail(), request.getCommentaire());
            case TELETRAVAIL -> approve
                    ? teletravailService.validerRH(id, request.getCommentaire())
                    : teletravailService.rejeterRH(id, request.getCommentaire());
            case DOCUMENT -> approve
                    ? documentService.updateStatut(id, buildDocumentApproval(request.getCommentaire()), SecurityUtils.getCurrentUserId())
                    : documentService.refuser(id, request.getCommentaire(), SecurityUtils.getCurrentUserId());
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Type de demande non supporté ou supprimé.");
        };

        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private UpdateStatutRequest buildDocumentApproval(String commentaire) {
        UpdateStatutRequest request = new UpdateStatutRequest();
        request.setStatut(StatutDocument.PRET);
        request.setCommentaireRH(commentaire);
        return request;
    }

    private String currentUserEmail() {
        return SecurityContextHolder.getContext().getAuthentication().getName();
    }
}
