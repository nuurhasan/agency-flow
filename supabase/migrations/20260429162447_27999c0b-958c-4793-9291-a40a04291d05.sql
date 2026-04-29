ALTER TABLE public.client_domains 
ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'paying';

ALTER TABLE public.client_domains 
DROP CONSTRAINT IF EXISTS client_domains_customer_type_check;

ALTER TABLE public.client_domains 
ADD CONSTRAINT client_domains_customer_type_check 
CHECK (customer_type IN ('paying', 'non-paying'));