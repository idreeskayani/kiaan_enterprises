import type { ReactNode } from 'react';
import Dashboard from './pages/Dashboard';
import ExchangeRates from './pages/ExchangeRates';
import Invoices from './pages/Invoices';
import Login from './pages/login';
import NewShipment from './pages/NewShipment';
import ShipmentDetail from './pages/ShipmentDetail';
import Shipments from './pages/Shipment';
import { getToken, getUser, setToken, setUser } from './api';
import ClearanceDetail from './pages/ClearanceDetail';
import ClearanceDashboard from './pages/ClearanceDashboard';
import ClearanceInvoices from './pages/ClearanceInvoices';
import ClearanceNew from './pages/ClearanceNew';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

function Users() {
  return <h1>Users</h1>;
}


function Layout() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const user = getUser();
  if (!getToken() || !user) return <Navigate to="/login" replace />;
  const role = user.role;
  const admin = role === 'ADMIN';
  const agent = role === 'CLEARING_AGENT';
  const freightStaff = role === 'OPERATOR';

  // admin only ever sees the Users page; nobody else can open it
  if (admin && pathname !== '/users') return <Navigate to="/users" replace />;
  if (!admin && pathname === '/users') return <Navigate to="/" replace />;

  return (
    <div className="app">
      <aside>
        <h2>{agent ? 'TNI Enterprises' : 'Kiaan Cargo'}</h2>
        {admin ? (
          <NavLink to="/users">Users</NavLink>
        ) : agent ? (
          <>
            <NavLink to="/clearance" end>Dashboard</NavLink>
            <NavLink to="/clearance/new">New invoice</NavLink>
            <NavLink to="/clearance/invoices">Invoices</NavLink>
          </>
        ) : (
          <>
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/shipments" end>Shipments</NavLink>
            {freightStaff && <NavLink to="/shipments/new">New shipment</NavLink>}
            <NavLink to="/invoices">Invoices</NavLink>
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
        <Outlet />
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
          <Route path="shipments" element={<Shipments />} />
          <Route path="shipments/new" element={<NewShipment />} />
          <Route path="shipments/:id" element={<ShipmentDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="rates" element={<ExchangeRates />} />

          {/* admin only (Layout already blocks everyone else) */}
          <Route path="users" element={<Users />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}