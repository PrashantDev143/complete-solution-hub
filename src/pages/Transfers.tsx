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
import { Plus, Check, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

const Transfers = () => {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadTransfers();
    loadProducts();
    loadWarehouses();
  }, []);

  const loadTransfers = async () => {
    const { data } = await supabase
      .from("internal_transfers")
      .select(`
        *,
        products(name, sku),
        source:warehouses!internal_transfers_source_warehouse_id_fkey(name),
        destination:warehouses!internal_transfers_destination_warehouse_id_fkey(name)
      `)
      .order("created_at", { ascending: false });
    setTransfers(data || []);
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

    const sourceId = formData.get("source_warehouse_id") as string;
    const destId = formData.get("destination_warehouse_id") as string;

    if (sourceId === destId) {
      toast.error("Source and destination warehouses must be different");
      return;
    }

    try {
      const transferNumber = `TRF-${Date.now()}`;
      const { error } = await supabase.from("internal_transfers").insert({
        transfer_number: transferNumber,
        source_warehouse_id: sourceId,
        destination_warehouse_id: destId,
        product_id: formData.get("product_id") as string,
        quantity: parseInt(formData.get("quantity") as string),
        notes: formData.get("notes") as string,
        created_by: user?.id,
        status: "draft",
      });

      if (error) throw error;

      toast.success("Transfer created successfully");
      setDialogOpen(false);
      loadTransfers();
    } catch (error: any) {
      toast.error(error.message || "Failed to create transfer");
    }
  };

  const handleValidateTransfer = async (transfer: any) => {
    try {
      // Check source stock
      const { data: sourceStock } = await supabase
        .from("stock_levels")
        .select("*")
        .eq("product_id", transfer.product_id)
        .eq("warehouse_id", transfer.source_warehouse_id)
        .single();

      if (!sourceStock || Number(sourceStock.quantity) < Number(transfer.quantity)) {
        toast.error("Insufficient stock in source warehouse");
        return;
      }

      // Reduce source stock
      await supabase
        .from("stock_levels")
        .update({ quantity: Number(sourceStock.quantity) - Number(transfer.quantity) })
        .eq("id", sourceStock.id);

      // Increase destination stock
      const { data: destStock } = await supabase
        .from("stock_levels")
        .select("*")
        .eq("product_id", transfer.product_id)
        .eq("warehouse_id", transfer.destination_warehouse_id)
        .single();

      if (destStock) {
        await supabase
          .from("stock_levels")
          .update({ quantity: Number(destStock.quantity) + Number(transfer.quantity) })
          .eq("id", destStock.id);
      } else {
        await supabase.from("stock_levels").insert({
          product_id: transfer.product_id,
          warehouse_id: transfer.destination_warehouse_id,
          quantity: transfer.quantity,
        });
      }

      // Create stock movements
      await supabase.from("stock_movements").insert([
        {
          product_id: transfer.product_id,
          warehouse_id: transfer.source_warehouse_id,
          movement_type: "transfer_out",
          quantity: -transfer.quantity,
          reference_id: transfer.id,
          reference_type: "transfer",
          created_by: user?.id,
        },
        {
          product_id: transfer.product_id,
          warehouse_id: transfer.destination_warehouse_id,
          movement_type: "transfer_in",
          quantity: transfer.quantity,
          reference_id: transfer.id,
          reference_type: "transfer",
          created_by: user?.id,
        },
      ]);

      // Update transfer status
      await supabase
        .from("internal_transfers")
        .update({ status: "done", validated_at: new Date().toISOString() })
        .eq("id", transfer.id);

      toast.success("Transfer validated and stock updated");
      loadTransfers();
    } catch (error: any) {
      toast.error(error.message || "Failed to validate transfer");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Internal Transfers</h1>
          <p className="text-muted-foreground">Move stock between warehouses</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Transfer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Internal Transfer</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="source_warehouse_id">From Warehouse</Label>
                <Select name="source_warehouse_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select source warehouse" />
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
                <Label htmlFor="destination_warehouse_id">To Warehouse</Label>
                <Select name="destination_warehouse_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination warehouse" />
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
                <Label htmlFor="product_id">Product</Label>
                <Select name="product_id" required>
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
                <Label htmlFor="quantity">Quantity</Label>
                <Input id="quantity" name="quantity" type="number" required min="1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" name="notes" />
              </div>
              <Button type="submit" className="w-full">
                Create Transfer
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
                <TableHead>Transfer Number</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell className="font-mono">{transfer.transfer_number}</TableCell>
                  <TableCell>{transfer.products?.name}</TableCell>
                  <TableCell>{transfer.source?.name}</TableCell>
                  <TableCell className="flex items-center gap-2">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    {transfer.destination?.name}
                  </TableCell>
                  <TableCell>{transfer.quantity}</TableCell>
                  <TableCell>
                    <Badge variant={transfer.status === "done" ? "default" : "secondary"}>
                      {transfer.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(transfer.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {transfer.status !== "done" && (
                      <Button size="sm" onClick={() => handleValidateTransfer(transfer)}>
                        <Check className="mr-1 h-3 w-3" />
                        Validate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {transfers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No transfers found
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

export default Transfers;
