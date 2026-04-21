package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.Token;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface TokenRepository extends JpaRepository<Token, Long> {
    Optional<Token> findByToken(String token);
    void deleteByUtilisateurId(Long utilisateurId);
}