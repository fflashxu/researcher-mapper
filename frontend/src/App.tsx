import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ResearcherPoolPage from './pages/ResearcherPoolPage';
import SettingsPage from './pages/SettingsPage';
import './index.css';

function Nav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`;
  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-7xl mx-auto flex items-center gap-1 h-12">
        <span className="text-sm font-semibold text-gray-900 mr-4">Researcher Mapper</span>
        <NavLink to="/" end className={cls}>Projects</NavLink>
        <NavLink to="/pool" className={cls}>All Researchers</NavLink>
        <NavLink to="/settings" className={cls}>Settings</NavLink>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Nav />
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/pool" element={<ResearcherPoolPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
