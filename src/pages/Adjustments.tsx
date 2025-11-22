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

const Adjustments = () => {
  const { user } = useAuth();
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [systemQty, setSystemQty] = useState(0);

  useEffect(() => {
    loadAdjustments();
    loadProducts();
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (selectedProduct && selectedWarehouse) {
      loadSystemQuantity(selectedProduct, selectedWarehouse);
    }
  }, [selectedProduct, selectedWarehouse]);

  const loadAdjustments = async () => {
    const { data } = await supabase
      .from("stock_adjustments")
      .select("*, products(name, sku), warehouses(name)")
      .order("created_at", { ascending: false });
    setAdjustments(data || []);
  };

  const loadProducts = async () => {
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts(data || []);
  };

  const loadWarehouses = async () => {
    const { data } = await supabase.from("warehouses").select("*").order("name");
    setWarehouses(data || []);
  };

  const loadSystemQuantity = async (productId: string, warehouseId: string) => {
    const { data } = await supabase
      .from("stock_levels")
      .select("quantity")
      .eq("product_id", productId)
      .eq("warehouse_id", warehouseId)
      .single();

    setSystemQty(data ? Number(data.quantity) : 0);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const countedQty = parseFloat(formData.get("counted_quantity") as string);
    const difference = countedQty - systemQty;

    try {
      const adjustmentNumber = `ADJ-${Date.now()}`;
      const { error } = await supabase.from("stock_adjustments").insert({
        adjustment_number: adjustmentNumber,
        product_id: selectedProduct,
        warehouse_id: selectedWarehouse,
        counted_quantity: countedQty,
        system_quantity: systemQty,
        difference: difference,
        reason: formData.get("reason") as string,
        created_by: user?.id,
        status: "draft",
      });

      if (error) throw error;

      toast.success("Adjustment created successfully");
      setDialogOpen(false);
      loadAdjustments();
      setSelectedProduct("");
      setSelectedWarehouse("");
      setSystemQty(0);
    } catch (error: any) {
      toast.error(error.message || "Failed to create adjustment");
    }
  };

  const handleValidateAdjustment = async (adjustment: any) => {
    try {
      // Update or create stock level
      const { data: existing } = await supabase
        .from("stock_levels")
        .select("*")
        .eq("product_id", adjustment.product_id)
        .eq("warehouse_id", adjustment.warehouse_id)
        .single();

      if (existing) {
        await supabase
          .from("stock_levels")
          .update({ quantity: adjustment.counted_quantity })
          .eq("id", existing.id);
      } else {
        await supabase.from("stock_levels").insert({
          product_id: adjustment.product_id,
          warehouse_id: adjustment.warehouse_id,
          quantity: adjustment.counted_quantity,
        });
      }

      // Create stock movement
      await supabase.from("stock_movements").insert({
        product_id: adjustment.product_id,
        warehouse_id: adjustment.warehouse_id,
        movement_type: "adjustment",
        quantity: adjustment.difference,
        reference_id: adjustment.id,
        reference_type: "adjustment",
        notes: adjustment.reason,
        created_by: user?.id,
      });

      // Update adjustment status
      await supabase
        .from("stock_adjustments")
        .update({ status: "done", validated_at: new Date().toISOString() })
        .eq("id", adjustment.id);

      toast.success("Adjustment validated and stock updated");
      loadAdjustments();
    } catch (error: any) {
      toast.error(error.message || "Failed to validate adjustment");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Stock Adjustments</h1>
          <p className="text-muted-foreground">Correct stock discrepancies</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Adjustment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Stock Adjustment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="product_id">Product</Label>
                <Select
                  value={selectedProduct}
                  onValueChange={setSelectedProduct}
                  required
                >
                  <SelectTrigger>
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse_id">Warehouse</Label>
                <Select
                  value={selectedWarehouse}
                  onValueChange={setSelectedWarehouse}
                  required
                >
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
              {selectedProduct && selectedWarehouse && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium">System Quantity: {systemQty}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="counted_quantity">Counted Quantity</Label>
                <Input
                  id="counted_quantity"
                  name="counted_quantity"
                  type="number"
                  step="0.01"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">Reason</Label>
                <Input id="reason" name="reason" required />
              </div>
              <Button type="submit" className="w-full">
                Create Adjustment
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
                <TableHead>Adjustment Number</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>System Qty</TableHead>
                <TableHead>Counted Qty</TableHead>
                <TableHead>Difference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map((adjustment) => (
                <TableRow key={adjustment.id}>
                  <TableCell className="font-mono">{adjustment.adjustment_number}</TableCell>
                  <TableCell>{adjustment.products?.name}</TableCell>
                  <TableCell>{adjustment.warehouses?.name}</TableCell>
                  <TableCell>{adjustment.system_quantity}</TableCell>
                  <TableCell>{adjustment.counted_quantity}</TableCell>
                  <TableCell>
                    <span
                      className={
                        adjustment.difference > 0
                          ? "text-success font-medium"
                          : adjustment.difference < 0
                          ? "text-destructive font-medium"
                          : ""
                      }
                    >
                      {adjustment.difference > 0 ? "+" : ""}
                      {adjustment.difference}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={adjustment.status === "done" ? "default" : "secondary"}>
                      {adjustment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {adjustment.status !== "done" && (
                      <Button size="sm" onClick={() => handleValidateAdjustment(adjustment)}>
                        <Check className="mr-1 h-3 w-3" />
                        Validate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {adjustments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No adjustments found
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

export default Adjustments;
