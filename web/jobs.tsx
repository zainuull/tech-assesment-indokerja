import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, ClipboardList, Compass, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { statuses, type Application, type Job, type Session } from '../shared/domain';
import { api, ApiError, errorMessage, useResource } from './api';
import { Back, CompanyMark, date, Empty, Feedback, JobFacts, JobTypeOptions, Pending, StatusBadge } from './ui';

export function CareerMap() {
  return <svg className="career-map" viewBox="0 0 530 280" fill="none" aria-hidden="true">
    <defs>
      <pattern id="map-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 0h24v24" stroke="#b8e4a3" strokeOpacity=".13" /></pattern>
      <linearGradient id="map-line"><stop stopColor="#7eaf89" /><stop offset="1" stopColor="#d9f477" /></linearGradient>
      <radialGradient id="map-glow"><stop stopColor="#a7e184" stopOpacity=".18" /><stop offset="1" stopColor="#a7e184" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="530" height="280" fill="url(#map-grid)" />
    <ellipse cx="325" cy="133" rx="230" ry="145" fill="url(#map-glow)" />
    <g stroke="#a8d4a5" strokeOpacity=".28">
      <circle cx="329" cy="132" r="89" /><circle cx="329" cy="132" r="121" strokeDasharray="4 7" />
      <path d="M18 211h99l35-35h44l45-45h88m0 0 64 63h112m-176-63 49-49h119m-400 18h101l37 37" />
    </g>
    <path d="M78 218h78l45-47h39l89-39 45-51h53" stroke="url(#map-line)" strokeWidth="2" />
    <g fill="#c5e994"><circle cx="78" cy="218" r="4" /><circle cx="201" cy="171" r="5" /><circle cx="427" cy="81" r="5" /></g>
    <circle cx="329" cy="132" r="36" fill="#204d3b" stroke="#b5e26b" />
    <path d="M318 125v-5a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v5m-29 10 11 5h14l11-5m-35-10h34a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3h-34a3 3 0 0 1-3-3v-17a3 3 0 0 1 3-3Z" stroke="#dcf47d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <g fill="#cae3cb" fontFamily="monospace" fontSize="10" letterSpacing="2">
      <text x="65" y="242">MULAI</text><text x="397" y="64">TUJUAN</text>
    </g>
    <path d="M476 219v24h24M476 243l24-24m-10 0h10v10" stroke="#bddba7" strokeOpacity=".6" />
  </svg>;
}

export function JobList() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const resource = useResource<Job[]>(`/jobs${query ? `?${query}` : ''}`);
  const jobs = resource.data;
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const field of ['q', 'location', 'jobType']) {
      const value = String(values.get(field) ?? '').trim();
      if (value) next.set(field, value);
    }
    setParams(next);
    resultsHeading.current?.focus();
  }

  return <>
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-label"><Compass size={15} aria-hidden="true" /> PORTAL KARIER</span>
        <h1>Temukan pekerjaan<br className="desktop-break" /> yang <em>tepat.</em></h1>
        <p>Cari lowongan, kirim lamaran, dan ikuti proses rekrutmen dalam satu tempat.</p>
      </div>
      <CareerMap />
    </section>
    <form key={query} className="search-panel" onSubmit={search} aria-label="Cari lowongan">
      <label>Kata kunci<span className="input-with-icon"><Search size={18} aria-hidden="true" /><input name="q" type="search" placeholder="Jabatan atau perusahaan" defaultValue={params.get('q') ?? ''} maxLength={120} /></span></label>
      <label>Lokasi<span className="input-with-icon"><MapPin size={18} aria-hidden="true" /><input name="location" type="search" placeholder="Kota atau remote" defaultValue={params.get('location') ?? ''} maxLength={120} /></span></label>
      <label>Jenis pekerjaan<select name="jobType" defaultValue={params.get('jobType') ?? ''}><option value="">Semua jenis</option><JobTypeOptions /></select></label>
      <button className="button primary" type="submit"><Search size={18} aria-hidden="true" /> Cari lowongan</button>
    </form>
    <section aria-labelledby="jobs-title" className="results">
      <div className="section-heading">
        <div><div className="eyebrow">BURSA KERJA</div><h2 id="jobs-title" ref={resultsHeading} tabIndex={-1}>Lowongan tersedia</h2></div>
        <div className="result-meta">{query && <Link className="button ghost" to="/"><SlidersHorizontal size={16} aria-hidden="true" /> Reset filter</Link>}
          {jobs && <span className="count" role="status">{jobs.length} lowongan</span>}</div>
      </div>
      {!jobs ? <Pending {...resource} /> : jobs.length === 0 ?
        <Empty title="Lowongan belum ditemukan"><p>{query ? 'Ubah kata kunci atau hapus filter untuk melihat lowongan lain.' : 'Lowongan yang dipublikasikan perusahaan akan muncul di sini.'}</p></Empty> :
        <ul className="job-grid">{jobs.map(job => <li className="job-card" key={job.id}>
          <div className="job-card-head"><CompanyMark name={job.company.name} /><span className="job-company">{job.company.name}</span></div>
          <h3>{job.title}</h3>
          <JobFacts job={job} />
          <div className="card-footer"><Link className="detail-link" aria-label={`Lihat detail ${job.title}`} to={`/lowongan/${job.id}`} state={{ jobSearch: query }}>Lihat detail <ArrowRight size={17} aria-hidden="true" /></Link></div>
        </li>)}</ul>}
    </section>
  </>;
}

