package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.EntrepriseAccessControlHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EntrepriseAccessControlHistoryRepository
        extends JpaRepository<EntrepriseAccessControlHistory, Long> {

    List<EntrepriseAccessControlHistory> findAllByEntrepriseIdOrderByChangedAtDesc(Long entrepriseId);
}
