package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.JobPosting;
import com.weentime.weentimeapp.enums.JobStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface JobPostingRepository extends JpaRepository<JobPosting, Long> {
    List<JobPosting> findByEntrepriseIdOrderByCreatedAtDesc(Long entrepriseId);
    List<JobPosting> findByEntrepriseIdAndStatusOrderByCreatedAtDesc(Long entrepriseId, JobStatus status);
    Optional<JobPosting> findByIdAndEntrepriseId(Long id, Long entrepriseId);
}
