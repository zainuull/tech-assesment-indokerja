import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ListFilter, Search, StickyNote, Users } from 'lucide-react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { statuses, type Application, type Candidate, type CandidateDetail, type CandidateNote, type Job, type Status } from '../shared/domain';
import { api, ApiError, errorMessage, useResource } from './api';
import { Back, date, Empty, Feedback, Field, fieldProps, JobFacts, JobStateBadge, Pending, StageTimeline, StatusBadge } from './ui';

const stages = Object.keys(statuses) as Status[];
const stageHelp: Record<Status, string> = {
  APPLIED: 'Lamaran baru',
  REVIEWING: 'Sedang ditinjau',
  SHORTLISTED: 'Menunggu keputusan',
  REJECTED: 'Seleksi berhenti',
  ACCEPTED: 'Kandidat diterima',
};

export function pipelineUrl(jobId?: string, status?: Status) {
  const path = jobId ? `/perusahaan/lowongan/${jobId}/kandidat` : '/perusahaan/kandidat';
  return status ? `${path}?status=${status}` : path;
}

function StatusOptions() {
  return <>{stages.map(stage => <option value={stage} key={stage}>{statuses[stage]}</option>)}</>;
}

export function Candidates() {
  const { id } = useParams();
  const { state } = useLocation();
  const resource = useResource<(Job & { applications: Candidate[] }) | Candidate[]>(
    id ? `/jobs/${id}/applications` : '/applications/company',
  );
  const result = resource.data;
  const job = result && !Array.isArray(result) ? result : undefined;
  const candidates = Array.isArray(result) ? result : job?.applications;

  return <>
    <Back to="/perusahaan">Dashboard perusahaan</Back>
    <div className="page-heading heading-with-action">
      <div><div className="eyebrow"><Users size={17} aria-hidden="true" /> REKRUTMEN</div>
        <h1>Pipeline kandidat</h1>
        {job ? <><div className="pipeline-job"><h2>{job.title}</h2><JobStateBadge state={job.state} /></div><JobFacts job={job} /></>
          : !id && <p>Kelola lamaran dari seluruh lowongan perusahaanmu.</p>}
      </div>
      {job && <Link className="button secondary" to={`/perusahaan/lowongan/${job.id}/edit`}>Kelola lowongan</Link>}
    </div>
    {state?.created && <div className="session-notice"><Feedback kind="success">Lowongan berhasil dipublikasikan.</Feedback></div>}
    {candidates ? <Pipeline candidates={candidates} job={job} /> : <Pending {...resource} />}
  </>;
}

function Pipeline({ candidates, job }: { candidates: Candidate[]; job?: Job }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [updates, setUpdates] = useState<Record<string, Status>>({});
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const query = params.get('q') ?? '';
  const stage = stages.find(value => value === params.get('status'));
  const filtered = candidates
    .map(candidate => ({ ...candidate, status: updates[candidate.id] ?? candidate.status }))
    .filter(candidate => (!stage || candidate.status === stage) && candidate.seeker.name.toLowerCase().includes(query.toLowerCase()));
  const visibleStages = stage ? [stage] : stages;

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const name = String(form.get('q') ?? '').trim();
    const status = String(form.get('status') ?? '');
    if (name) next.set('q', name);
    if (status) next.set('status', status);
    setNotice('');
    setParams(next);
    heading.current?.focus();
  }

  return <>
    <form key={params.toString()} className="surface pipeline-filters" onSubmit={filter} aria-label="Filter kandidat">
      <label>Nama kandidat<span className="input-with-icon"><Search size={18} aria-hidden="true" />
        <input type="search" name="q" defaultValue={query} placeholder="Cari nama kandidat" maxLength={120} />
      </span></label>
      <label>Status kandidat<select name="status" defaultValue={stage ?? ''}><option value="">Semua status</option><StatusOptions /></select></label>
      <button className="button primary" type="submit"><ListFilter size={17} aria-hidden="true" /> Terapkan filter</button>
      {(query || stage) && <Link className="button ghost" to={pipelineUrl(job?.id)} onClick={() => { setNotice(''); heading.current?.focus(); }}>Reset filter</Link>}
    </form>
    <div className="section-heading">
      <div><div className="eyebrow">PROSES SELEKSI</div><h2 ref={heading} tabIndex={-1}>Tahap kandidat</h2></div>
      <span className="count" role="status">{filtered.length} kandidat{filtered.length !== candidates.length ? ` dari ${candidates.length}` : ''}</span>
    </div>
    {notice && <div className="session-notice"><Feedback kind="success">{notice}</Feedback></div>}
    {filtered.length === 0 ? <Empty title={stage || query ? 'Kandidat tidak ditemukan' : 'Belum ada kandidat'}>
      <p>{stage || query ? 'Ubah atau reset filter untuk melihat kandidat lain.' : 'Lamaran baru akan muncul di pipeline ini.'}</p>
      {job?.state === 'OPEN' && !stage && !query && <Link className="button secondary" to={`/lowongan/${job.id}`}>Lihat lowongan <ArrowRight size={17} aria-hidden="true" /></Link>}
    </Empty> :
      <div className={`pipeline-board${stage ? ' filtered' : ''}`}>{visibleStages.map(value => {
        const members = filtered.filter(candidate => candidate.status === value);
        return <section key={value} className={`pipeline-stage pipeline-${value.toLowerCase()}`} aria-labelledby={`stage-${value}`}>
          <header>
            <div className="stage-title"><h3 id={`stage-${value}`}>{statuses[value]}</h3><span className="count">{members.length}</span></div>
            <p>{stageHelp[value]}</p>
          </header>
          {members.length ? <ul>{members.map(candidate => <li className="pipeline-card" key={candidate.id}>
            <h4><Link to={`/perusahaan/kandidat/${candidate.id}`} state={{ pipeline: location.pathname + location.search }}>{candidate.seeker.name}</Link></h4>
            {!job && <p>{candidate.job.title}</p>}
            <p>Dilamar <time dateTime={candidate.appliedAt}>{date(candidate.appliedAt)}</time></p>
            <StatusForm candidate={candidate} onSaved={application => {
              setUpdates(previous => ({ ...previous, [candidate.id]: application.status }));
              setNotice(`${candidate.seeker.name} dipindahkan ke ${statuses[application.status]}.`);
              heading.current?.focus();
            }} />
          </li>)}</ul> : <p className="stage-empty">Belum ada kandidat.</p>}
        </section>;
      })}</div>}
  </>;
}

