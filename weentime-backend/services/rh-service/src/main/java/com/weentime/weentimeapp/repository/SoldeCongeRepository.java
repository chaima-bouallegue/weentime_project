package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.SoldeConge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SoldeCongeRepository extends JpaRepository<SoldeConge, Long> {
    List<SoldeConge> findByUtilisateurId(Long utilisateurId);
    Optional<SoldeConge> findByUtilisateurIdAndTypeCongeId(Long utilisateurId, Long typeCongeId);
    List<SoldeConge> findByUtilisateurIdInAndAnnee(java.util.List<Long> utilisateurIds, Integer annee);
    Optional<SoldeConge> findByUtilisateurIdAndTypeCongeIdAndAnnee(Long utilisateurId, Long typeCongeId, Integer annee);
    
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<SoldeConge> findWithLockByUtilisateurIdAndTypeCongeIdAndAnnee(Long utilisateurId, Long typeCongeId, Integer annee);

    boolean existsByAnnee(Integer annee);
}
