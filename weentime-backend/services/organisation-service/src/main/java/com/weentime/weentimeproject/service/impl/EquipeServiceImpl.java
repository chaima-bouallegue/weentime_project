package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.EquipeRequest;
import com.weentime.weentimeproject.dto.response.EquipeResponse;
import com.weentime.weentimeproject.entity.Departement;
import com.weentime.weentimeproject.entity.Equipe;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.mapper.EquipeMapper;
import com.weentime.weentimeproject.repository.DepartementRepository;
import com.weentime.weentimeproject.repository.EquipeRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.EquipeService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional
public class EquipeServiceImpl implements EquipeService {

    private final EquipeRepository equipeRepository;
    private final EquipeMapper equipeMapper;
    private final DepartementRepository departementRepository;
    private final UtilisateurRepository utilisateurRepository;

    // -------------------------------------------------------------------------
    // CRUD
    // -------------------------------------------------------------------------

    @Override
    public EquipeResponse createEquipe(EquipeRequest request) {
        if (equipeRepository.existsByNomAndDepartementId(request.getNom(), request.getDepartementId())) {
            throw new IllegalArgumentException(
                    "Une équipe avec ce nom existe déjà dans ce département : " + request.getNom());
        }

        Departement departement = departementRepository.findById(request.getDepartementId())
                .orElseThrow(() -> new EntityNotFoundException(
                        "Departement non trouvé avec l'id : " + request.getDepartementId()));

        Equipe equipe = equipeMapper.toEntity(request);
        equipe.setDepartement(departement);

        if (request.getResponsableId() != null) {
            Utilisateur responsable = utilisateurRepository.findById(request.getResponsableId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Utilisateur non trouvé avec l'id : " + request.getResponsableId()));

            boolean isManager = responsable.getRoles() != null && responsable.getRoles().stream()
                    .anyMatch(role -> "ROLE_MANAGER".equals(role.getNom())); // String, plus enum

            if (!isManager) {
                throw new IllegalArgumentException("Le responsable doit être un MANAGER");
            }
            equipe.setResponsable(responsable);
        }

        return equipeMapper.toResponse(equipeRepository.save(equipe));
    }

    @Override
    @Transactional(readOnly = true)
    public EquipeResponse getEquipeById(Long id) {
        return equipeRepository.findById(id)
                .map(equipeMapper::toResponse)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Equipe non trouvée avec l'id : " + id));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<EquipeResponse> getAllEquipes(Pageable pageable) {
        Long entrepriseScope = resolveScopedEntrepriseId();
        Page<Equipe> page = entrepriseScope == null
                ? equipeRepository.findAll(pageable)
                : equipeRepository.findByDepartement_Entreprise_Id(entrepriseScope, pageable);
        return page.map(equipeMapper::toResponse);
    }

    @Override
    public EquipeResponse updateEquipe(Long id, EquipeRequest request) {
        Equipe equipe = equipeRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Equipe non trouvée avec l'id : " + id));

        equipeMapper.updateEntityFromRequest(request, equipe);

        if (request.getDepartementId() != null) {
            Departement departement = departementRepository.findById(request.getDepartementId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Departement non trouvé avec l'id : " + request.getDepartementId()));
            equipe.setDepartement(departement);
        }

        if (request.getResponsableId() != null) {
            Utilisateur responsable = utilisateurRepository.findById(request.getResponsableId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Utilisateur non trouvé avec l'id : " + request.getResponsableId()));

            boolean isManager = responsable.getRoles() != null && responsable.getRoles().stream()
                    .anyMatch(role -> "ROLE_MANAGER".equals(role.getNom())); // String, plus enum

            if (!isManager) {
                throw new IllegalArgumentException("Le responsable doit être un MANAGER");
            }
            equipe.setResponsable(responsable);
        } else {
            equipe.setResponsable(null);
        }

        return equipeMapper.toResponse(equipeRepository.save(equipe));
    }

    @Override
    public void deleteEquipe(Long id) {
        if (!equipeRepository.existsById(id)) {
            throw new EntityNotFoundException("Equipe non trouvée avec l'id : " + id);
        }
        equipeRepository.deleteById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<?> getEquipeMembers(Long id, Pageable pageable) {
        equipeRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Equipe non trouvée avec l'id : " + id));

        return utilisateurRepository.findByEquipeId(id, pageable)
                .map(user -> {
                    Map<String, Object> member = new HashMap<>();
                    member.put("id", user.getId());
                    member.put("nom", user.getNom());
                    member.put("prenom", user.getPrenom());
                    member.put("email", user.getEmail());
                    member.put("statut", user.getStatut());
                    member.put("poste", user.getPoste());
                    member.put("departementId", user.getDepartement() != null ? user.getDepartement().getId() : null);
                    member.put("departementNom", user.getDepartement() != null ? user.getDepartement().getNom() : null);
                    member.put("equipeId", user.getEquipe() != null ? user.getEquipe().getId() : null);
                    member.put("equipeNom", user.getEquipe() != null ? user.getEquipe().getNom() : null);
                    member.put("roles", user.getRoles() == null
                            ? List.of()
                            : user.getRoles().stream()
                                    .map(role -> role.getNom()) // getNom() retourne déjà un String
                                    .toList());
                    if (user.getManager() != null) {
                        member.put("managerId", user.getManager().getId());
                        member.put("managerName", user.getManager().getPrenom() + " " + user.getManager().getNom());
                    }
                    return member;
                });
    }

    @Override
    @Transactional(readOnly = true)
    public List<EquipeResponse> getEquipesByResponsable(Long responsableId) {
        return equipeRepository.findByResponsableId(responsableId).stream()
                .map(equipeMapper::toResponse)
                .toList();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private Long resolveScopedEntrepriseId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new IllegalStateException("Aucun utilisateur authentifie.");
        }

        String email = authentication.getName();
        if ("SYSTEM".equals(email)) {
            return null;
        }

        Utilisateur currentUser = utilisateurRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalStateException("Utilisateur authentifie non trouve."));

        boolean isAdmin = currentUser.getRoles() != null
                && currentUser.getRoles().stream()
                        .anyMatch(role -> "ROLE_ADMIN".equals(role.getNom())); // String, plus enum

        return isAdmin ? null : currentUser.getEntrepriseId();
    }
}