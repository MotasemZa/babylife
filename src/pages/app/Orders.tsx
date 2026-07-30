import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Search, Eye, CheckCircle, AlertCircle } from "lucide-react";
import { useData } from "@/contexts/DataContext";
import { format } from "date-fns";
import { OrderDetailSheet } from "@/components/orders/OrderDetailSheet";
import { Transaction } from "@/lib/demo-data";

export default function Orders() {
  const { user } = useAuth();
  const { transactions } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Transaction | null>(null);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);

  // Get orders from transactions (sales only)
  const orders = transactions.filter(t => t.type === "sale");
  const filteredOrders = orders.filter(order => 
    order.itemTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    order.orderId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            View your order history from all connected platforms
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Order History</CardTitle>
              <CardDescription>{filteredOrders.length} orders total</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">No orders found</h3>
              <p className="text-muted-foreground">
                Orders will appear here after syncing with your connected platforms.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.slice(0, 50).map((order) => {
                  const hasEbayTax = (order.taxCollected || 0) > 0;
                  return (
                    <TableRow 
                      key={order.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedOrder(order);
                        setOrderSheetOpen(true);
                      }}
                    >
                      <TableCell>{format(new Date(order.date), "MMM dd, yyyy")}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {order.orderId ? `${order.orderId.substring(0, 12)}...` : "-"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {order.itemTitle || "-"}
                      </TableCell>
                      <TableCell>{order.quantity || 1}</TableCell>
                      <TableCell>{formatCurrency(order.gross)}</TableCell>
                      <TableCell className="font-medium">{formatCurrency(order.net)}</TableCell>
                      <TableCell>
                        {hasEbayTax ? (
                          <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            eBay
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            None
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {filteredOrders.length > 50 && (
            <p className="text-sm text-muted-foreground text-center mt-4">
              Showing 50 of {filteredOrders.length} orders
            </p>
          )}
        </CardContent>
      </Card>

      {/* Order Detail Sheet */}
      <OrderDetailSheet
        order={selectedOrder}
        open={orderSheetOpen}
        onOpenChange={setOrderSheetOpen}
      />
    </div>
  );
}
