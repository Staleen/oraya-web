update external_calendar_sources
set last_error = null
where last_error is not null
  and (
    btrim(last_error) = ''
    or btrim(last_error) in ('â€”', 'â€¦', '—', '…', '-')
  );
