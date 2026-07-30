import { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Calendar,
  CheckCircle2,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

const exportTypes = [
  {
    id: 'transactions',
    name: 'Transaction Export',
    description: 'All transactions with full details for your records',
    icon: FileSpreadsheet,
    formats: ['CSV', 'Excel'],
  },
  {
    id: 'summary',
    name: 'Summary Export',
    description: 'Monthly/quarterly totals by category',
    icon: FileText,
    formats: ['CSV', 'Excel', 'PDF'],
  },
  {
    id: 'tax-report',
    name: 'Tax Summary Report',
    description: 'Accountant-ready report with totals and charts',
    icon: FileText,
    formats: ['PDF'],
  },
];

const columnOptions = [
  { id: 'date', label: 'Date', default: true },
  { id: 'orderId', label: 'Order ID', default: true },
  { id: 'itemTitle', label: 'Item Title', default: true },
  { id: 'sku', label: 'SKU', default: false },
  { id: 'category', label: 'Category', default: true },
  { id: 'gross', label: 'Gross Amount', default: true },
  { id: 'fees', label: 'Fees', default: true },
  { id: 'shipping', label: 'Shipping', default: true },
  { id: 'net', label: 'Net Amount', default: true },
  { id: 'tax', label: 'Tax Collected', default: false },
  { id: 'buyerCountry', label: 'Buyer Country', default: false },
];

export default function Exports() {
  const [selectedType, setSelectedType] = useState('transactions');
  const [format, setFormat] = useState('CSV');
  const [dateGrouping, setDateGrouping] = useState('none');
  const [selectedColumns, setSelectedColumns] = useState(
    columnOptions.filter((c) => c.default).map((c) => c.id)
  );

  const toggleColumn = (columnId: string) => {
    setSelectedColumns((prev) =>
      prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]
    );
  };

  const selectedExport = exportTypes.find((t) => t.id === selectedType);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Export Data</h1>
        <p className="text-muted-foreground">
          Generate CSV and PDF reports for your records or accountant
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Export Types */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-heading">Export Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {exportTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`w-full rounded-lg border p-4 text-left transition-all ${
                    selectedType === type.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <type.icon
                      className={`h-5 w-5 ${
                        selectedType === type.id ? 'text-accent' : 'text-muted-foreground'
                      }`}
                    />
                    <div>
                      <p className="font-medium text-foreground">{type.name}</p>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                      <div className="mt-2 flex gap-1">
                        {type.formats.map((f) => (
                          <span
                            key={f}
                            className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Export Options */}
        <div className="lg:col-span-2 space-y-6">
          {/* Date Range & Format */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-heading flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Export Options
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Date Range */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-sm font-medium">Date Range</Label>
                  <Select defaultValue="ytd">
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ytd">Year to Date</SelectItem>
                      <SelectItem value="last-quarter">Last Quarter</SelectItem>
                      <SelectItem value="last-year">Last Year</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedExport?.formats.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Grouping */}
              <div>
                <Label className="text-sm font-medium mb-3 block">Group By</Label>
                <RadioGroup
                  value={dateGrouping}
                  onValueChange={setDateGrouping}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="none" />
                    <Label htmlFor="none" className="font-normal">
                      None (individual transactions)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="month" id="month" />
                    <Label htmlFor="month" className="font-normal">
                      Month
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="quarter" id="quarter" />
                    <Label htmlFor="quarter" className="font-normal">
                      Quarter
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </CardContent>
          </Card>

          {/* Column Selection */}
          {selectedType === 'transactions' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-heading">Columns to Include</CardTitle>
                <CardDescription>Select which fields to include in your export</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {columnOptions.map((column) => (
                    <div key={column.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={column.id}
                        checked={selectedColumns.includes(column.id)}
                        onCheckedChange={() => toggleColumn(column.id)}
                      />
                      <Label htmlFor={column.id} className="font-normal cursor-pointer">
                        {column.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview & Export */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-heading">Ready to Export</CardTitle>
              <CardDescription>
                {selectedType === 'transactions'
                  ? `Exporting ${selectedColumns.length} columns of transaction data`
                  : selectedExport?.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                    <Download className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {selectedExport?.name} ({format})
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Estimated ~1,250 rows · 45 KB
                    </p>
                  </div>
                </div>
                <Button variant="accent" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Exports */}
      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Recent Exports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {[
              { name: 'Tax Summary 2024 Q4.pdf', date: 'Dec 20, 2024', size: '245 KB' },
              { name: 'Transactions Nov 2024.csv', date: 'Dec 1, 2024', size: '128 KB' },
              { name: 'Category Summary 2024.xlsx', date: 'Nov 15, 2024', size: '89 KB' },
            ].map((file, i) => (
              <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                    {file.name.endsWith('.pdf') ? (
                      <FileText className="h-4 w-4 text-destructive" />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4 text-success" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.date} · {file.size}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
