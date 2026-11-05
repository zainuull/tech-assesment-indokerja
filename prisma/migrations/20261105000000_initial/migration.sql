-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('JOB_SEEKER', 'COMPANY');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'REVIEWING', 'SHORTLISTED', 'REJECTED', 'ACCEPTED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "salaryMin" INTEGER NOT NULL,
    "salaryMax" INTEGER NOT NULL,
    "jobType" "JobType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "seekerId" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationHistory" (
    "id" SERIAL NOT NULL,
    "applicationId" UUID NOT NULL,
    "fromStatus" "ApplicationStatus",
    "toStatus" "ApplicationStatus" NOT NULL,
    "changedBy" UUID NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Job_companyId_createdAt_idx" ON "Job"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- CreateIndex
CREATE INDEX "Application_seekerId_appliedAt_idx" ON "Application"("seekerId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_seekerId_key" ON "Application"("jobId", "seekerId");

-- CreateIndex
CREATE INDEX "ApplicationHistory_applicationId_id_idx" ON "ApplicationHistory"("applicationId", "id");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_seekerId_fkey" FOREIGN KEY ("seekerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationHistory" ADD CONSTRAINT "ApplicationHistory_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationHistory" ADD CONSTRAINT "ApplicationHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Keep the range valid for writes outside the API as well.
ALTER TABLE "Job" ADD CONSTRAINT "Job_salary_range_check"
  CHECK ("salaryMin" >= 0 AND "salaryMax" >= "salaryMin");
