package com.weentime.weentimeapp.mapper;

import com.weentime.weentimeapp.dto.*;
import com.weentime.weentimeapp.entity.Application;
import com.weentime.weentimeapp.entity.JobPosting;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

import java.util.List;

@Mapper(componentModel = "spring")
public interface RecruitmentMapper {

    JobPostingDTO toDto(JobPosting entity);
    
    List<JobPostingDTO> toJobDtoList(List<JobPosting> entities);
    
    @Mapping(target = "jobPostingId", source = "jobPosting.id")
    @Mapping(target = "jobTitle", source = "jobPosting.title")
    ApplicationDTO toDto(Application entity);
    
    List<ApplicationDTO> toAppDtoList(List<Application> entities);
    
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "entrepriseId", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "publishedAt", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    JobPosting toEntity(JobCreateRequest request);
}
