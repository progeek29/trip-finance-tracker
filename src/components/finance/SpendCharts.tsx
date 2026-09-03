import React, { useState } from 'react';
import { Expense, Trip } from '../../types';
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  Legend, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid 
} from 'recharts';
import { PieChart as PieIcon, BarChart3, TrendingUp, Layers } from 'lucide-react';

interface SpendChartsProps {
  trip: Trip;
  expenses: Expense[];
}

const CATEGORY_COLORS: { [key: string]: string } = {
  stay: '#6366f1',       // Indigo
  food: '#f59e0b',       // Amber
  drinks: '#ec4899',     // Pink
  activities: '#10b981', // Emerald
  transit: '#06b6d4',    // Cyan
  fuel: '#f97316',       // Orange
  shopping: '#8b5cf6',   // Purple
  emergency: '#ef4444',  // Red
  other: '#64748b',      // Slate
};

export const SpendCharts: React.FC<SpendChartsProps> = ({ trip, expenses }) => {
  const [chartType, setChartType] = useState<'category' | 'daily' | 'city'>('category');

  // 1. Prepare Category Data for Donut Chart
  const categoryDataMap: { [key: string]: number } = {};
  expenses.forEach((e) => {
    categoryDataMap[e.category] = (categoryDataMap[e.category] || 0) + e.amount;
  });

  const categoryData = Object.entries(categoryDataMap).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    categoryKey: name,
    value,
    color: CATEGORY_COLORS[name] || '#6366f1',
  })).sort((a, b) => b.value - a.value);

  // 2. Prepare Daily Spending Data for Bar Chart
  const dailyDataMap: { [date: string]: number } = {};
  expenses.forEach((e) => {
    const formattedDate = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dailyDataMap[formattedDate] = (dailyDataMap[formattedDate] || 0) + e.amount;
  });

  const dailyData = Object.entries(dailyDataMap).map(([date, amount]) => ({
    date,
    amount,
  }));

  // 3. Prepare City Comparison Data
  const cityData = trip.cities.map((city) => {
    const cityExpenses = expenses.filter((e) => e.cityId === city.id);
    const spent = cityExpenses.reduce((sum, e) => sum + e.amount, 0);
    return {
      cityName: city.name.split('(')[0].trim(),
      spent,
      budget: city.budget,
    };
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-slate-900/95 border border-white/10 p-3 rounded-xl shadow-xl backdrop-blur-md text-xs">
          <p className="font-bold text-white mb-1">{data.name || data.payload.date || data.payload.cityName}</p>
          <p className="text-indigo-400 font-semibold">
            ₹{(data.value || data.payload.amount || data.payload.spent).toLocaleString('en-IN')}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-card rounded-2xl p-6 border border-white/10 mb-8">
      {/* Header & Toggle Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-white font-display">Expense Breakdown & Trends</h3>
          <p className="text-xs text-slate-400">Visual spending analytics by categories, daily timeline, and destinations</p>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-white/10">
          <button
            onClick={() => setChartType('category')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              chartType === 'category'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PieIcon className="w-3.5 h-3.5" />
            <span>Category</span>
          </button>

          <button
            onClick={() => setChartType('daily')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              chartType === 'daily'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Daily Spend</span>
          </button>

          <button
            onClick={() => setChartType('city')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              chartType === 'city'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>By City</span>
          </button>
        </div>
      </div>

      {/* Chart Visualizer */}
      <div className="h-72 w-full">
        {chartType === 'category' && (
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 h-full">
            <div className="w-full md:w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Category Legend List */}
            <div className="w-full md:w-1/2 grid grid-cols-2 gap-2 overflow-y-auto max-h-56 pr-2">
              {categoryData.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs font-medium text-slate-300">{entry.name}</span>
                  </div>
                  <span className="text-xs font-bold text-white">₹{entry.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {chartType === 'daily' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {chartType === 'city' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="cityName" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} tickFormatter={(v) => `₹${v / 1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar name="Actual Spent" dataKey="spent" fill="#ec4899" radius={[6, 6, 0, 0]} />
              <Bar name="Target Budget" dataKey="budget" fill="#334155" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
