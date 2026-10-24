import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { getToken, setToken } from './api';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import Login from './pages/login';
import NewShipment from './pages/NewShipment';
import ShipmentDetail from './pages/ShipmentDetail';
import Shipments from './pages/Shipment';

function Layout() {
  const nav = useNavigate();
  if (!getToken()) return <Navigate to="/login" replace />;
  return (
    <div className="app">
      <aside>
        <h2>Kiaan Cargo</h2>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/shipments" end>Shipments</NavLink>
        <NavLink to="/shipments/new">New shipment</NavLink>
        <NavLink to="/invoices">Invoices</NavLink>
        <button
          className="ghost"
          onClick={() => {
            setToken(null);
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="shipments/new" element={<NewShipment />} />
          <Route path="shipments/:id" element={<ShipmentDetail />} />
          <Route path="invoices" element={<Invoices />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}