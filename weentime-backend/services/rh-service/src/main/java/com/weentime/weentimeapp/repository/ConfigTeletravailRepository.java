package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.ConfigTeletravail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ConfigTeletravailRepository extends JpaRepository<ConfigTeletravail, Long> {
    Optional<ConfigTeletravail> findByEntrepriseId(Long entrepriseId);
}
