-- Password sign-up and optional Google sign-in. A user must have a password hash, a Google subject, or both.
-- New self-service accounts are reviewers. SYNTHETIC DATA ONLY.

alter table users alter column password_hash drop not null;

alter table users add column google_sub text;

alter table users add constraint users_google_sub_len
  check (google_sub is null or char_length(google_sub) between 1 and 255);

alter table users add constraint users_has_credential
  check (password_hash is not null or google_sub is not null);

create unique index users_google_sub_uidx on users (tenant_id, google_sub) where google_sub is not null;
