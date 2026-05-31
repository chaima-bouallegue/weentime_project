package com.weentime.weentimeproject.service;

import com.weentime.weentimeproject.dto.response.CommunicationSyncEnterpriseResponse;
import com.weentime.weentimeproject.dto.response.CommunicationSyncTeamResponse;
import com.weentime.weentimeproject.dto.response.UserSummaryResponse;
import com.weentime.weentimeproject.entity.Equipe;
import com.weentime.weentimeproject.entity.Entreprise;
import com.weentime.weentimeproject.entity.Role;
import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import com.weentime.weentimeproject.repository.EntrepriseRepository;
import com.weentime.weentimeproject.repository.EquipeRepository;
import com.weentime.weentimeproject.repository.UtilisateurRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CommunicationInternalSyncService {

        private final EntrepriseRepository entrepriseRepository;
        private final UtilisateurRepository utilisateurRepository;
        private final EquipeRepository equipeRepository;

        @Transactional(readOnly = true)
        public CommunicationSyncEnterpriseResponse getEnterpriseSnapshot(Long entrepriseId) {
                Entreprise entreprise = entrepriseRepository.findById(entrepriseId)
                                .orElseThrow(() -> new EntityNotFoundException(
                                                "Entreprise introuvable: " + entrepriseId));

                List<Utilisateur> activeUsers = utilisateurRepository
                                .findByEntrepriseIdOrderByPrenomAscNomAsc(entrepriseId).stream()
                                .filter(Objects::nonNull)
                                .filter(user -> user.getStatut() == StatutUtilisateurEnum.ACTIF)
                                .toList();

                Map<Long, UserSummaryResponse> activeUserSummaries = activeUsers.stream()
                                .collect(Collectors.toMap(
                                                Utilisateur::getId,
                                                this::toSummary,
                                                (left, right) -> left,
                                                LinkedHashMap::new));

                List<CommunicationSyncTeamResponse> teams = equipeRepository
                                .findByDepartement_Entreprise_IdOrderByNomAsc(entrepriseId).stream()
                                .filter(Objects::nonNull)
                                .map(team -> toTeamSnapshot(team, activeUsers, activeUserSummaries))
                                .sorted(Comparator.comparing(
                                                CommunicationSyncTeamResponse::nom,
                                                Comparator.nullsLast(String::compareToIgnoreCase)))
                                .toList();

                return new CommunicationSyncEnterpriseResponse(
                                entreprise.getId(),
                                entreprise.getNom(),
                                new ArrayList<>(activeUserSummaries.values()),
                                teams);
        }

        private CommunicationSyncTeamResponse toTeamSnapshot(
                        Equipe team,
                        List<Utilisateur> activeUsers,
                        Map<Long, UserSummaryResponse> activeUserSummaries) {

                List<UserSummaryResponse> members = activeUsers.stream()
                                .filter(user -> user.getEquipe() != null)
                                .filter(user -> Objects.equals(user.getEquipe().getId(), team.getId()))
                                .map(user -> activeUserSummaries.get(user.getId()))
                                .filter(Objects::nonNull)
                                .toList();

                return new CommunicationSyncTeamResponse(
                                team.getId(),
                                team.getNom(),
                                team.getDescription(),
                                team.getEstActive(),
                                team.getDepartement() != null && team.getDepartement().getEntreprise() != null
                                                ? team.getDepartement().getEntreprise().getId()
                                                : null,
                                team.getResponsable() != null ? team.getResponsable().getId() : null,
                                members);
        }

        private UserSummaryResponse toSummary(Utilisateur user) {
                String fullName = ((user.getPrenom() == null ? "" : user.getPrenom().trim())
                                + " "
                                + (user.getNom() == null ? "" : user.getNom().trim())).trim();

                return UserSummaryResponse.builder()
                                .id(user.getId())
                                .nom(user.getNom())
                                .prenom(user.getPrenom())
                                .fullName(fullName.isBlank() ? user.getEmail() : fullName)
                                .email(user.getEmail())
                                .poste(user.getPoste())
                                .avatarUrl(user.getAvatarUrl())
                                .photo(user.getPhoto())
                                .managerId(user.getManager() != null ? user.getManager().getId() : null)
                                .departementId(user.getDepartement() != null ? user.getDepartement().getId() : null)
                                .departement(user.getDepartement() != null ? user.getDepartement().getNom() : null)
                                .equipeId(user.getEquipe() != null ? user.getEquipe().getId() : null)
                                .equipe(user.getEquipe() != null ? user.getEquipe().getNom() : null)
                                .entrepriseId(user.getEntrepriseId())
                                .entreprise(user.getEntreprise() != null ? user.getEntreprise().getNom() : null)
                                .roles(user.getRoles() == null ? List.of()
                                                : user.getRoles().stream()
                                                                .map(Role::getNom) // getNom() retourne déjà un String
                                                                .filter(Objects::nonNull)
                                                                // .map(Enum::name) supprimé — getNom() n'est plus un
                                                                // enum
                                                                .toList())
                                .active(user.getStatut() == StatutUtilisateurEnum.ACTIF)
                                .build();
        }
}