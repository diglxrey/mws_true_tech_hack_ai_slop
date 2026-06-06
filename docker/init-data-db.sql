-- Demo schema for target DB (query builder / render tests)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users (id),
  amount NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INTEGER,
  in_stock BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO users (display_name, status) VALUES
  ('Alice', 'active'),
  ('Bob', 'inactive');

INSERT INTO orders (user_id, amount, status) VALUES
  (1, 100.50, 'completed'),
  (1, 200.00, 'completed'),
  (1, 50.00, 'pending');

INSERT INTO products (name, category_id, in_stock) VALUES
  ('Laptop', 1, true),
  ('Mouse', 1, true),
  ('Mat', 1, true);
