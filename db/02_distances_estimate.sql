-- Позволява трети източник на разстояние: 'estimate' (оценка, когато картата не отговаря).
alter table distances drop constraint distances_source_check;
alter table distances add constraint distances_source_check
  check (source in ('osrm', 'manual', 'estimate'));
