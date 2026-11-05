import { useState, type FormEvent } from 'react';
import { ArrowRight, BriefcaseBusiness, Building2, ClipboardCheck, Inbox, Plus, Users } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { statuses, type Job, type OwnedJob, type Status } from '../shared/domain';
import { api, ApiError, errorMessage, useResource } from './api';
import { Back, Empty, Feedback, Field, fieldProps, JobFacts, JobStateBadge, JobTypeOptions, Pending } from './ui';
import { pipelineUrl } from './pipeline';

export function CompanyDashboard() {
  const resource = useResource<OwnedJob[]>('/jobs/mine');
  const { state } = useLocation();
  const jobs = resource.data;

  function total(stage: Status) {
    return jobs?.reduce((sum, job) => sum + (job.stageCounts[stage] ?? 0), 0);
  }

  return <>
    <div className="recruitment-hero">
      <div><div className="hero-label"><Building2 size={15} aria-hidden="true" /> RUANG REKRUTMEN</div>
        <h1>Dashboard perusahaan</h1><p>Kelola lowongan dan lihat lamaran yang perlu ditindaklanjuti.</p></div>
      <Link className="button" to="/perusahaan/baru"><Plus size={19} aria-hidden="true" /> Buat lowongan</Link>
    </div>
    {state?.notice && <div className="session-notice"><Feedback kind="success">{state.notice}</Feedback></div>}
    {!jobs ? <Pending {...resource} /> : <>
      <section className="dashboard-stats" aria-label="Ringkasan rekrutmen">
        <div className="stat surface"><span className="company-mark tone-0"><BriefcaseBusiness size={22} aria-hidden="true" /></span>
          <div>Lowongan terbuka<strong>{jobs.filter(job => job.state === 'OPEN').length}</strong></div></div>
        <Link className="stat surface stat-link" to={pipelineUrl(undefined, 'APPLIED')}>
          <span className="company-mark tone-2"><Inbox size={22} aria-hidden="true" /></span><div>Lamaran baru<strong>{total('APPLIED')}</strong></div><ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link className="stat surface stat-link" to={pipelineUrl(undefined, 'SHORTLISTED')}>
          <span className="company-mark tone-1"><ClipboardCheck size={22} aria-hidden="true" /></span><div>Menunggu keputusan<strong>{total('SHORTLISTED')}</strong></div><ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>
      <div className="section-heading"><h2>Lowongan saya</h2><Link className="button secondary" to={pipelineUrl()}><Users size={17} aria-hidden="true" /> Semua kandidat</Link></div>
      {jobs.length === 0 ? <Empty title="Belum ada lowongan"><p>Buat lowongan pertama untuk mulai menerima lamaran.</p><Link className="button primary" to="/perusahaan/baru">Buat lowongan</Link></Empty> :
        <ul className="stack">{jobs.map(job => <li className="surface owned-job" key={job.id}>
          <div>
            <div className="inline-actions"><h3>{job.title}</h3><JobStateBadge state={job.state} /></div>
            <JobFacts job={job} />
            {job._count.applications > 0 && <div className="job-stage-links" aria-label={`Tahap kandidat ${job.title}`}>
              {(Object.keys(statuses) as Status[]).filter(stage => job.stageCounts[stage]).map(stage =>
                <Link className="count" key={stage} to={pipelineUrl(job.id, stage)}>{statuses[stage]} · {job.stageCounts[stage]}</Link>)}
            </div>}
          </div>
          <div className="inline-actions">
            <Link className="button ghost" aria-label={`Kelola lowongan ${job.title}`} to={`/perusahaan/lowongan/${job.id}/edit`}>Kelola</Link>
            <Link className="button secondary" to={pipelineUrl(job.id)} aria-label={`Lihat kandidat ${job.title} (${job._count.applications})`}>
              <Users size={17} aria-hidden="true" /> {job._count.applications} kandidat <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </li>)}</ul>}
    </>}
  </>;
}

export function EditJob() {
  const { id } = useParams();
  const resource = useResource<Job>(`/jobs/${id}/manage`);
  return resource.data ? <JobForm key={id} existing={resource.data} />
    : <><Back to="/perusahaan">Dashboard perusahaan</Back><Pending {...resource} /></>;
}

