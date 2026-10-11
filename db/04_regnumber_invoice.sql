-- 1) Рег. номера: латинските букви, които съществуват в българските номера,
--    се превръщат в кирилски; интервалите се махат. Новите номера се проверяват.
update vehicles
   set reg_number = translate(upper(replace(reg_number, ' ', '')), 'ABEKMHOPCTYX', 'АВЕКМНОРСТУХ');

alter table vehicles add constraint vehicles_reg_number_format
  check (reg_number ~ '^[АВЕКМНОРСТУХ]{1,2}[0-9]{4}[АВЕКМНОРСТУХ]{1,2}$') not valid;

-- 2) Една фактура за гориво не може да се отчита в два пътни листа.
create unique index refuelings_invoice_unique
  on refuelings (invoice_number)
  where invoice_number is not null and invoice_number <> '';
