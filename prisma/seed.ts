import 'dotenv/config';
import { JobType, Role } from '../generated/prisma/client';
import { createDb } from '../server/db';
import { hashPassword } from '../server/password';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed demo hanya tersedia untuk pengembangan lokal.');
}
if (!process.env.DATABASE_URL) throw new Error('Atur DATABASE_URL sebelum menjalankan seed.');
const db = createDb(process.env.DATABASE_URL);
const passwordHash = await hashPassword('IndoKerjaDemo!');

const listings = [
  ['Frontend Developer', 'Jakarta Selatan', 10_000_000, 16_000_000, JobType.FULL_TIME,
    'Bangun antarmuka produk digital yang cepat dan mudah digunakan bersama tim produk dan desain.\n\nTanggung jawab\n• Mengembangkan komponen React dan TypeScript.\n• Menjaga aksesibilitas dan performa pengalaman web.\n\nKualifikasi\n• Terbiasa bekerja dengan React, CSS, dan REST API.'],
  ['Product Designer', 'Bandung', 9_000_000, 14_000_000, JobType.FULL_TIME,
    'Rancang pengalaman digital untuk pelanggan ritel kami. Kerjakan riset pengguna, alur, dan prototipe bersama tim lintas fungsi.'],
  ['Data Analyst', 'Jakarta Pusat', 8_000_000, 13_000_000, JobType.CONTRACT,
    'Bantu tim membuat keputusan berbasis data. Susun laporan berkala, validasi sumber data, dan rangkum temuan dengan jelas.'],
  ['Content Marketing Intern', 'Yogyakarta', 2_000_000, 3_500_000, JobType.INTERNSHIP,
    'Pelajari cara merencanakan konten, menulis materi kampanye, dan mengukur hasilnya bersama tim pemasaran.'],
  ['Customer Experience Associate', 'Surabaya', 4_000_000, 6_000_000, JobType.PART_TIME,
    'Bantu pelanggan menyelesaikan kendala melalui kanal dukungan dan sampaikan masukan pelanggan kepada tim produk.'],
  ['Backend Engineer', 'Remote', 13_000_000, 20_000_000, JobType.FULL_TIME,
    'Bangun dan rawat REST API menggunakan Node.js dan PostgreSQL. Tulis pengujian serta pantau keandalan layanan.'],
] as const;

try {
  await db.$transaction(async tx => {
    const accounts = [
      ['Raka Pratama', 'seeker@indokerja.test', Role.JOB_SEEKER],
      ['Ruang Digital', 'company@indokerja.test', Role.COMPANY],
      ['Sagara Studio', 'studio@indokerja.test', Role.COMPANY],
      ['Nusa Karya', 'nusa@indokerja.test', Role.COMPANY],
    ] as const;
    const [seeker, digital, sagara, nusa] = await Promise.all(accounts.map(([name, email, role]) => tx.user.upsert({
      where: { email }, update: {}, create: { name, email, role, passwordHash },
    })));
    const owners = [digital, sagara, nusa, digital, sagara, nusa];
    const jobs = await Promise.all(listings.map(([title, location, salaryMin, salaryMax, jobType, description], index) => {
      const id = `a1900000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      return tx.job.upsert({
        where: { id }, update: {},
        create: { id, title, location, salaryMin, salaryMax, jobType, description, companyId: owners[index].id,
          createdAt: new Date(Date.now() - index * 3_600_000) },
      });
    }));
    const jobId = jobs[3].id;
    const seekerId = seeker.id;
    await tx.application.upsert({
      where: { jobId_seekerId: { jobId, seekerId } },
      update: {},
      create: {
        jobId, seekerId, status: 'REVIEWING',
        history: { create: [
          { changedBy: seekerId, toStatus: 'APPLIED' },
          { changedBy: digital.id, fromStatus: 'APPLIED', toStatus: 'REVIEWING' },
        ] },
      },
    });
  });
  console.log('Akun dan lowongan demo siap.');
} finally {
  await db.$disconnect();
}
