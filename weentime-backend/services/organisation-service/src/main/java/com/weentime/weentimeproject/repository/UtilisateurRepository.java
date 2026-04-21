package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.RoleNom;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface UtilisateurRepository extends JpaRepository<Utilisateur, Long> {

    @EntityGraph(attributePaths = {"roles"})
    Optional<Utilisateur> findByEmail(String email);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    Optional<Utilisateur> findWithDetailsById(Long id);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByIdIn(Collection<Long> ids);

    Optional<Utilisateur> findByIdAndRolesNom(Long id, RoleNom role);

    boolean existsByEmail(@NotBlank(message = "L'email est obligatoire") @Email(message = "L'email doit etre valide") String email);

    List<Utilisateur> findByRoles_NomOrderByDateCreationDesc(RoleNom roleName);

    List<Utilisateur> findByEntreprise_IdAndRoles_NomOrderByDateCreationDesc(Long entrepriseId, RoleNom roleName);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByEntrepriseIdOrderByPrenomAscNomAsc(Long entrepriseId);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByEntrepriseIdAndRolesNomOrderByPrenomAscNomAsc(Long entrepriseId, RoleNom roleName);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    org.springframework.data.domain.Page<Utilisateur> findByEntrepriseId(Long entrepriseId, org.springframework.data.domain.Pageable pageable);

    org.springframework.data.domain.Page<Utilisateur> findByEquipeId(Long equipeId, org.springframework.data.domain.Pageable pageable);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByManagerId(Long managerId);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByStatut(StatutUtilisateurEnum statut);
}
