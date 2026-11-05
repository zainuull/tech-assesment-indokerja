import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, BriefcaseBusiness, Building2, ClipboardList, Compass, LogOut } from 'lucide-react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role, Session, User } from '../shared/domain';
import { api, ApiError, errorMessage } from './api';
import { Candidates, CompanyDashboard, Field, fieldProps, JobForm } from './company';
import { CareerMap, JobDetail, JobList, MyApplications } from './jobs';
import { Brand, Empty, Feedback } from './ui';
import './styles.css';

const sessionKey = 'indokerja.token';
const landing = (role: Role) => role === 'COMPANY' ? '/perusahaan' : '/';
const initialToken = sessionStorage.getItem(sessionKey);

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(!!initialToken);
  const [sessionError, setSessionError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const location = useLocation();

  useEffect(() => {
    const token = sessionStorage.getItem(sessionKey);
    if (!token) return;
    const controller = new AbortController();
    api<User>('/auth/me', { token, signal: controller.signal }).then(
      user => {
        if (controller.signal.aborted) return;
        setSession({ token, user });
        setChecking(false);
      },
      error => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) sessionStorage.removeItem(sessionKey);
        else setSessionError(errorMessage(error));
        setChecking(false);
      },
    );
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    function expired(event: Event) {
      if ((event as CustomEvent).detail !== sessionStorage.getItem(sessionKey)) return;
      sessionStorage.removeItem(sessionKey);
      setSession(null);
      setSessionError('Sesi berakhir. Silakan masuk kembali.');
    }
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [location.pathname]);

  function signIn(next: Session) {
    sessionStorage.setItem(sessionKey, next.token);
    setSessionError('');
    setSession(next);
  }

  function signedInPage(role: Role) {
    const fromJob = location.state?.fromJob;
    if (role === 'JOB_SEEKER' && typeof fromJob === 'string' && /^\/lowongan\/[0-9a-f-]{36}$/i.test(fromJob)) {
      return <Navigate to={fromJob} replace state={{ jobSearch: location.state?.jobSearch }} />;
    }
    return <Navigate to={landing(role)} replace />;
  }

  function signOut() {
    sessionStorage.removeItem(sessionKey);
    setSession(null);
    setSessionError('');
  }

  function protectedPage(role: Role, render: (token: string) => ReactNode) {
    if (checking) return <div className="pending" role="status">Memeriksa sesi…</div>;
    if (!session) return <Navigate to="/masuk" replace />;
    if (session.user.role !== role) return <Empty title="Akses dibatasi"><p>Halaman ini hanya tersedia untuk peran yang sesuai.</p><Link className="button secondary" to={landing(session.user.role)}>Kembali ke halaman utama</Link></Empty>;
    return render(session.token);
  }

  return <>
    <a className="skip-link" href="#main">Lewati ke konten</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" to="/" aria-label="IndoKerja.id, beranda"><Brand /></Link>
      <nav className="main-nav" aria-label="Navigasi utama">
        <NavLink end to="/"><Compass size={17} aria-hidden="true" /> Lowongan</NavLink>
        {session?.user.role === 'JOB_SEEKER' && <NavLink to="/lamaran"><ClipboardList size={17} aria-hidden="true" /> Lamaran saya</NavLink>}
        {session?.user.role === 'COMPANY' && <NavLink to="/perusahaan"><Building2 size={17} aria-hidden="true" /> Perusahaan</NavLink>}
      </nav>
      {session ? <div className="account"><span className="account-name" title={session.user.name}>{session.user.name}</span><button className="button secondary" type="button" onClick={signOut}><LogOut size={16} aria-hidden="true" /> Keluar</button></div> :
        !checking && <Link className="button secondary sign-in" to="/masuk">Masuk <ArrowRight size={16} aria-hidden="true" /></Link>}
    </div></header>
    <main id="main" className="shell" tabIndex={-1}>
      {sessionError && <div className="session-notice"><Feedback>{sessionError} {sessionStorage.getItem(sessionKey) && <button className="text-action" type="button" onClick={() => {
        setSessionError(''); setChecking(true); setAttempt(value => value + 1);
      }}>Coba lagi</button>}</Feedback></div>}
      <Routes>
        <Route path="/" element={<JobList />} />
        <Route path="/masuk" element={checking ? <div className="pending" role="status">Memeriksa sesi…</div> : session ? signedInPage(session.user.role) : <Login onLogin={signIn} />} />
        <Route path="/lowongan/:id" element={<JobDetail key={location.pathname} session={session} />} />
        <Route path="/lamaran" element={protectedPage('JOB_SEEKER', token => <MyApplications token={token} />)} />
        <Route path="/perusahaan" element={protectedPage('COMPANY', token => <CompanyDashboard token={token} />)} />
        <Route path="/perusahaan/baru" element={protectedPage('COMPANY', token => <JobForm token={token} />)} />
        <Route path="/perusahaan/lowongan/:id/kandidat" element={protectedPage('COMPANY', token => <Candidates token={token} />)} />
        <Route path="*" element={<Empty title="Halaman tidak ditemukan"><p>Periksa alamat halaman atau kembali ke daftar lowongan.</p><Link className="button primary" to="/">Jelajahi lowongan</Link></Empty>} />
      </Routes>
    </main>
    <footer className="site-footer"><div className="footer-inner"><Link className="brand" to="/" aria-label="IndoKerja.id, beranda"><Brand /></Link><span>Portal karier dan rekrutmen</span></div></footer>
  </>;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setFields({});
    setError('');
    try {
      onLogin(await api<Session>('/auth/login', { method: 'POST', body }));
    } catch (error) {
      if (error instanceof ApiError) setFields(error.fields);
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="login-layout">
    <div className="login-brand">
      <div className="hero-label"><BriefcaseBusiness size={15} aria-hidden="true" /> PORTAL KARIER</div>
      <h2>Karier dan rekrutmen dalam satu tempat.</h2>
      <p>Temukan pekerjaan yang tepat atau mulai cari kandidat untuk tim kamu.</p>
      <CareerMap />
    </div>
    <form className="surface form login-form" onSubmit={submit}>
      <div><div className="eyebrow">AKUN INDOKERJA</div><h1>Masuk</h1><p>Gunakan akun Pencari Kerja atau Perusahaan.</p></div>
      {error && <Feedback>{error}</Feedback>}
      <Field name="email" label="Email" error={fields.email}><input {...fieldProps('email', fields)} type="email" autoComplete="username" maxLength={254} placeholder="nama@contoh.id" /></Field>
      <Field name="password" label="Kata sandi" error={fields.password}><input {...fieldProps('password', fields)} type="password" autoComplete="current-password" minLength={8} maxLength={128} /></Field>
      <button type="submit" className="button primary" disabled={busy}>{busy ? 'Sedang masuk…' : 'Masuk'} <ArrowRight size={17} aria-hidden="true" /></button>
      {import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true' && <div className="demo-accounts">
        <strong>Akun demo lokal</strong>
        <span>Pencari Kerja · seeker@indokerja.test</span>
        <span>Perusahaan · company@indokerja.test</span>
        <span>Kata sandi · IndoKerjaDemo!</span>
      </div>}
    </form>
  </div>;
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><App /></BrowserRouter>);
