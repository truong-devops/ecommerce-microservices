ALTER TABLE order_items
  ALTER COLUMN product_id TYPE varchar(128) USING product_id::text;
