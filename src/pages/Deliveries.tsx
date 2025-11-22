import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

const Deliveries = () => {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; quantity: number }[]>([
    { productId: "", quantity: 0 },
  ]);

  useEffect(() => {
    loadDeliveries();
    loadProducts();
    loadWarehouses();
  }, []);

  const loadDeliveries = async () => {
    const { data } = await supabase
      .from("deliveries")
      .select("*, warehouses(name)")
      .order("created_at", { ascending: false });
    setDeliveries(data || []);
  };

  const loadProducts = async () => {
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts(data || []);
  };

  const loadWarehouses = async () => {
    const { data } = await supabase.from("warehouses").select("*").order("name");
    setWarehouses(data || []);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const deliveryNumber = `DEL-${Date.now()}`;
      const { data: delivery, error: deliveryError } = await supabase
        .from("deliveries")
        .insert({
          delivery_number: deliveryNumber,
          customer_name: formData.get("customer_name") as string,
          warehouse_id: formData.get("warehouse_id") as string,
          notes: formData.get("notes") as string,
          created_by: user?.id,
          status: "draft",
        })
        .select()
        .single();

      if (deliveryError) throw deliveryError;

      const lines = selectedProducts
        .filter((p) => p.productId && p.quantity > 0)
        .map((p) => ({
          delivery_id: delivery.id,
          product_id: p.productId,
          quantity: p.quantity,
        }));

      if (lines.length > 0) {
        const { error: linesError } = await supabase.from("delivery_lines").insert(lines);
        if (linesError) throw linesError;
      }

      toast.success("Delivery created successfully");
      setDialogOpen(false);
      loadDeliveries();
      setSelectedProducts([{ productId: "", quantity: 0 }]);
    } catch (error: any) {
      toast.error(error.message || "Failed to create delivery");
    }
  };

  const handleValidateDelivery = async (delivery: any) => {
    try {
      const { data: lines } = await supabase
        .from("delivery_lines")
        .select("*")
        .eq("delivery_id", delivery.id);

      if (!lines || lines.length === 0) {
        toast.error("Cannot validate delivery without products");
        return;
      }

      for (const line of lines) {
        const { data: existing } = await supabase
          .from("stock_levels")
          .select("*")
          .eq("product_id", line.product_id)
          .eq("warehouse_id", delivery.warehouse_id)
          .single();

        if (!existing || Number(existing.quantity) < Number(line.quantity)) {
          toast.error("Insufficient stock for this delivery");
          return;
        }

        await supabase
          .from("stock_levels")
          .update({ quantity: Number(existing.quantity) - Number(line.quantity) })
          .eq("id", existing.id);

        await supabase.from("stock_movements").insert({
          product_id: line.product_id,
          warehouse_id: delivery.warehouse_id,
          movement_type: "delivery",
          quantity: -line.quantity,
          reference_id: delivery.id,
          reference_type: "delivery",
          created_by: user?.id,
        });
      }

      await supabase
        .from("deliveries")
        .update({ status: "done", validated_at: new Date().toISOString() })
        .eq("id", delivery.id);

      toast.success("Delivery validated and stock updated");
      loadDeliveries();
    } catch (error: any) {
      toast.error(error.message || "Failed to validate delivery");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Deliveries</h1>
          <p className="text-muted-foreground">Outgoing stock to customers</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Delivery
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Delivery</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer_name">Customer Name</Label>
                <Input id="customer_name" name="customer_name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Warehouse</Label>
                <Select name="warehouse_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id}>
                        {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Products</Label>
                {selectedProducts.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <Select
                      value={item.productId}
                      onValueChange={(value) => {
                        const newProducts = [...selectedProducts];
                        newProducts[index].productId = value;
                        setSelectedProducts(newProducts);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Quantity"
                      value={item.quantity}
                      onChange={(e) => {
                        const newProducts = [...selectedProducts];
                        newProducts[index].quantity = parseInt(e.target.value) || 0;
                        setSelectedProducts(newProducts);
                      }}
                      className="w-32"
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedProducts([...selectedProducts, { productId: "", quantity: 0 }])}
                >
                  Add Product
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" />
              </div>
              <Button type="submit" className="w-full">
                Create Delivery
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Delivery Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell className="font-mono">{delivery.delivery_number}</TableCell>
                  <TableCell>{delivery.customer_name}</TableCell>
                  <TableCell>{delivery.warehouses?.name}</TableCell>
                  <TableCell>
                    <Badge variant={delivery.status === "done" ? "default" : "secondary"}>
                      {delivery.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(delivery.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {delivery.status !== "done" && (
                      <Button size="sm" onClick={() => handleValidateDelivery(delivery)}>
                        <Check className="mr-1 h-3 w-3" />
                        Validate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {deliveries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No deliveries found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Deliveries;
