import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

const Receipts = () => {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; quantity: number }[]>([
    { productId: "", quantity: 0 },
  ]);

  useEffect(() => {
    loadReceipts();
    loadProducts();
    loadWarehouses();
  }, []);

  const loadReceipts = async () => {
    const { data } = await supabase
      .from("receipts")
      .select("*, warehouses(name)")
      .order("created_at", { ascending: false });
    setReceipts(data || []);
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
      // Create receipt
      const receiptNumber = `RCP-${Date.now()}`;
      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .insert({
          receipt_number: receiptNumber,
          supplier_name: formData.get("supplier_name") as string,
          warehouse_id: formData.get("warehouse_id") as string,
          notes: formData.get("notes") as string,
          created_by: user?.id,
          status: "draft",
        })
        .select()
        .single();

      if (receiptError) throw receiptError;

      // Create receipt lines
      const lines = selectedProducts
        .filter((p) => p.productId && p.quantity > 0)
        .map((p) => ({
          receipt_id: receipt.id,
          product_id: p.productId,
          quantity: p.quantity,
        }));

      if (lines.length > 0) {
        const { error: linesError } = await supabase.from("receipt_lines").insert(lines);
        if (linesError) throw linesError;
      }

      toast.success("Receipt created successfully");
      setDialogOpen(false);
      loadReceipts();
      setSelectedProducts([{ productId: "", quantity: 0 }]);
    } catch (error: any) {
      toast.error(error.message || "Failed to create receipt");
    }
  };

  const handleValidateReceipt = async (receipt: any) => {
    try {
      // Get receipt lines
      const { data: lines } = await supabase
        .from("receipt_lines")
        .select("*")
        .eq("receipt_id", receipt.id);

      if (!lines || lines.length === 0) {
        toast.error("Cannot validate receipt without products");
        return;
      }

      // Update stock levels
      for (const line of lines) {
        // Check if stock level exists
        const { data: existing } = await supabase
          .from("stock_levels")
          .select("*")
          .eq("product_id", line.product_id)
          .eq("warehouse_id", receipt.warehouse_id)
          .single();

        if (existing) {
          // Update existing stock level
          await supabase
            .from("stock_levels")
            .update({ quantity: Number(existing.quantity) + Number(line.quantity) })
            .eq("id", existing.id);
        } else {
          // Create new stock level
          await supabase.from("stock_levels").insert({
            product_id: line.product_id,
            warehouse_id: receipt.warehouse_id,
            quantity: line.quantity,
          });
        }

        // Create stock movement
        await supabase.from("stock_movements").insert({
          product_id: line.product_id,
          warehouse_id: receipt.warehouse_id,
          movement_type: "receipt",
          quantity: line.quantity,
          reference_id: receipt.id,
          reference_type: "receipt",
          created_by: user?.id,
        });
      }

      // Update receipt status
      await supabase
        .from("receipts")
        .update({ status: "done", validated_at: new Date().toISOString() })
        .eq("id", receipt.id);

      toast.success("Receipt validated and stock updated");
      loadReceipts();
    } catch (error: any) {
      toast.error(error.message || "Failed to validate receipt");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Receipts</h1>
          <p className="text-muted-foreground">Incoming stock from suppliers</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Receipt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Receipt</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplier_name">Supplier Name</Label>
                <Input id="supplier_name" name="supplier_name" required />
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
                Create Receipt
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
                <TableHead>Receipt Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell className="font-mono">{receipt.receipt_number}</TableCell>
                  <TableCell>{receipt.supplier_name}</TableCell>
                  <TableCell>{receipt.warehouses?.name}</TableCell>
                  <TableCell>
                    <Badge variant={receipt.status === "done" ? "default" : "secondary"}>
                      {receipt.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(receipt.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {receipt.status !== "done" && (
                      <Button size="sm" onClick={() => handleValidateReceipt(receipt)}>
                        <Check className="mr-1 h-3 w-3" />
                        Validate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No receipts found
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

export default Receipts;
