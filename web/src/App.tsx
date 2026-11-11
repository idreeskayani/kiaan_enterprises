import { useState } from 'react';
import type { ReactNode } from 'react';
import Dashboard from './pages/Dashboard';
import ExchangeRates from './pages/ExchangeRates';
import Invoices from './pages/Invoices';
import Debits from './pages/Debits';
import Login from './pages/login';
import NewShipment from './pages/NewShipment';
import ShipmentDetail from './pages/ShipmentDetail';
import Users from './pages/Users';
import Shipments from './pages/Shipment';
import Quotations from './pages/Quotations';
import QuotationDetail from './pages/QuotationDetails';
import { api, getToken, getUser, setToken, setUser } from './api';
import ClearanceDetail from './pages/ClearanceDetail';
import ClearanceDashboard from './pages/ClearanceDashboard';
import ClearanceInvoices from './pages/ClearanceInvoices';
import ClearanceNew from './pages/ClearanceNew';
import Reports from './pages/Reports';
import Backdrop from './Backdrop';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';


function Layout() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const user = getUser();
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem('sidebar');
    return saved ? saved === 'open' : window.innerWidth >= 900;
  });
  const toggleMenu = () => {
    localStorage.setItem('sidebar', open ? 'closed' : 'open');
    setOpen(!open);
  };
  if (!getToken() || !user) return <Navigate to="/login" replace />;
  const role = user.role;
  const admin = role === 'ADMIN';
  const agent = role === 'CLEARING_AGENT';
  const freightStaff = role === 'OPERATOR';

  // admin only ever sees the Users page; nobody else can open it
  if (admin && pathname !== '/users') return <Navigate to="/users" replace />;
  if (!admin && pathname === '/users') return <Navigate to="/" replace />;

  async function returnToAdmin() {
    try {
      const r = await api('/auth/return-to-admin', { method: 'POST' });
      setToken(r.accessToken);
      setUser(r.user);
      nav('/users');
    } catch (e) {
      window.alert((e as Error).message);
    }
  }

  return (
    <div className={`app${open ? '' : ' collapsed'}`}>
      <Backdrop />
      <aside>
        <div className="side-head">
          <h2 className="brand">
            <img
              className="brand-logo"
              src={agent ? '/images/tni-logo.png' : '/images/kiaan-mark.png'}
              alt={agent ? 'TNI Enterprises' : 'Kiaan Freight Services'}
            />
            {agent ? 'TNI Enterprises' : 'Kiaan Freight Services'}
          </h2>
          <button type="button" className="icon-btn" onClick={toggleMenu} title="Hide menu" aria-label="Hide menu">«</button>
        </div>
        {admin ? (
          <NavLink to="/users">Users</NavLink>
        ) : agent ? (
          <>
            <NavLink to="/clearance" end>Dashboard</NavLink>
            <NavLink to="/clearance/new">New invoice</NavLink>
            <NavLink to="/clearance/invoices">Invoices</NavLink>
            <NavLink to="/reports">Reports</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/shipments" end>Shipments</NavLink>
            <NavLink to="/quotations">Quotations</NavLink>
            {freightStaff && <NavLink to="/shipments/new">Create new</NavLink>}
            <NavLink to="/invoices">Invoices</NavLink>
            <NavLink to="/debits">Debits</NavLink>
            <NavLink to="/reports">Reports</NavLink>
            <NavLink to="/rates">Exchange rates</NavLink>
          </>
        )}
        <div className="muted" style={{ color: '#94a3b8', marginTop: 12 }}>{user.email}</div>
        <button
          className="ghost"
          onClick={() => {
            setToken(null);
            setUser(null);
            nav('/login');
          }}
        >
          Log out
        </button>
      </aside>
      <main>
        <button type="button" className="icon-btn menu-toggle" onClick={toggleMenu} title="Show menu" aria-label="Show menu">☰</button>
        {user.impersonating && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
              padding: '8px 12px',
              background: '#eef2ff',
              borderRadius: 8,
            }}
          >
            <span className="muted">Working as {user.email}</span>
            <button type="button" onClick={returnToAdmin}>Return to admin</button>
          </div>
        )}
        <div className="page" key={pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Only({ role, children }: { role: string; children: ReactNode }) {
  return getUser()?.role === role ? <>{children}</> : <Navigate to="/" replace />;
}

function Home() {
  return getUser()?.role === 'CLEARING_AGENT' ? <Navigate to="/clearance" replace /> : <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route index element={<Home />} />

          {/* clearance agent only */}
          <Route path="clearance" element={<Only role="CLEARING_AGENT"><ClearanceDashboard /></Only>} />
          <Route path="clearance/new" element={<Only role="CLEARING_AGENT"><ClearanceNew /></Only>} />
          <Route path="clearance/jobs/:id" element={<Only role="CLEARING_AGENT"><ClearanceDetail /></Only>} />
          <Route path="clearance/invoices" element={<Only role="CLEARING_AGENT"><ClearanceInvoices /></Only>} />

          {/* freight side */}
          <Route path="quotations" element={<Quotations />} />
          <Route path="quotations/:id" element={<QuotationDetail />} />
          <Route path="quotations/:id/edit" element={<NewShipment />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="shipments/new" element={<NewShipment />} />
          <Route path="shipments/:id" element={<ShipmentDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="debits" element={<Debits />} />
          <Route path="reports" element={<Reports />} />
          <Route path="invoices/:id/edit" element={<NewShipment />} />
          <Route path="rates" element={<ExchangeRates />} />

          {/* admin only (Layout already blocks everyone else) */}
          <Route path="users" element={<Users />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}