package com.weentime.weentimeproject.service.impl;

import com.weentime.weentimeproject.dto.request.DepartementRequest;
import com.weentime.weentimeproject.dto.response.DepartementResponse;
import com.weentime.weentimeproject.entity.Departement;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.mapper.DepartementMapper;
import com.weentime.weentimeproject.repository.DepartementRepository;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import com.weentime.weentimeproject.service.DepartementService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class DepartementServiceImpl implements DepartementService {

    private final DepartementRepository departementRepository;
    private final DepartementMapper departementMapper;
    private final EntrepriseRepository entrepriseRepository;
    private final UtilisateurRepository utilisateurRepository;

    @Override
    public DepartementResponse createDepartement(DepartementRequest request) {
        if (departementRepository.existsByNomIgnoreCaseAndEntreprise_Id(
                request.getNom(), request.getEntrepriseId())) {
            throw new IllegalStateException(
                    "Un departement avec ce nom existe deja dans cette entreprise.");
        }
        if (departementRepository.existsByCodeInterneAndEntrepriseId(
                request.getCodeInterne(), request.getEntrepriseId())) {
            throw new IllegalStateException(
                    "Le code interne de ce departement existe deja dans cette entreprise.");
        }

        Entreprise entreprise = entrepriseRepository.findById(request.getEntrepriseId())
                .orElseThrow(() -> new EntityNotFoundException(
                        "Entreprise non trouvée avec l'id : " + request.getEntrepriseId()));

        Departement departement = departementMapper.toEntity(request);
        departement.setEntreprise(entreprise);

        return departementMapper.toResponse(departementRepository.save(departement));
    }

    @Override
    @Transactional(readOnly = true)
    public DepartementResponse getDepartementById(Long id) {
        return departementRepository.findById(id)
                .map(departementMapper::toResponse)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Departement non trouvé avec l'id : " + id));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DepartementResponse> getAllDepartements(Pageable pageable) {
        Long entrepriseScope = resolveScopedEntrepriseId();
        Page<Departement> page = entrepriseScope == null
                ? departementRepository.findAll(pageable)
                : departementRepository.findByEntreprise_Id(entrepriseScope, pageable);
        return page.map(departementMapper::toResponse);
    }

    @Override
    public DepartementResponse updateDepartement(Long id, DepartementRequest request) {
        Departement departement = departementRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Departement non trouvé avec l'id : " + id));

        if (!departement.getNom().equalsIgnoreCase(request.getNom())
                && departementRepository.existsByNomIgnoreCaseAndEntreprise_Id(
                        request.getNom(), departement.getEntreprise().getId())) {
            throw new IllegalStateException(
                    "Un departement avec ce nom existe deja dans cette entreprise.");
        }
        if (!departement.getCodeInterne().equals(request.getCodeInterne())
                && departementRepository.existsByCodeInterneAndEntrepriseId(
                        request.getCodeInterne(), departement.getEntreprise().getId())) {
            throw new IllegalStateException(
                    "Le code interne de ce departement existe deja dans cette entreprise.");
        }

        departementMapper.updateEntityFromRequest(request, departement);
        return departementMapper.toResponse(departementRepository.save(departement));
    }

    @Override
    public void deleteDepartement(Long id) {
        Departement departement = departementRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Departement non trouvé avec l'id : " + id));
        departementRepository.delete(departement);
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