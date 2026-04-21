package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.TypeAbsence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TypeAbsenceRepository extends JpaRepository<TypeAbsence, Long> {
}