export function JobDetail({ session }: { session: Session | null }) {
  const { id } = useParams();
  const { state } = useLocation();
  const resource = useResource<Job>(`/jobs/${id}`);
  return <>
    <Back to={{ pathname: '/', search: state?.jobSearch ? `?${state.jobSearch}` : '' }}>Kembali ke lowongan</Back>
    {resource.data ? <JobDescription job={resource.data} session={session} /> : <Pending {...resource} />}
  </>;
}

function JobDescription({ job, session }: { job: Job; session: Session | null }) {
  const location = useLocation();
  return <>
    <div className="page-heading detail-heading">
      <CompanyMark name={job.company.name} />
      <div><div className="eyebrow">{job.company.name}</div><h1>{job.title}</h1><JobFacts job={job} /></div>
    </div>
    <div className="detail-grid">
      <section className="surface"><h2>Tentang pekerjaan ini</h2><p className="description">{job.description}</p></section>
      <aside className="surface action-panel">
        <div className="eyebrow">LAMARAN</div>
        <h2>Lamar pekerjaan ini</h2>
        {!session ? <><p>Masuk sebagai Pencari Kerja untuk mengirim lamaran.</p>
          <Link className="button primary" to="/masuk" state={{ fromJob: location.pathname, jobSearch: location.state?.jobSearch }}>Masuk untuk melamar</Link></> :
          session.user.role === 'JOB_SEEKER' ? <Apply job={job} token={session.token} /> :
          <p>Lowongan ini dapat dilamar oleh akun Pencari Kerja.</p>}
      </aside>
    </div>
  </>;
}

function Apply({ job, token }: { job: Job; token: string }) {
  const resource = useResource<Application[]>('/applications/me', token);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [message, setMessage] = useState('');
  const existing = resource.data?.some(item => item.jobId === job.id);

  async function apply() {
    setBusy(true);
    setMessage('');
    try {
      await api(`/jobs/${job.id}/applications`, { method: 'POST', token });
      setApplied(true);
      setMessage('Lamaran berhasil dikirim.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ALREADY_APPLIED') setApplied(true);
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (applied || existing) return <><Feedback kind="success">{message || 'Kamu sudah melamar lowongan ini.'}</Feedback>
    <Link className="button secondary" to="/lamaran">Lihat lamaran saya <ArrowRight size={17} aria-hidden="true" /></Link></>;
  if (!resource.data) return <Pending {...resource} />;
  return <><p>Lamaran akan dikirim menggunakan akun Pencari Kerja kamu.</p>
    {message && <Feedback>{message}</Feedback>}
    <button className="button primary" type="button" disabled={busy} onClick={apply}>{busy ? 'Mengirim…' : 'Lamar sekarang'} <ArrowRight size={17} aria-hidden="true" /></button></>;
}

export function MyApplications({ token }: { token: string }) {
  const resource = useResource<(Application & { job: Job })[]>('/applications/me', token);
  return <>
    <div className="page-heading"><div className="eyebrow"><ClipboardList size={17} aria-hidden="true" /> PENCARI KERJA</div><h1>Lamaran saya</h1><p>Lihat status terbaru dan riwayat proses seleksi setiap lamaran.</p></div>
    {!resource.data ? <Pending {...resource} /> : resource.data.length === 0 ?
      <Empty title="Belum ada lamaran"><p>Lowongan yang kamu lamar akan muncul di sini.</p><Link className="button primary" to="/">Jelajahi lowongan</Link></Empty> :
      <ul className="stack">{resource.data.map(application => <li key={application.id} className="surface application-card">
        <div className="application-head"><CompanyMark name={application.job.company.name} /><div>
          <div className="job-company">{application.job.company.name}</div>
          <h2><Link to={`/lowongan/${application.job.id}`}>{application.job.title}</Link></h2>
          <p>Dilamar <time dateTime={application.appliedAt}>{date(application.appliedAt)}</time></p>
        </div><StatusBadge status={application.status} /></div>
        <details><summary>Riwayat status <span className="count">{application.history.length}</span></summary>
          <ol className="timeline">{application.history.map(entry => <li key={entry.id}><strong>{entry.fromStatus ? `${statuses[entry.fromStatus]} → ` : ''}{statuses[entry.toStatus]}</strong>
            <time dateTime={entry.changedAt}>{date(entry.changedAt)}</time></li>)}</ol>
        </details>
      </li>)}</ul>}
  </>;
}
