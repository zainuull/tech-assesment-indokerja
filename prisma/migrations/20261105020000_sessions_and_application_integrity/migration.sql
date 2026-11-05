BEGIN;

CREATE TABLE "AuthSession" (
    "tokenHash" CHAR(64) NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("tokenHash"),
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId")
      REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "Application_jobId_appliedAt_id_idx" ON "Application"("jobId", "appliedAt" DESC, "id");

CREATE FUNCTION "require_open_job_for_application"() RETURNS trigger
LANGUAGE plpgsql
SET search_path FROM CURRENT
AS $$
DECLARE
  job_state "JobState";
BEGIN
  -- Share the row lock with other applicants and hold it until the insert commits.
  SELECT "state" INTO job_state FROM "Job" WHERE "id" = NEW."jobId" FOR SHARE;
  IF job_state IS DISTINCT FROM 'OPEN' THEN
    RAISE check_violation USING MESSAGE = 'Application requires an open job.',
      CONSTRAINT = 'Application_job_open_check';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Application_job_open_check"
  AFTER INSERT OR UPDATE OF "jobId" ON "Application"
  FOR EACH ROW EXECUTE FUNCTION "require_open_job_for_application"();

COMMIT;
