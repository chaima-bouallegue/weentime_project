package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.Application;
import com.weentime.weentimeapp.enums.ApplicationStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ApplicationRepository extends JpaRepository<Application, Long> {
    List<Application> findByJobPostingIdOrderBySubmittedAtDesc(Long jobPostingId);
    List<Application> findByEntrepriseIdOrderBySubmittedAtDesc(Long entrepriseId);
    List<Application> findByEntrepriseIdAndStatusOrderBySubmittedAtDesc(Long entrepriseId, ApplicationStatus status);
    Optional<Application> findByIdAndEntrepriseId(Long id, Long entrepriseId);
    boolean existsByJobPostingIdAndEmail(Long jobPostingId, String email);
}
