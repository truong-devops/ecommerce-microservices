WITH service_dbs(db_name, db_user) AS (
  VALUES
    ('ecommerce_auth', 'eauth'),
    ('ecommerce_user', 'euser'),
    ('ecommerce_cart', 'ecart'),
    ('ecommerce_order', 'eorder'),
    ('ecommerce_payment', 'epayment'),
    ('ecommerce_inventory', 'einventory'),
    ('ecommerce_shipping', 'eshipping'),
    ('ecommerce_notification', 'enotification'),
    ('ecommerce_analytics', 'eanalytics')
)
SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L', db_user, db_user)
FROM service_dbs
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = db_user)
\gexec

WITH service_dbs(db_name, db_user) AS (
  VALUES
    ('ecommerce_auth', 'eauth'),
    ('ecommerce_user', 'euser'),
    ('ecommerce_cart', 'ecart'),
    ('ecommerce_order', 'eorder'),
    ('ecommerce_payment', 'epayment'),
    ('ecommerce_inventory', 'einventory'),
    ('ecommerce_shipping', 'eshipping'),
    ('ecommerce_notification', 'enotification'),
    ('ecommerce_analytics', 'eanalytics')
)
SELECT format('CREATE DATABASE %I OWNER %I', db_name, db_user)
FROM service_dbs
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = db_name)
\gexec

WITH service_dbs(db_name, db_user) AS (
  VALUES
    ('ecommerce_auth', 'eauth'),
    ('ecommerce_user', 'euser'),
    ('ecommerce_cart', 'ecart'),
    ('ecommerce_order', 'eorder'),
    ('ecommerce_payment', 'epayment'),
    ('ecommerce_inventory', 'einventory'),
    ('ecommerce_shipping', 'eshipping'),
    ('ecommerce_notification', 'enotification'),
    ('ecommerce_analytics', 'eanalytics')
)
SELECT format('ALTER DATABASE %I OWNER TO %I', db_name, db_user)
FROM service_dbs
\gexec
