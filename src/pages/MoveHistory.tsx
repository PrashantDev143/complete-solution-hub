import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, ArrowRightLeft, ClipboardCheck } from "lucide-react";

const MoveHistory = () => {
  const [movements, setMovements] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovements();
    loadProducts();
  }, []);

  const loadMovements = async () => {
    try {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, sku), warehouses(name), profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setMovements(data || []);
    } catch (error) {
      console.error("Error loading movements:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase.from("products").select("id, name").order("name");
    setProducts(data || []);
  };

  const getMovementIcon = (type: string) => {
    switch (type) {
      case "receipt":
        return <ArrowDown className="h-4 w-4 text-success" />;
      case "delivery":
        return <ArrowUp className="h-4 w-4 text-destructive" />;
      case "transfer_in":
      case "transfer_out":
        return <ArrowRightLeft className="h-4 w-4 text-primary" />;
      case "adjustment":
        return <ClipboardCheck className="h-4 w-4 text-warning" />;
      default:
        return null;
    }
  };

  const getMovementLabel = (type: string) => {
    const labels: Record<string, string> = {
      receipt: "Receipt",
      delivery: "Delivery",
      transfer_in: "Transfer In",
      transfer_out: "Transfer Out",
      adjustment: "Adjustment",
    };
    return labels[type] || type;
  };

  const filteredMovements =
    selectedProduct === "all"
      ? movements
      : movements.filter((m) => m.product_id === selectedProduct);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Move History</h1>
        <p className="text-muted-foreground">Complete ledger of all stock movements</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-4">
            <span>Stock Movement Ledger</span>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Filter by product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="font-mono text-sm">
                      {new Date(movement.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-2">
                        {getMovementIcon(movement.movement_type)}
                        {getMovementLabel(movement.movement_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{movement.products?.name}</div>
                        <div className="text-xs text-muted-foreground">{movement.products?.sku}</div>
                      </div>
                    </TableCell>
                    <TableCell>{movement.warehouses?.name}</TableCell>
                    <TableCell>
                      <span
                        className={`font-medium ${
                          movement.quantity > 0 ? "text-success" : "text-destructive"
                        }`}
                      >
                        {movement.quantity > 0 ? "+" : ""}
                        {movement.quantity}
                      </span>
                    </TableCell>
                    <TableCell>{movement.profiles?.full_name || "System"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{movement.notes || "-"}</TableCell>
                  </TableRow>
                ))}
                {filteredMovements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No movements found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MoveHistory;
