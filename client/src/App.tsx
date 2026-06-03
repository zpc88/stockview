import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Spin } from 'antd';
import { useAuthStore } from './stores/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StockPage from './pages/StockPage';
import FundPage from './pages/FundPage';
import InvestmentPage from './pages/InvestmentPage';
import TagPage from './pages/TagPage';
import MarketPage from './pages/MarketPage';
import USStockPage from './pages/USStockPage';
import HKStockPage from './pages/HKStockPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  const { loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="/stocks" replace />} />
          <Route path="stocks" element={<StockPage />} />
          <Route path="funds" element={<FundPage />} />
          <Route path="us-stocks" element={<USStockPage />} />
          <Route path="hk-stocks" element={<HKStockPage />} />
          <Route path="investments" element={<InvestmentPage />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="tags" element={<TagPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
