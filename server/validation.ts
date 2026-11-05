import { ApplicationStatus, JobState, JobType } from '../generated/prisma/client';
import type { Request } from 'express';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields = Object.fromEntries(result.error.issues.map(
    issue => [issue.path.join('.') || 'request', issue.message],
  ));
  throw new ApiError(400, 'VALIDATION_ERROR', 'Periksa kembali data yang dikirim.', fields);
}

export function requireJson(req: Request) {
  if (!req.is('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Gunakan Content-Type application/json.');
  }
}

export function validateJson<T>(schema: z.ZodType<T>, req: Request): T {
  requireJson(req);
  return validate(schema, req.body);
}

export const idSchema = z.uuid('ID tidak valid.');
export const loginSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email('Masukkan alamat email yang valid.')).transform(email => email.toLowerCase()),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter.').max(128, 'Kata sandi maksimal 128 karakter.'),
});

const noNull = (value: string) => !value.includes('\0');
const text = (label: string, max: number) =>
  z.string({ error: `${label} wajib diisi.` }).trim().min(1, `${label} wajib diisi.`).max(max, `${label} maksimal ${max} karakter.`)
    .refine(noNull, `${label} mengandung karakter yang tidak valid.`);
const salary = z.number({ error: 'Masukkan angka gaji dalam rupiah.' }).int('Gaji harus berupa bilangan bulat.')
  .min(0, 'Gaji minimal Rp0.').max(2_147_483_647, 'Gaji maksimal Rp2.147.483.647.');

const jobFields = z.object({
  title: text('Judul lowongan', 120),
  description: text('Deskripsi', 6000),
  location: text('Lokasi', 120),
  jobType: z.enum(JobType, 'Pilih jenis pekerjaan yang tersedia.'),
  salaryMin: salary,
  salaryMax: salary,
});

const salaryRange = {
  path: ['salaryMax'],
  message: 'Gaji maksimum harus sama dengan atau lebih besar dari gaji minimum.',
};

export const jobSchema = jobFields.refine(job => job.salaryMax >= job.salaryMin, salaryRange);
export const createJobSchema = jobFields.extend({
  state: z.enum([JobState.DRAFT, JobState.OPEN], 'Pilih draf atau langsung publikasikan.').optional(),
}).refine(job => job.salaryMax >= job.salaryMin, salaryRange);

const searchText = z.string().trim().max(120).refine(noNull, 'Kata pencarian mengandung karakter yang tidak valid.');
const positiveInteger = (max: number) => z.string().regex(/^[1-9]\d{0,3}$/)
  .transform(Number).pipe(z.number().max(max));

export const searchSchema = z.object({
  q: searchText.optional(),
  location: searchText.optional(),
  page: positiveInteger(1000).optional(),
  limit: positiveInteger(50).optional(),
  jobType: z.enum(JobType, 'Jenis pekerjaan tidak valid.').optional(),
});

export const statusSchema = z.object({ status: z.enum(ApplicationStatus) });

export const jobStateSchema = z.object({
  state: z.enum([JobState.OPEN, JobState.CLOSED], 'Pilih Terbuka atau Ditutup.'),
});

export const noteSchema = z.object({ body: text('Catatan', 2000) });
