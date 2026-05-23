package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.TypeConge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TypeCongeRepository extends JpaRepository<TypeConge, Long> {

    @Query("""
            select t
            from TypeConge t
            where t.entrepriseId = :entrepriseId
               or t.entrepriseId is null
            order by t.libelle asc
            """)
    List<TypeConge> findAllByEntrepriseId(@Param("entrepriseId") Long entrepriseId);

}
