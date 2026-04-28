package com.weentime.weentimeproject.repository;

import com.weentime.weentimeproject.entity.UserAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserAuditLogRepository extends JpaRepository<UserAuditLog, Long> {
    List<UserAuditLog> findByPerformedByOrderByCreatedAtDesc(String performedBy);

    @Query("""
            select log from UserAuditLog log
            where log.performedBy = :identity
               or log.targetUser = :identity
            order by log.createdAt desc
            """)
    List<UserAuditLog> findByIdentityOrderByCreatedAtDesc(@Param("identity") String identity);
}
