import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
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
import ClearanceJob from './pages/ClearanceJob';
import ClearanceNew from './pages/ClearanceNew';


function Layout() {
  const nav = useNavigate();
  const user = getUser();
  if (!getToken() || !user) return <Navigate to="/login" replace />;
  const role = user.role;
  const agent = role === 'CLEARING_AGENT';
  const freightStaff = role === 'ADMIN' || role === 'OPERATOR';

  return (
    <div className="app">
      <aside>
        <h2>{agent ? 'TNI Enterprises' : 'Kiaan Cargo'}</h2>
        {agent ? (
          <>
            <NavLink to="/clearance" end>Dashboard</NavLink>
            <NavLink to="/clearance/new">New job</NavLink>
            <NavLink to="/clearance/jobs">Jobs</NavLink>
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
          <Route path="clearance" element={getUser()?.role === 'CLEARING_AGENT' ? <ClearanceDashboard /> : <Navigate to="/" replace />} />
          <Route path="clearance/:id" element={getUser()?.role === 'CLEARING_AGENT' ? <ClearanceDetail /> : <Navigate to="/" replace />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="shipments/new" element={<NewShipment />} />
          <Route path="shipments/:id" element={<ShipmentDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="rates" element={<ExchangeRates />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}