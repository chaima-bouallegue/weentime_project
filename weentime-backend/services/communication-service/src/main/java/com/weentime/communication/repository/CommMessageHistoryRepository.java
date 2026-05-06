package com.weentime.communication.repository;

import com.weentime.communication.entity.CommMessageHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CommMessageHistoryRepository extends JpaRepository<CommMessageHistory, UUID> {
}
