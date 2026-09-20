
delete from app.payment_allocations where id='aba93d68-feaa-4073-851a-c173526bc9cb';
update app.payment_allocations set amount=amount+100.00 where id='bc2f1f5c-8f36-4e1f-8aa6-6ebc19bd2ca9';

delete from app.payment_allocations where id='1123f4ce-3269-4886-9852-8d7a7c597ff8';
update app.payment_allocations set amount=amount+300.00 where id='fba61b92-336f-4819-aedc-e99e622bbb52';

update app.payment_allocations set charge_id='daa85b13-6107-48fb-883b-c2f02e6baaa7' where id='d2c7cd7f-0ae6-484c-9f1a-7b4bbcc1b347';
update app.payment_allocations set charge_id='153303f8-1b8b-44a4-96d5-f5be08285cca' where id='5fdc1403-21d6-4ef2-b4d8-87ef59d7c75b';
;
