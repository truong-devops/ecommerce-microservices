DO
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ecommerce') THEN
    CREATE ROLE ecommerce WITH LOGIN PASSWORD 'ecommerce' SUPERUSER;
  END IF;
END
$$;

SELECT 'CREATE DATABASE auth_db OWNER postgres'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'auth_db')
\gexec

SELECT 'CREATE DATABASE ecommerce_user OWNER postgres'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ecommerce_user')
\gexec

SELECT 'CREATE DATABASE ecommerce OWNER ecommerce'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ecommerce')
\gexec
