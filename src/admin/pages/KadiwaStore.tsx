import { useCallback, useEffect, useState } from 'react';
import { Search, Plus, ShoppingCart, Package, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { UserRole } from '../../app/App';
import { createKadiwaInventory, createKadiwaSale, fetchKadiwaData, restockKadiwaInventory, type KadiwaSaleItem, type KadiwaSummary } from '../../app/services/authApi';
import { useLiveRefresh } from '../../lib/liveUpdates';
import { formatDateTime } from '../../utils/dateTime';

interface Sale {
  id: string;
  date: string;
  encoder: string;
  groceries: number;
  vegetables: number;
  meat: number;
  totalExpenses: number;
  netSales: number;
  paymentMethod: 'cash';
  status: 'completed' | 'pending';
  items: KadiwaSaleItem[];
}

interface InventoryItem {
  id: string;
  name: string;
  category: 'Groceries' | 'Vegetables' | 'Meat' | 'Other';
  stock: number;
  price: number;
  reorderLevel: number;
  unit: string;
}

interface KadiwaStoreProps {
  userRole: UserRole;
}

export function KadiwaStore({ userRole }: KadiwaStoreProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showStockForm, setShowStockForm] = useState(false);
  const [formData, setFormData] = useState({
    encoderName: '',
    groceriesPrice: 0,
    vegetablesPrice: 0,
    meatPrice: 0,
    totalExpenses: 0,
    items: [] as Array<{ inventoryId: string; quantity: string }>
  });
  const [stockFormData, setStockFormData] = useState({
    name: '',
    category: 'Groceries' as InventoryItem['category'],
    stock: 0,
    price: 0,
    reorderLevel: 10,
    unit: 'kg'
  });
  const [sales, setSales] = useState<Sale[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState<'inventory' | 'sales'>('inventory');
  const [summary, setSummary] = useState<KadiwaSummary | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(() => {
    fetchKadiwaData({ limit: 100 })
      .then((data) => {
        setSales(data.sales);
        setInventory(data.inventory);
        setSummary(data.summary);
        setError('');
      })
      .catch((loadError: Error) => setError(loadError.message));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useLiveRefresh(['kadiwa_inventory', 'kadiwa_sales'], loadData);

  const filteredSales = sales.filter(sale =>
    sale.encoder.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Totals are calculated by the server in the cooperative's time zone.
  const todaySales = summary?.todaySales ?? 0;
  const todayRevenue = summary?.todayRevenue ?? 0;
  const totalInventoryUnits = Math.round(inventory.reduce((sum, item) => sum + item.stock * 100, 0)) / 100;
  const lowStockItems = summary?.lowStockItems ?? inventory.filter(item => item.stock <= item.reorderLevel).length;
  const inventoryValue = summary?.inventoryValue ?? 0;
  const itemEstimate = (inventoryId: string, quantity: string) => {
    const product = inventory.find((item) => item.id === inventoryId);
    return product ? Math.round(product.price * Number(quantity || 0) * 100) / 100 : 0;
  };
  const updateSaleItem = (index: number, key: 'inventoryId' | 'quantity', value: string) => setFormData((prev) => ({ ...prev, items: prev.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));

  const canEdit = userRole === 'admin';

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes('Price') ? Number(value) : value
    }));
  };

  const handleStockFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setStockFormData(prev => ({
      ...prev,
      [name]: name === 'stock' || name === 'price' || name === 'reorderLevel'
        ? Number(value)
        : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const response = await createKadiwaSale({ ...formData, items: formData.items.filter((item) => item.inventoryId && item.quantity) });
      toast.success('Sale recorded', { description: `Net sales ₱${response.sale.netSales.toLocaleString('en-PH', { minimumFractionDigits: 2 })}. Inventory updated.` });
      loadData();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to save sale.';
      setError(message);
      toast.error('Unable to save sale', { description: message });
      return;
    } finally {
      setIsSaving(false);
    }
    setFormData({
      encoderName: '',
      groceriesPrice: 0,
      vegetablesPrice: 0,
      meatPrice: 0,
      totalExpenses: 0,
      items: []
    });
    setShowForm(false);
  };

  const handleStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stockFormData.name.trim()) return;

    try {
      await createKadiwaInventory(stockFormData);
      toast.success('Inventory item added');
      loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save inventory item.');
      return;
    }
    setStockFormData({
      name: '',
      category: 'Groceries',
      stock: 0,
      price: 0,
      reorderLevel: 10,
      unit: 'kg'
    });
    setShowStockForm(false);
  };

  const handleRestock = async (itemId: string, quantity: number) => {
    try {
      const response = await restockKadiwaInventory(itemId, quantity);
      setInventory(prev => prev.map(item => item.id === itemId ? response.item : item));
      toast.success(`${response.item.name} restocked`, { description: `New stock: ${response.item.stock} ${response.item.unit}` });
    } catch (restockError) {
      setError(restockError instanceof Error ? restockError.message : 'Unable to restock item.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 mt-1">Manage sales and store stock</p>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowStockForm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-700 rounded-lg hover:bg-blue-50 font-medium"
            >
              <Package className="w-5 h-5" />
              Add Inventory
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              <Plus className="w-5 h-5" />
              New Sale
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Today's Sales</p>
              <p className="text-2xl font-bold text-gray-900">{todaySales}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Today's Revenue</p>
              <p className="text-2xl font-bold text-gray-900">₱{todayRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveSection('inventory')}
          aria-pressed={activeSection === 'inventory'}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeSection === 'inventory'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package className="h-4 w-4" />
          Store Inventory
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('sales')}
          aria-pressed={activeSection === 'sales'}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
            activeSection === 'sales'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Sales History
        </button>
      </div>

      {activeSection === 'inventory' && <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Store Inventory</h2>
          <span className="text-sm text-gray-500">Front-end only</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm text-blue-700">Total Stock</p>
            <p className="text-2xl font-bold text-blue-900">{totalInventoryUnits}</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
            <p className="text-sm text-amber-700">Low Stock</p>
            <p className="text-2xl font-bold text-amber-900">{lowStockItems}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4">
            <p className="text-sm text-emerald-700">Inventory Value</p>
            <p className="text-2xl font-bold text-emerald-900">₱{inventoryValue.toLocaleString()}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="pb-3 pr-4 font-medium">Item</th>
                <th className="pb-3 pr-4 font-medium">Category</th>
                <th className="pb-3 pr-4 font-medium">Stock</th>
                <th className="pb-3 pr-4 font-medium">Unit Price</th>
                <th className="pb-3 pr-4 font-medium">Reorder</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(item => {
                const isLowStock = item.stock <= item.reorderLevel;

                return (
                  <tr key={item.id} className="border-b border-gray-100 align-middle">
                    <td className="py-3 pr-4">
                      <div>
                        <p className="font-semibold text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.unit}</p>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{item.category}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        isLowStock ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {item.stock} {item.unit}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-700">₱{item.price.toLocaleString()}</td>
                    <td className="py-3 pr-4 text-gray-700">{item.reorderLevel}</td>
                    <td className="py-3">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => handleRestock(item.id, 10)}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 text-xs font-medium"
                        >
                          +10 Stock
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {activeSection === 'sales' && <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Sales History</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search sales..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            {filteredSales.map((sale) => (
              <div key={sale.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-gray-900">{sale.id}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        sale.status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {sale.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Encoder: {sale.encoder}</p>
                    <p className="text-sm text-gray-500">{formatDateTime(sale.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Total Sales</p>
                    <p className="text-2xl font-bold text-gray-900">₱{(sale.groceries + sale.vegetables + sale.meat).toLocaleString()}</p>
                    <p className="text-xs text-gray-600 mt-2">Expenses: ₱{sale.totalExpenses.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{sale.paymentMethod}</p>
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-3">
                  <p className="text-xs text-gray-500 mb-2">Sales by Type:</p>
                  <div className="space-y-1">
                    {sale.groceries > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Groceries</span>
                        <span className="text-gray-900">₱{sale.groceries.toLocaleString()}</span>
                      </div>
                    )}
                    {sale.vegetables > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Vegetables</span>
                        <span className="text-gray-900">₱{sale.vegetables.toLocaleString()}</span>
                      </div>
                    )}
                    {sale.meat > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Meat</span>
                        <span className="text-gray-900">₱{sale.meat.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 mt-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Total Expenses</span>
                        <span className="text-gray-700">₱{sale.totalExpenses.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium text-green-600 mt-1">
                        <span>Net Sales</span>
                        <span>₱{sale.netSales.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>}

      {showForm && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add New Sale</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Encoder Name
                  </label>
                  <input
                    type="text"
                    name="encoderName"
                    value={formData.encoderName}
                    onChange={handleFormChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                    placeholder="Enter encoder name"
                  />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 mt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Items Sold from Inventory</h3>
                  <button type="button" onClick={() => setFormData((prev) => ({ ...prev, items: [...prev.items, { inventoryId: '', quantity: '' }] }))} className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800"><Plus className="w-4 h-4" />Add item</button>
                </div>
                {formData.items.length === 0 && <p className="text-xs text-gray-500">Items added here are deducted from stock when the sale is saved.</p>}
                <div className="space-y-3">
                  {formData.items.map((item, index) => {
                    const product = inventory.find((candidate) => candidate.id === item.inventoryId);
                    return (
                      <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-end">
                        <label className="block text-sm font-medium text-gray-700">Product
                          <select value={item.inventoryId} onChange={(e) => updateSaleItem(index, 'inventoryId', e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600">
                            <option value="">Select product</option>
                            {inventory.map((option) => <option key={option.id} value={option.id} disabled={option.stock <= 0}>{option.name} — ₱{option.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}/{option.unit} ({option.stock} in stock)</option>)}
                          </select>
                        </label>
                        <label className="block text-sm font-medium text-gray-700">Quantity
                          <input type="number" min="0.01" step="0.01" max={product?.stock} value={item.quantity} onChange={(e) => updateSaleItem(index, 'quantity', e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600" />
                        </label>
                        <div className="flex items-center gap-3 pb-2 text-sm text-gray-700">
                          <span>₱{itemEstimate(item.inventoryId, item.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
                          <button type="button" onClick={() => setFormData((prev) => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) }))} className="text-red-600 hover:text-red-700" aria-label="Remove item"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Other Sales by Type</h3>
                <p className="text-xs text-gray-500 mb-4">For goods not tracked in inventory. Inventory items above are added to their category automatically.</p>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Groceries (₱)
                    </label>
                    <input
                      type="number"
                      name="groceriesPrice"
                      value={formData.groceriesPrice}
                      onChange={handleFormChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vegetables (₱)
                    </label>
                    <input
                      type="number"
                      name="vegetablesPrice"
                      value={formData.vegetablesPrice}
                      onChange={handleFormChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Meat (₱)
                    </label>
                    <input
                      type="number"
                      name="meatPrice"
                      value={formData.meatPrice}
                      onChange={handleFormChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Total Expenses (₱)
                    </label>
                    <input
                      type="number"
                      name="totalExpenses"
                      value={formData.totalExpenses}
                      onChange={handleFormChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">
                    Total Sales: <span className="text-lg font-bold text-gray-900">₱{(formData.groceriesPrice + formData.vegetablesPrice + formData.meatPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Total Expenses: <span className="text-lg font-bold text-gray-900">₱{formData.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                  <p className="text-sm text-gray-600 border-t border-gray-200 pt-2">
                    Net Sales: <span className="text-lg font-bold text-green-600">₱{(formData.groceriesPrice + formData.vegetablesPrice + formData.meatPrice - formData.totalExpenses).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                </div>
                <p className="text-sm text-gray-600 mt-3">
                  Payment Method: <span className="font-medium">Cash</span>
                </p>
              </div>

              <div className="flex gap-3 border-t border-gray-200 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
                >
                  Complete Sale
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showStockForm && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Inventory Item</h2>
              <button
                type="button"
                onClick={() => setShowStockForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStockSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={stockFormData.name}
                  onChange={handleStockFormChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="e.g. Rice"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    name="category"
                    value={stockFormData.category}
                    onChange={handleStockFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="Groceries">Groceries</option>
                    <option value="Vegetables">Vegetables</option>
                    <option value="Meat">Meat</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    name="unit"
                    value={stockFormData.unit}
                    onChange={handleStockFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="kg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stock
                  </label>
                  <input
                    type="number"
                    name="stock"
                    value={stockFormData.stock}
                    onChange={handleStockFormChange}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit Price
                  </label>
                  <input
                    type="number"
                    name="price"
                    value={stockFormData.price}
                    onChange={handleStockFormChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reorder Level
                  </label>
                  <input
                    type="number"
                    name="reorderLevel"
                    value={stockFormData.reorderLevel}
                    onChange={handleStockFormChange}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
                >
                  Save Inventory
                </button>
                <button
                  type="button"
                  onClick={() => setShowStockForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
