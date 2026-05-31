package com.weentime.weentimeproject.controller;

import com.weentime.weentimeproject.dto.UserIntegrationResponse;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import com.weentime.weentimeproject.entity.Role;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserIntegrationController {

    private final UtilisateurRepository utilisateurRepository;

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    public ResponseEntity<UserIntegrationResponse> getUser(@PathVariable Long id) {
        return ResponseEntity.ok(mapToIntegration(findUser(id)));
    }

    @GetMapping("/{id}/manager")
    @Transactional(readOnly = true)
    public ResponseEntity<UserIntegrationResponse> getManager(@PathVariable Long id) {
        Utilisateur user = findUser(id);
        Utilisateur manager = user.getEquipe() != null ? user.getEquipe().getResponsable() : null;
        return ResponseEntity.ok(manager != null ? mapToIntegration(manager) : null);
    }

    @GetMapping("/{id}/roles")
    @Transactional(readOnly = true)
    public ResponseEntity<List<String>> getRoles(@PathVariable Long id) {
        Utilisateur user = findUser(id);
        List<String> roles = user.getRoles() != null
                ? user.getRoles().stream()
                        .map(Role::getNom) // getNom() retourne déjà un String
                        .collect(Collectors.toList())
                : List.of();
        return ResponseEntity.ok(roles);
    }

    private Utilisateur findUser(Long id) {
        return utilisateurRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Utilisateur introuvable: " + id));
    }

    private UserIntegrationResponse mapToIntegration(Utilisateur user) {
        return UserIntegrationResponse.builder()
                .id(user.getId())
                .managerId(user.getEquipe() != null && user.getEquipe().getResponsable() != null
                        ? user.getEquipe().getResponsable().getId()
                        : null)
                .equipeId(user.getEquipe() != null ? user.getEquipe().getId() : null)
                .entrepriseId(user.getEntreprise() != null ? user.getEntreprise().getId() : null)
                .fullName(user.getPrenom() + " " + user.getNom()) // supprimé le \ parasite
                .roles(user.getRoles() != null
                        ? user.getRoles().stream()
                                .map(Role::getNom) // pareil ici
                                .collect(Collectors.toList())
                        : List.of())
                .build();
    }
}
