package com.weentime.weentimeapp.repository;

import com.weentime.weentimeapp.entity.AttendanceSession;
import com.weentime.weentimeapp.enums.AttendanceSessionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface AttendanceSessionRepository extends JpaRepository<AttendanceSession, Long> {

    Optional<AttendanceSession> findFirstByUtilisateurIdAndStatusOrderByCheckInTimeDesc(Long utilisateurId, AttendanceSessionStatus status);

    List<AttendanceSession> findByUtilisateurIdAndDateOrderByCheckInTimeAsc(Long utilisateurId, LocalDate date);

    Page<AttendanceSession> findByUtilisateurIdOrderByCheckInTimeDesc(Long utilisateurId, Pageable pageable);

    Page<AttendanceSession> findByUtilisateurIdIn(Collection<Long> utilisateurIds, Pageable pageable);

    List<AttendanceSession> findByUtilisateurIdInAndDate(Collection<Long> utilisateurIds, LocalDate date);

    @Query("""
        select s from AttendanceSession s
        where s.utilisateurId = :utilisateurId
          and s.date between :dateStart and :dateEnd
        order by s.date desc, s.checkInTime desc
    """)
    List<AttendanceSession> findByUtilisateurIdAndDateBetweenOrderByDateDesc(
            @Param("utilisateurId") Long utilisateurId,
            @Param("dateStart") LocalDate dateStart,
            @Param("dateEnd") LocalDate dateEnd
    );

    @Query("""
        select s from AttendanceSession s
        where s.utilisateurId in :utilisateurIds
          and s.date between :dateStart and :dateEnd
    """)
    List<AttendanceSession> findByUtilisateurIdInAndDateBetween(
            @Param("utilisateurIds") Collection<Long> utilisateurIds,
            @Param("dateStart") LocalDate dateStart,
            @Param("dateEnd") LocalDate dateEnd
    );

    boolean existsByUtilisateurIdAndDate(Long utilisateurId, LocalDate date);

    @Query("""
        select coalesce(sum(s.duration), 0)
        from AttendanceSession s
        where s.utilisateurId = :utilisateurId
          and s.date between :dateStart and :dateEnd
    """)
    Long sumDurationByUtilisateurIdAndDateBetween(
            @Param("utilisateurId") Long utilisateurId,
            @Param("dateStart") LocalDate dateStart,
            @Param("dateEnd") LocalDate dateEnd
    );

    @Query("""
        select coalesce(sum(s.duration), 0)
        from AttendanceSession s
        where s.date between :dateStart and :dateEnd
    """)
    Long sumDurationByDateBetween(
            @Param("dateStart") LocalDate dateStart,
            @Param("dateEnd") LocalDate dateEnd
    );

    @Query("""
        select count(s)
        from AttendanceSession s
        where s.utilisateurId = :utilisateurId
          and s.date between :dateStart and :dateEnd
    """)
    long countByUtilisateurIdAndDateBetween(
            @Param("utilisateurId") Long utilisateurId,
            @Param("dateStart") LocalDate dateStart,
            @Param("dateEnd") LocalDate dateEnd
    );

    @Query("""
        select count(s)
        from AttendanceSession s
        where s.utilisateurId = :utilisateurId
          and s.date between :dateStart and :dateEnd
          and s.lateArrival = true
          and s.checkInTime = (
              select min(innerSession.checkInTime)
              from AttendanceSession innerSession
              where innerSession.utilisateurId = s.utilisateurId
                and innerSession.date = s.date
          )
    """)
    long countLateDaysByUtilisateurIdAndDateBetween(
            @Param("utilisateurId") Long utilisateurId,
            @Param("dateStart") LocalDate dateStart,
            @Param("dateEnd") LocalDate dateEnd
    );

    @Query("""
        select count(distinct s.date)
        from AttendanceSession s
        where s.utilisateurId = :utilisateurId
          and s.date between :dateStart and :dateEnd
    """)
    long countDistinctAttendanceDaysByUtilisateurIdBetween(
            @Param("utilisateurId") Long utilisateurId,
            @Param("dateStart") LocalDate dateStart,
            @Param("dateEnd") LocalDate dateEnd
    );

    @Query("""
        select count(distinct s.utilisateurId)
        from AttendanceSession s
        where s.date between :dateStart and :dateEnd
    """)
    long countDistinctUsersWithSessionsBetween(
            @Param("dateStart") LocalDate dateStart,
            @Param("dateEnd") LocalDate dateEnd
    );
}
