-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create warehouses table
CREATE TABLE public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all warehouses" ON public.warehouses
  FOR SELECT USING (true);

CREATE POLICY "Users can create warehouses" ON public.warehouses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update warehouses" ON public.warehouses
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create product categories table
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all categories" ON public.product_categories
  FOR SELECT USING (true);

CREATE POLICY "Users can create categories" ON public.product_categories
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  category_id UUID REFERENCES public.product_categories(id),
  unit_of_measure TEXT NOT NULL DEFAULT 'Units',
  reorder_level INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all products" ON public.products
  FOR SELECT USING (true);

CREATE POLICY "Users can create products" ON public.products
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update products" ON public.products
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create stock levels table (current stock per product per warehouse)
CREATE TABLE public.stock_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity DECIMAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id)
);

ALTER TABLE public.stock_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all stock levels" ON public.stock_levels
  FOR SELECT USING (true);

CREATE POLICY "Users can create stock levels" ON public.stock_levels
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update stock levels" ON public.stock_levels
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create stock movements table (ledger for all stock changes)
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt', 'delivery', 'transfer_in', 'transfer_out', 'adjustment')),
  quantity DECIMAL NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all movements" ON public.stock_movements
  FOR SELECT USING (true);

CREATE POLICY "Users can create movements" ON public.stock_movements
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Create receipts table (incoming goods)
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE NOT NULL,
  supplier_name TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting', 'ready', 'done', 'canceled')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all receipts" ON public.receipts
  FOR SELECT USING (true);

CREATE POLICY "Users can create receipts" ON public.receipts
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update receipts" ON public.receipts
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create receipt lines table
CREATE TABLE public.receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity DECIMAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.receipt_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all receipt lines" ON public.receipt_lines
  FOR SELECT USING (true);

CREATE POLICY "Users can create receipt lines" ON public.receipt_lines
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete receipt lines" ON public.receipt_lines
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create deliveries table (outgoing goods)
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting', 'ready', 'done', 'canceled')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all deliveries" ON public.deliveries
  FOR SELECT USING (true);

CREATE POLICY "Users can create deliveries" ON public.deliveries
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update deliveries" ON public.deliveries
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create delivery lines table
CREATE TABLE public.delivery_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity DECIMAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.delivery_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all delivery lines" ON public.delivery_lines
  FOR SELECT USING (true);

CREATE POLICY "Users can create delivery lines" ON public.delivery_lines
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete delivery lines" ON public.delivery_lines
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create internal transfers table
CREATE TABLE public.internal_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number TEXT UNIQUE NOT NULL,
  source_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  destination_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity DECIMAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'waiting', 'ready', 'done', 'canceled')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

ALTER TABLE public.internal_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all transfers" ON public.internal_transfers
  FOR SELECT USING (true);

CREATE POLICY "Users can create transfers" ON public.internal_transfers
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update transfers" ON public.internal_transfers
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create stock adjustments table
CREATE TABLE public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_number TEXT UNIQUE NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  counted_quantity DECIMAL NOT NULL,
  system_quantity DECIMAL NOT NULL,
  difference DECIMAL NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'done')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ
);

ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all adjustments" ON public.stock_adjustments
  FOR SELECT USING (true);

CREATE POLICY "Users can create adjustments" ON public.stock_adjustments
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update adjustments" ON public.stock_adjustments
  FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_stock_levels_updated_at BEFORE UPDATE ON public.stock_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default warehouse
INSERT INTO public.warehouses (name, code, address) VALUES
  ('Main Warehouse', 'WH-MAIN', '123 Main Street, City'),
  ('Secondary Warehouse', 'WH-SEC', '456 Second Avenue, City');

-- Insert default categories
INSERT INTO public.product_categories (name, description) VALUES
  ('Raw Materials', 'Basic materials used in production'),
  ('Finished Goods', 'Completed products ready for sale'),
  ('Components', 'Parts and components'),
  ('Supplies', 'General supplies and consumables');