function StatusForm({ candidate, onSaved }: {
  candidate: Candidate; onSaved: (application: Application) => void;
}) {
  const [selected, setSelected] = useState(candidate.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputId = `status-${candidate.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<Application>(`/applications/${candidate.id}/status`, { method: 'PATCH', body: { status: selected } });
      setSelected(result.status);
      onSaved(result);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <form className="candidate-form" onSubmit={submit}>
    <label htmlFor={inputId}>Status <span className="sr-only">{candidate.seeker.name}</span></label>
    <div className="candidate-controls">
      <select id={inputId} value={selected} disabled={busy} onChange={event => { setSelected(event.target.value as Status); setError(''); }}><StatusOptions /></select>
      <button className="button secondary" type="submit" disabled={busy || selected === candidate.status}>{busy ? 'Menyimpan…' : 'Ubah status'}</button>
    </div>
    {error && <Feedback>{error}</Feedback>}
  </form>;
}

export function CandidatePage() {
  const { applicationId } = useParams();
  const resource = useResource<CandidateDetail>(`/applications/${applicationId}`);
  return resource.data ? <CandidateProfile key={applicationId} candidate={resource.data} /> :
    <><Back to={pipelineUrl()}>Pipeline kandidat</Back><Pending {...resource} /></>;
}

function CandidateProfile({ candidate }: { candidate: CandidateDetail }) {
  const { state } = useLocation();
  const [current, setCurrent] = useState(candidate);
  const [statusNotice, setStatusNotice] = useState('');
  const [noteNotice, setNoteNotice] = useState('');
  const [noteError, setNoteError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const back = typeof state?.pipeline === 'string' && /^\/perusahaan\/(kandidat|lowongan\/[0-9a-f-]{36}\/kandidat)(\?|$)/i.test(state.pipeline)
    ? state.pipeline : pipelineUrl(candidate.job.id);

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form).get('body');
    setBusy(true);
    setNoteError('');
    setNoteNotice('');
    setFields({});
    try {
      const note = await api<CandidateNote>(`/applications/${candidate.id}/notes`, { method: 'POST', body: { body } });
      setCurrent(previous => ({ ...previous, notes: [note, ...previous.notes] }));
      form.reset();
      setNoteNotice('Catatan internal tersimpan.');
    } catch (error) {
      if (error instanceof ApiError) setFields(error.fields);
      setNoteError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Back to={back}>Pipeline kandidat</Back>
    <div className="page-heading heading-with-action">
      <div className="candidate-info"><div className="eyebrow"><Users size={17} aria-hidden="true" /> DETAIL KANDIDAT</div>
        <h1>{candidate.seeker.name}</h1><p>{candidate.seeker.email}</p>
        <p>{candidate.job.title} · Dilamar <time dateTime={candidate.appliedAt}>{date(candidate.appliedAt)}</time></p></div>
      <StatusBadge status={current.status} />
    </div>
    <div className="candidate-detail">
      <section className="surface candidate-history">
        <h2>Riwayat seleksi</h2>
        <StatusForm candidate={current} onSaved={application => {
          setCurrent(previous => ({ ...previous, status: application.status, history: application.history }));
          setStatusNotice(`Status tersimpan sebagai ${statuses[application.status]}.`);
        }} />
        {statusNotice && <Feedback kind="success">{statusNotice}</Feedback>}
        <StageTimeline history={current.history} />
      </section>
      <section className="surface note-panel">
        <div><div className="eyebrow"><StickyNote size={16} aria-hidden="true" /> HANYA UNTUK PERUSAHAAN</div><h2>Catatan internal</h2>
          <p>Catat pertimbangan seleksi untuk lamaran ini.</p></div>
        <form className="form" onSubmit={addNote}>
          {noteError && <Feedback>{noteError}</Feedback>}
          <Field name="body" label="Catatan baru" error={fields.body}><textarea {...fieldProps('body', fields)} rows={4} maxLength={2000}
            readOnly={busy} placeholder="Contoh: Pengalaman React sesuai dengan kebutuhan tim." /></Field>
          <button className="button primary" type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan catatan'}</button>
        </form>
        {noteNotice && <Feedback kind="success">{noteNotice}</Feedback>}
        {current.notes.length ? <ul className="note-list">{current.notes.map(note => <li key={note.id}>
          <time dateTime={note.createdAt}>{date(note.createdAt)}</time><p>{note.body}</p>
        </li>)}</ul> : <p>Belum ada catatan untuk kandidat ini.</p>}
      </section>
    </div>
  </>;
}
