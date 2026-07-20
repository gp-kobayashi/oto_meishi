update public."Profile"
set "audioKey" = regexp_replace("audioUrl", '^https://[^/]+/', '')
where "audioKey" = ''
  and "audioUrl" ~ '^https://[^/]+/audio/[^/]+/.+\.m4a(?:\?.*)?$';

update public."Profile"
set "audioKey" = split_part("audioKey", '?', 1)
where "audioKey" like 'audio/%?%';
