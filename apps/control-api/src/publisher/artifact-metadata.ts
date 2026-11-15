export function artifactRegistrationAvailable(versionExpression: string) {
  return `COALESCE(b.script_version_id=${versionExpression} AND b.status='SUCCEEDED' AND b.artifact_digest=a.digest
    AND a.digest ~ '^(sha256:)?[a-f0-9]{64}$' AND regexp_replace(a.digest,'^sha256:','')=o.sha256
    AND o.status='READY' AND o.deleted_at IS NULL AND (o.expires_at IS NULL OR o.expires_at>now()),false)`;
}
