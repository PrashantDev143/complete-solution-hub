import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, AlertTriangle, TruckIcon, FileText, ArrowRightLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DashboardStats {
  totalProducts: number;
  lowStockItems: number;
  pendingReceipts: number;
  pendingDeliveries: number;
  scheduledTransfers: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    lowStockItems: 0,
    pendingReceipts: 0,
    pendingDeliveries: 0,
    scheduledTransfers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get total products
      const { count: productsCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true });

      // Get low stock items
      const { data: stockLevels } = await supabase
        .from("stock_levels")
        .select("*, products!inner(reorder_level)")
        .lte("quantity", 10);

      // Get pending receipts
      const { count: receiptsCount } = await supabase
        .from("receipts")
        .select("*", { count: "exact", head: true })
        .in("status", ["draft", "waiting", "ready"]);

      // Get pending deliveries
      const { count: deliveriesCount } = await supabase
        .from("deliveries")
        .select("*", { count: "exact", head: true })
        .in("status", ["draft", "waiting", "ready"]);

      // Get scheduled transfers
      const { count: transfersCount } = await supabase
        .from("internal_transfers")
        .select("*", { count: "exact", head: true })
        .in("status", ["draft", "waiting", "ready"]);

      setStats({
        totalProducts: productsCount || 0,
        lowStockItems: stockLevels?.length || 0,
        pendingReceipts: receiptsCount || 0,
        pendingDeliveries: deliveriesCount || 0,
        scheduledTransfers: transfersCount || 0,
      });
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your inventory operations</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">In stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.lowStockItems}</div>
            <p className="text-xs text-muted-foreground">Need reordering</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Receipts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingReceipts}</div>
            <p className="text-xs text-muted-foreground">Incoming stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Deliveries</CardTitle>
            <TruckIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingDeliveries}</div>
            <p className="text-xs text-muted-foreground">Outgoing stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Internal Transfers</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scheduledTransfers}</div>
            <p className="text-xs text-muted-foreground">Scheduled</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline" className="cursor-pointer hover:bg-accent">
            <a href="/products">Manage Products</a>
          </Badge>
          <Badge variant="outline" className="cursor-pointer hover:bg-accent">
            <a href="/receipts">Create Receipt</a>
          </Badge>
          <Badge variant="outline" className="cursor-pointer hover:bg-accent">
            <a href="/deliveries">Create Delivery</a>
          </Badge>
          <Badge variant="outline" className="cursor-pointer hover:bg-accent">
            <a href="/transfers">Create Transfer</a>
          </Badge>
          <Badge variant="outline" className="cursor-pointer hover:bg-accent">
            <a href="/adjustments">Adjust Stock</a>
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
