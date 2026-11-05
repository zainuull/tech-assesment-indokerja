import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, BriefcaseBusiness, Building2, Plus, Users } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { statuses, type Application, type Job, type Status } from '../shared/domain';
import { api, ApiError, errorMessage, useResource } from './api';
import { Back, date, Empty, Feedback, JobFacts, JobTypeOptions, Pending, StatusBadge } from './ui';

type OwnedJob = Job & { _count: { applications: number } };
type Candidate = Pick<Application, 'id' | 'status' | 'appliedAt'> & { seeker: { name: string; email: string } };

export function CompanyDashboard({ token }: { token: string }) {
  const resource = useResource<OwnedJob[]>('/jobs/mine', token);
  const jobs = resource.data;
  return <>
    <div className="page-heading heading-with-action"><div><div className="eyebrow"><Building2 size={17} aria-hidden="true" /> PERUSAHAAN</div>
      <h1>Dashboard perusahaan</h1><p>Publikasikan lowongan dan kelola kandidat yang melamar.</p></div>
      <Link className="button primary" to="/perusahaan/baru"><Plus size={19} aria-hidden="true" /> Buat lowongan</Link>
    </div>
    {!jobs ? <Pending {...resource} /> : <>
      <div className="stats">
        <div className="stat surface"><span className="company-mark tone-0"><BriefcaseBusiness size={22} aria-hidden="true" /></span><div>Lowongan dipublikasikan<strong>{jobs.length}</strong></div></div>
        <div className="stat surface"><span className="company-mark tone-1"><Users size={22} aria-hidden="true" /></span><div>Total lamaran masuk<strong>{jobs.reduce((sum, job) => sum + job._count.applications, 0)}</strong></div></div>
      </div>
      <div className="section-heading"><h2>Lowongan saya</h2></div>
      {jobs.length === 0 ? <Empty title="Belum ada lowongan"><p>Buat lowongan pertama untuk mulai menerima lamaran.</p><Link className="button primary" to="/perusahaan/baru">Buat lowongan</Link></Empty> :
        <ul className="stack">{jobs.map(job => <li className="surface owned-job" key={job.id}>
          <div><h3>{job.title}</h3><JobFacts job={job} /></div>
          <Link className="button secondary" to={`/perusahaan/lowongan/${job.id}/kandidat`} aria-label={`Lihat kandidat ${job.title} (${job._count.applications})`}>
            <Users size={17} aria-hidden="true" /> {job._count.applications} kandidat <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </li>)}</ul>}
    </>}
  </>;
}

export function Field({ name, label, error, children }: { name: string; label: string; error?: string; children: ReactNode }) {
  return <div className="field"><label htmlFor={name}>{label}</label>{children}{error && <span className="field-error" id={`${name}-error`}>{error}</span>}</div>;
}

export function fieldProps(name: string, errors: Record<string, string>) {
  return { id: name, name, required: true, 'aria-invalid': !!errors[name], 'aria-describedby': errors[name] ? `${name}-error` : undefined };
}

