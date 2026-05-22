import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiConfigService } from '../../../../core/services/api-config.service';

export interface JobPosting {
  id: number;
  title: string;
  entrepriseName?: string;
  department: string;
  employmentType: string;
  experienceLevel: string;
  minExperienceYears: number;
  requiredSkills: string;
  soft_skills?: string;
  description: string;
  responsibilities: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  workMode: string;
  location: string;
  deadline?: string;
  openingsCount: number;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';
  publishedAt?: string;
  createdAt: string;
}

export interface Application {
  id: number;
  jobPostingId: number;
  jobTitle: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  cvOriginalFilename: string;
  status: 'APPLIED' | 'AI_ANALYZING' | 'AI_ANALYZED' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'INTERVIEW_SCHEDULED' | 'INTERVIEWED' | 'OFFER_SENT' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';
  rejectionReason?: string;
  submittedAt: string;
  // IA Matching — Enrichi
  aiOverallScore?: number;
  aiTechnicalScore?: number;
  aiExperienceScore?: number;
  aiCompetenceScore?: number;
  aiRecommendation?: string;
  aiRecommendationSummary?: string;
  aiPointsForts?: string;       // JSON array string
  aiPointsFaibles?: string;     // JSON array string
  aiCompetencesTrouvees?: string;   // JSON array string
  aiCompetencesManquantes?: string; // JSON array string
  aiExperienceDetectee?: number;
  aiNiveauConfiance?: number;
  aiStatus: string;
}

@Injectable({
  providedIn: 'root'
})
export class RecrutementService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  // --- RH Methods ---

  getJobs(): Observable<JobPosting[]> {
    return this.http.get<any>(this.api.RECRUTEMENT.GET_JOBS).pipe(
      map(res => res.data || res)
    );
  }

  getJob(id: number): Observable<JobPosting> {
    return this.http.get<any>(this.api.RECRUTEMENT.GET_JOB_BY_ID(id)).pipe(
      map(res => res.data || res)
    );
  }

  createJob(job: Partial<JobPosting>): Observable<JobPosting> {
    return this.http.post<any>(this.api.RECRUTEMENT.CREATE_JOB, job).pipe(
      map(res => res.data || res)
    );
  }

  updateJob(id: number, job: Partial<JobPosting>): Observable<JobPosting> {
    return this.http.put<any>(this.api.RECRUTEMENT.UPDATE_JOB(id), job).pipe(
      map(res => res.data || res)
    );
  }

  publishJob(id: number): Observable<JobPosting> {
    return this.http.post<any>(this.api.RECRUTEMENT.PUBLISH_JOB(id), {}).pipe(
      map(res => res.data || res)
    );
  }

  closeJob(id: number): Observable<JobPosting> {
    return this.http.post<any>(this.api.RECRUTEMENT.CLOSE_JOB(id), {}).pipe(
      map(res => res.data || res)
    );
  }

  deleteJob(id: number): Observable<void> {
    return this.http.delete<any>(this.api.RECRUTEMENT.DELETE_JOB(id)).pipe(
      map(res => res.data || res)
    );
  }

  getApplications(jobId: number): Observable<Application[]> {
    return this.http.get<any>(this.api.RECRUTEMENT.GET_APPLICATIONS(jobId)).pipe(
      map(res => res.data || res)
    );
  }

  updateApplicationStatus(id: number, status: string, reason?: string): Observable<Application> {
    return this.http.patch<any>(this.api.RECRUTEMENT.UPDATE_APP_STATUS(id), null, {
      params: { status, reason: reason || '' }
    }).pipe(
      map(res => res.data || res)
    );
  }

  getApplicationCv(id: number): Observable<Blob> {
    return this.http.get(this.api.RECRUTEMENT.GET_APP_CV(id), {
      responseType: 'blob'
    });
  }

  // --- Public Methods ---

  getPublicJobs(company?: string): Observable<JobPosting[]> {
    const url = this.api.RECRUTEMENT.GET_PUBLIC_JOBS + (company ? `?company=${company}` : '');
    return this.http.get<any>(url).pipe(
      map(res => res.data || res)
    );
  }

  getPublicJob(id: number): Observable<JobPosting> {
    return this.http.get<any>(this.api.RECRUTEMENT.GET_PUBLIC_JOB_BY_ID(id)).pipe(
      map(res => res.data || res)
    );
  }

  submitApplication(jobId: number, data: any, cv: File): Observable<Application> {
    const formData = new FormData();
    formData.append('data', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    formData.append('cv', cv);

    return this.http.post<any>(this.api.RECRUTEMENT.SUBMIT_APPLICATION(jobId), formData).pipe(
      map(res => res.data || res)
    );
  }
}
