package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.TypeAutorisation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TypeAutorisationRepository extends JpaRepository<TypeAutorisation, Long> {
    Optional<TypeAutorisation> findByLibelle(String libelle);
}
