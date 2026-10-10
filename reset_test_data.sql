-- Изтрива ВСИЧКИ пътни листа (вкл. издадените) и нулира номерацията.
-- Само за подготовка на демо данни, преди предаване! Регистрите остават.
-- TRUNCATE не задейства защитата на ниво ред, затова работи и за издадени листове.
truncate table refuelings, trips, waybills restart identity;
update waybill_counter set last_number = 0 where id = 1;
