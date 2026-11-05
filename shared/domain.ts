export const jobTypes = {
  FULL_TIME: 'Penuh waktu',
  PART_TIME: 'Paruh waktu',
  CONTRACT: 'Kontrak',
  INTERNSHIP: 'Magang',
} as const;

export const statuses = {
  APPLIED: 'Applied',
  REVIEWING: 'Reviewing',
  SHORTLISTED: 'Shortlisted',
  REJECTED: 'Rejected',
  ACCEPTED: 'Accepted',
} as const;

export type Role = 'JOB_SEEKER' | 'COMPANY';
export type JobType = keyof typeof jobTypes;
export type Status = keyof typeof statuses;

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  jobType: JobType;
  createdAt: string;
  company: { id: string; name: string };
}

export interface HistoryEntry {
  id: number;
  fromStatus: Status | null;
  toStatus: Status;
  changedAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  status: Status;
  appliedAt: string;
  history: HistoryEntry[];
}

export interface Session {
  token: string;
  user: User;
}