export function JobForm({ existing }: { existing?: Job }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const draft = !existing && submitter?.getAttribute('value') === 'DRAFT';
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const body = { ...data, salaryMin: Number(data.salaryMin), salaryMax: Number(data.salaryMax) };
    setBusy(true);
    setError('');
    setFields({});
    try {
      const job = existing
        ? await api<Job>(`/jobs/${existing.id}`, { method: 'PATCH', body })
        : await api<Job>('/jobs', { method: 'POST', body: { ...body, state: draft ? 'DRAFT' : 'OPEN' } });
      if (existing || draft) {
        navigate('/perusahaan', { replace: true, state: { notice: existing ? 'Perubahan lowongan tersimpan.' : 'Draf lowongan tersimpan.' } });
      } else {
        navigate(`/perusahaan/lowongan/${job.id}/kandidat`, { replace: true, state: { created: true } });
      }
    } catch (error) {
      if (error instanceof ApiError) setFields(error.fields);
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function changeState(state: 'OPEN' | 'CLOSED') {
    if (!existing || dirty) return;
    setBusy(true);
    setError('');
    try {
      await api<Job>(`/jobs/${existing.id}/state`, { method: 'PATCH', body: { state } });
      const notice = state === 'CLOSED' ? 'Lowongan ditutup.' : 'Lowongan dipublikasikan.';
      navigate('/perusahaan', { replace: true, state: { notice } });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Back to="/perusahaan">Dashboard perusahaan</Back>
    <div className="page-heading"><div className="eyebrow">PERUSAHAAN</div><h1>{existing ? 'Edit lowongan' : 'Buat lowongan'}</h1>
      <p>{existing ? existing.title : 'Isi detail lowongan untuk menyimpannya sebagai draf atau langsung memublikasikannya.'}</p></div>
    {error && <div className="session-notice"><Feedback>{error}</Feedback></div>}
    <div className={existing ? 'job-editor' : undefined}>
    <form className="surface form job-form" onSubmit={submit} onChange={() => { setDirty(true); setConfirmClose(false); }}>
      <Field name="title" label="Judul lowongan" error={fields.title}><input {...fieldProps('title', fields)} defaultValue={existing?.title} maxLength={120} placeholder="Contoh: Frontend Developer" /></Field>
      <div className="form-grid">
        <Field name="location" label="Lokasi" error={fields.location}><input {...fieldProps('location', fields)} defaultValue={existing?.location} maxLength={120} placeholder="Contoh: Jakarta Selatan" /></Field>
        <Field name="jobType" label="Jenis pekerjaan" error={fields.jobType}><select {...fieldProps('jobType', fields)} defaultValue={existing?.jobType ?? ""}><option value="" disabled>Pilih jenis pekerjaan</option><JobTypeOptions /></select></Field>
      </div>
      <fieldset><legend>Gaji bulanan (rupiah)</legend><div className="form-grid">
        <Field name="salaryMin" label="Gaji minimum" error={fields.salaryMin}><input {...fieldProps('salaryMin', fields)} defaultValue={existing?.salaryMin} type="number" min="0" max="2147483647" step="1" placeholder="8000000" /></Field>
        <Field name="salaryMax" label="Gaji maksimum" error={fields.salaryMax}><input {...fieldProps('salaryMax', fields)} defaultValue={existing?.salaryMax} type="number" min="0" max="2147483647" step="1" placeholder="12000000" /></Field>
      </div></fieldset>
      <Field name="description" label="Deskripsi pekerjaan" error={fields.description}><textarea {...fieldProps('description', fields)} defaultValue={existing?.description} rows={7} maxLength={6000} placeholder="Jelaskan tanggung jawab dan kualifikasi untuk posisi ini." /></Field>
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={busy || confirmClose}>{busy ? 'Memproses…' : existing ? 'Simpan perubahan' : 'Publikasikan lowongan'}</button>
        {!existing && <button className="button secondary" type="submit" value="DRAFT" disabled={busy}>Simpan draf</button>}
        <Link className="button ghost" to="/perusahaan">Batal</Link>
      </div>
    </form>
    {existing && <aside className="surface lifecycle">
      <h2>Status lowongan</h2><JobStateBadge state={existing.state} />
      <p>{existing.state === 'DRAFT' ? 'Draf hanya terlihat oleh perusahaanmu.' : existing.state === 'OPEN' ? 'Pencari kerja dapat mengirim lamaran.' : 'Lamaran sebelumnya masih tersedia di pipeline.'}</p>
      <p>Simpan perubahan formulir terlebih dahulu sebelum mengubah status lowongan.</p>
      {existing.state === 'OPEN' ? confirmClose ?
        <div className="close-confirm">
          <p>Menutup lowongan menghentikan lamaran baru.</p>
          <button autoFocus className="button secondary" type="button" disabled={busy} onClick={() => setConfirmClose(false)}>Batal tutup</button>
          <button className="button danger" type="button" disabled={busy} onClick={() => changeState('CLOSED')}>Konfirmasi tutup</button>
        </div> : <button className="button danger" type="button" disabled={busy || dirty} onClick={() => setConfirmClose(true)}>Tutup lowongan</button>
        : <button className="button primary" type="button" disabled={busy || dirty} onClick={() => changeState('OPEN')}>{existing.state === 'DRAFT' ? 'Publikasikan draf' : 'Buka kembali'}</button>}
      <Link className="button ghost" to={pipelineUrl(existing.id)}>Lihat pipeline <ArrowRight size={16} aria-hidden="true" /></Link>
    </aside>}
    </div>
  </>;
}
