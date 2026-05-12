package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.TypeTeletravail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TypeTeletravailRepository extends JpaRepository<TypeTeletravail, Long> {
    List<TypeTeletravail> findAllByEntrepriseId(Long entrepriseId);
}
