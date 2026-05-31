package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.dto.EntrepriseStatsDto;
import com.weentime.weentimeproject.entity.Entreprise;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.Optional;

@Repository
public interface EntrepriseRepository extends JpaRepository<Entreprise, Long> {

    boolean existsBySiret(String siret);

    boolean existsBySiretAndIdNot(String siret, Long id);

    Optional<Entreprise> findByCodeInvitationIgnoreCase(String codeInvitation);

    Optional<Entreprise> findByNomIgnoreCase(String nom);

    @Query("""
            SELECT e FROM Entreprise e
            WHERE UPPER(REPLACE(REPLACE(e.codeInvitation, ' ', ''), '#', '')) IN :codes
            """)
    Optional<Entreprise> findByNormalizedCodeInvitation(@Param("codes") Collection<String> codes);

    // ─────────────────────────────────────────────────────────
    // Filtered + paginated list (server-side)
    // ─────────────────────────────────────────────────────────

    @Query("""
            SELECT e FROM Entreprise e
            WHERE (:status = 'ALL' OR e.status = :status)
              AND (:search IS NULL OR :search = ''
                   OR LOWER(e.nom)     LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(e.siret)   LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(e.secteur) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(e.codeInvitation) LIKE LOWER(CONCAT('%', :search, '%')))
            """)
    Page<Entreprise> findAllByFilters(
            @Param("status") String status,
            @Param("search") String search,
            Pageable pageable
    );

    // ─────────────────────────────────────────────────────────
    // Aggregate stats — single query, no N+1
    // ─────────────────────────────────────────────────────────

    @Query("""
            SELECT new com.weentime.weentimeproject.dto.EntrepriseStatsDto(
                COUNT(e),
                SUM(CASE WHEN e.status = 'ACTIVE'    THEN 1L ELSE 0L END),
                SUM(CASE WHEN e.status = 'SUSPENDED' THEN 1L ELSE 0L END),
                SUM(CASE WHEN e.status = 'CLOSED'    THEN 1L ELSE 0L END)
            )
            FROM Entreprise e
            """)
    EntrepriseStatsDto getStats();
}