export function JobForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const body = { ...data, salaryMin: Number(data.salaryMin), salaryMax: Number(data.salaryMax) };
    setBusy(true);
    setError('');
    setFields({});
    try {
      const job = await api<Job>('/jobs', { method: 'POST', token, body });
      navigate(`/perusahaan/lowongan/${job.id}/kandidat`, { replace: true, state: { created: true } });
    } catch (error) {
      if (error instanceof ApiError) setFields(error.fields);
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Back to="/perusahaan">Dashboard perusahaan</Back>
    <div className="page-heading"><div className="eyebrow">PERUSAHAAN</div><h1>Buat lowongan</h1><p>Isi informasi yang dibutuhkan pencari kerja sebelum melamar.</p></div>
    <form className="surface form job-form" onSubmit={submit}>
      {error && <Feedback>{error}</Feedback>}
      <Field name="title" label="Judul lowongan" error={fields.title}><input {...fieldProps('title', fields)} maxLength={120} placeholder="Contoh: Frontend Developer" /></Field>
      <div className="form-grid">
        <Field name="location" label="Lokasi" error={fields.location}><input {...fieldProps('location', fields)} maxLength={120} placeholder="Contoh: Jakarta Selatan" /></Field>
        <Field name="jobType" label="Jenis pekerjaan" error={fields.jobType}><select {...fieldProps('jobType', fields)} defaultValue=""><option value="" disabled>Pilih jenis pekerjaan</option><JobTypeOptions /></select></Field>
      </div>
      <fieldset><legend>Gaji bulanan (rupiah)</legend><div className="form-grid">
        <Field name="salaryMin" label="Gaji minimum" error={fields.salaryMin}><input {...fieldProps('salaryMin', fields)} type="number" min="0" max="2147483647" step="1" placeholder="8000000" /></Field>
        <Field name="salaryMax" label="Gaji maksimum" error={fields.salaryMax}><input {...fieldProps('salaryMax', fields)} type="number" min="0" max="2147483647" step="1" placeholder="12000000" /></Field>
      </div></fieldset>
      <Field name="description" label="Deskripsi pekerjaan" error={fields.description}><textarea {...fieldProps('description', fields)} rows={7} maxLength={6000} placeholder="Jelaskan tanggung jawab dan kualifikasi untuk posisi ini." /></Field>
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? 'Mempublikasikan…' : 'Publikasikan lowongan'}</button><Link className="button ghost" to="/perusahaan">Batal</Link></div>
    </form>
  </>;
}

export function Candidates({ token }: { token: string }) {
  const { id } = useParams();
  const { state } = useLocation();
  const resource = useResource<Job & { applications: Candidate[] }>(`/jobs/${id}/applications`, token);
  const job = resource.data;
  return <>
    <Back to="/perusahaan">Dashboard perusahaan</Back>
    {!job ? <Pending {...resource} /> : <>
      <div className="page-heading"><div className="eyebrow"><Users size={17} aria-hidden="true" /> KANDIDAT</div><h1>{job.title}</h1><JobFacts job={job} /></div>
      {state?.created && <Feedback kind="success">Lowongan berhasil dipublikasikan.</Feedback>}
      <div className="section-heading"><h2>Daftar kandidat</h2><span className="count">{job.applications.length} kandidat</span></div>
      {job.applications.length === 0 ? <Empty title="Belum ada kandidat"><p>Lamaran yang masuk untuk lowongan ini akan tampil di sini.</p><Link className="button secondary" to={`/lowongan/${job.id}`}>Lihat lowongan <ArrowRight size={17} aria-hidden="true" /></Link></Empty> :
        <ul className="stack">{job.applications.map(candidate => <li className="surface candidate" key={candidate.id}><CandidateRow candidate={candidate} token={token} /></li>)}</ul>}
    </>}
  </>;
}

function CandidateRow({ candidate, token }: { candidate: Candidate; token: string }) {
  const [current, setCurrent] = useState(candidate.status);
  const [selected, setSelected] = useState(candidate.status);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; kind: 'error' | 'success' }>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await api<Application>(`/applications/${candidate.id}/status`, { method: 'PATCH', token, body: { status: selected } });
      setCurrent(result.status);
      setSelected(result.status);
      setNotice({ message: `Status tersimpan sebagai ${statuses[result.status]}.`, kind: 'success' });
    } catch (error) {
      setNotice({ message: errorMessage(error), kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="candidate-info"><h3>{candidate.seeker.name}</h3><p>{candidate.seeker.email}</p>
      <p>Dilamar <time dateTime={candidate.appliedAt}>{date(candidate.appliedAt)}</time></p><StatusBadge status={current} /></div>
    <form className="candidate-form" onSubmit={submit}>
      <label htmlFor={`status-${candidate.id}`}>Status kandidat <span className="sr-only">{candidate.seeker.name}</span></label>
      <div className="candidate-controls"><select id={`status-${candidate.id}`} value={selected} disabled={busy}
        onChange={event => { setSelected(event.target.value as Status); setNotice(undefined); }}>
        {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select><button className="button primary" type="submit" disabled={busy || selected === current}>{busy ? 'Menyimpan…' : 'Ubah status'}</button></div>
      {notice && <Feedback kind={notice.kind}>{notice.message}</Feedback>}
    </form>
  </>;
}
