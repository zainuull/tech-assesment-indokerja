import type { ReactNode } from 'react';
import { AlertCircle, ArrowLeft, BriefcaseBusiness, Building2, CircleCheck, Clock3, MapPin, Wallet } from 'lucide-react';
import { Link, type To } from 'react-router-dom';
import { jobTypes, statuses, type Job, type Status } from '../shared/domain';

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const moneyFormat = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
export const date = (value: string) => dateFormat.format(new Date(value));
export const salary = (job: Job) => job.salaryMin === job.salaryMax
  ? moneyFormat.format(job.salaryMin)
  : `${moneyFormat.format(job.salaryMin)} – ${moneyFormat.format(job.salaryMax)}`;

export function Brand() {
  return <><img src="/indokerja.svg" alt="" width="38" height="38" /><span>Indo<span className="brand-accent">Kerja</span><small>.id</small></span></>;
}

export function CompanyMark({ name }: { name: string }) {
  const tone = (name.codePointAt(0) ?? 0) % 4;
  return <span className={`company-mark tone-${tone}`} aria-hidden="true"><Building2 size={23} /></span>;
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}><span aria-hidden="true" />{statuses[status]}</span>;
}

export function Feedback({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'success' }) {
  const Icon = kind === 'error' ? AlertCircle : CircleCheck;
  return <div className={`feedback ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon size={19} aria-hidden="true" /><div>{children}</div></div>;
}

export function Pending({ error, reload }: { error?: string; reload: () => void }) {
  if (error) return <Feedback>{error} <button className="text-action" type="button" onClick={reload}>Coba lagi</button></Feedback>;
  return <div className="pending" role="status"><Clock3 size={19} aria-hidden="true" /> Sedang memuat…</div>;
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><BriefcaseBusiness size={24} aria-hidden="true" /></span><h2>{title}</h2><div>{children}</div></div>;
}

export function Back({ to, children }: { to: To; children: ReactNode }) {
  return <Link className="back" to={to}><ArrowLeft size={17} aria-hidden="true" />{children}</Link>;
}

export function JobFacts({ job }: { job: Job }) {
  return <ul className="job-facts" aria-label="Informasi lowongan">
    <li><MapPin size={17} aria-hidden="true" />{job.location}</li>
    <li><BriefcaseBusiness size={17} aria-hidden="true" />{jobTypes[job.jobType]}</li>
    <li className="salary"><Wallet size={17} aria-hidden="true" />{salary(job)}<span className="salary-unit">/ bulan</span></li>
  </ul>;
}

export function JobTypeOptions() {
  return <>{Object.entries(jobTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</>;
}
