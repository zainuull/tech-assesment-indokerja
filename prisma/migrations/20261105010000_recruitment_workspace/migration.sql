BEGIN;

CREATE TYPE "JobState" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
ALTER TABLE "Job" ADD COLUMN "state" "JobState" NOT NULL DEFAULT 'OPEN';
CREATE INDEX "Job_state_createdAt_idx" ON "Job"("state", "createdAt");

CREATE TABLE "CandidateNote" (
    "id" SERIAL NOT NULL,
    "applicationId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CandidateNote_applicationId_fkey" FOREIGN KEY ("applicationId")
      REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CandidateNote_applicationId_id_idx" ON "CandidateNote"("applicationId", "id");

COMMIT;
