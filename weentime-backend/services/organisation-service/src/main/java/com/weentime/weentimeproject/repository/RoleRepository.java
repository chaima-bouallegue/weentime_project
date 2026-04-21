package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Role;
import com.weentime.weentimeproject.enums.RoleNom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RoleRepository extends JpaRepository<Role, Long> {
    Optional<Role> findByNom(RoleNom nom);
}
