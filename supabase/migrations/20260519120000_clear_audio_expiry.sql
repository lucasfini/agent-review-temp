update public.projects
set audio_expires_at = null
where audio_deleted_at is null
  and audio_expires_at is not null;
