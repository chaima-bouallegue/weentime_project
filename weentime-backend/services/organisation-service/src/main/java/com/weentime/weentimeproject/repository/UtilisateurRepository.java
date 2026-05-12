package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Utilisateur;
import com.weentime.weentimeproject.enums.RoleNom;
import com.weentime.weentimeproject.enums.StatutUtilisateurEnum;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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

    @Query("""
            select distinct u
            from Utilisateur u
            join u.roles r
            where r.nom = :roleName
            order by u.dateCreation desc
            """)
    List<Utilisateur> findByRoles_NomOrderByDateCreationDesc(@Param("roleName") RoleNom roleName);

    @Query("""
            select distinct u
            from Utilisateur u
            join u.roles r
            where u.entreprise.id = :entrepriseId
              and r.nom = :roleName
            order by u.dateCreation desc
            """)
    List<Utilisateur> findByEntreprise_IdAndRoles_NomOrderByDateCreationDesc(
            @Param("entrepriseId") Long entrepriseId,
            @Param("roleName") RoleNom roleName
    );

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByEntrepriseIdOrderByPrenomAscNomAsc(Long entrepriseId);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByEntrepriseIdAndRolesNomOrderByPrenomAscNomAsc(Long entrepriseId, RoleNom roleName);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    @Query(
            value = "select distinct u from Utilisateur u where u.entrepriseId = :entrepriseId",
            countQuery = "select count(distinct u.id) from Utilisateur u where u.entrepriseId = :entrepriseId"
    )
    org.springframework.data.domain.Page<Utilisateur> findByEntrepriseId(
            @Param("entrepriseId") Long entrepriseId,
            org.springframework.data.domain.Pageable pageable
    );

    org.springframework.data.domain.Page<Utilisateur> findByEquipeId(Long equipeId, org.springframework.data.domain.Pageable pageable);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByManagerId(Long managerId);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    List<Utilisateur> findByStatut(StatutUtilisateurEnum statut);

    @EntityGraph(attributePaths = {"roles", "departement", "equipe", "entreprise", "manager"})
    @Query(
            value = "select distinct u from Utilisateur u where u.entrepriseId = :entrepriseId and u.statut = :statut",
            countQuery = "select count(distinct u.id) from Utilisateur u where u.entrepriseId = :entrepriseId and u.statut = :statut"
    )
    org.springframework.data.domain.Page<Utilisateur> findByEntreprise_IdAndStatut(
            @Param("entrepriseId") Long entrepriseId,
            @Param("statut") StatutUtilisateurEnum statut,
            org.springframework.data.domain.Pageable pageable
    );
}
