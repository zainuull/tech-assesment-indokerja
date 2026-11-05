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

export const jobStates = {
  DRAFT: 'Draf',
  OPEN: 'Terbuka',
  CLOSED: 'Ditutup',
} as const;

export const statusDescriptions = {
  APPLIED: 'Lamaran sudah diterima dan menunggu peninjauan.',
  REVIEWING: 'Perusahaan sedang meninjau lamaranmu.',
  SHORTLISTED: 'Perusahaan memasukkan lamaranmu ke daftar pendek untuk dipertimbangkan lebih lanjut.',
  REJECTED: 'Perusahaan memutuskan untuk tidak melanjutkan lamaran ini.',
  ACCEPTED: 'Perusahaan menandai lamaranmu sebagai diterima.',
} as const;

export type JobState = keyof typeof jobStates;
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
  state: JobState;
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

export type OwnedJob = Job & {
  _count: { applications: number };
  stageCounts: Partial<Record<Status, number>>;
};

export type Candidate = Pick<Application, 'id' | 'status' | 'appliedAt'> & {
  seeker: { name: string; email: string };
  job: Pick<Job, 'id' | 'title'>;
};

export interface CandidateNote {
  id: number;
  body: string;
  createdAt: string;
}

export type CandidateDetail = Candidate & Pick<Application, 'history'> & { notes: CandidateNote[] };
